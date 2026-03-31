// Please see the note about writing patches in ./index

import { CustomTool } from '../types';
import {
  showDiff,
  getRequireFuncName,
  getCwdFuncName,
  findBuildToolFunc,
  getReactVar,
  findTextComponent,
  findBoxComponent,
} from './index';

// ============================================================================
// BUILT-IN TOOL NAME COLLISION GUARD
// ============================================================================

const BUILTIN_TOOL_NAMES = new Set([
  'Agent', 'AskUserQuestion', 'Bash', 'Brief', 'SendUserMessage', 'Config',
  'CronCreate', 'CronDelete', 'CronList', 'Edit', 'EnterPlanMode', 'EnterWorktree',
  'ExitPlanMode', 'ExitWorktree', 'Glob', 'Grep', 'LSP', 'ListMcpResourcesTool',
  'NotebookEdit', 'PowerShell', 'REPL', 'Read', 'ReadMcpResource', 'RemoteTrigger',
  'Skill', 'Sleep', 'SendMessage', 'StructuredOutput', 'Task', 'TaskCreate',
  'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'TeamCreate',
  'TeamDelete', 'TodoWrite', 'ToolSearch', 'WebFetch', 'WebSearch', 'Write',
]);

// ============================================================================
// PROMPT GENERATION
// ============================================================================

const generatePromptString = (tool: CustomTool): string => {
  if (tool.prompt) {
    return tool.prompt;
  }

  const lines: string[] = [tool.description, ''];

  const paramEntries = Object.entries(tool.parameters);
  if (paramEntries.length > 0) {
    lines.push('Parameters:');
    for (const [name, param] of paramEntries) {
      const req = param.required !== false ? 'required' : 'optional';
      lines.push(`- ${name} (${param.type}, ${req}): ${param.description}`);
    }
    lines.push('');
  }

  lines.push(
    'This tool executes a shell command and returns its output.',
    `Command template: ${tool.command}`,
    '',
    'Output is returned as plain text. Exit code, stderr, and stdout are all reported.'
  );

  if (tool.timeout !== undefined) {
    lines.push(`Timeout: ${tool.timeout}ms`);
  }

  return lines.join('\n');
};

// ============================================================================
// CODE GENERATION
// ============================================================================

/**
 * Generate a buildTool({...}) call for a single custom tool.
 *
 * Mirrors how every native CC tool is built: Tool.ts's buildTool() spreads
 * TOOL_DEFAULTS onto the definition and sets userFacingName to () => def.name.
 * By calling the minified buildTool we automatically inherit any defaults CC
 * adds in future versions without patching this code.
 *
 * inputSchema is a duck-typed passthrough satisfying the two call sites:
 *   toolExecution.ts: tool.inputSchema.safeParse(input)
 *   permissions.ts:   tool.inputSchema.parse(input)
 * Real type validation is done in validateInput where errors surface properly.
 *
 * renderToolUseMessage and renderToolResultMessage use React.createElement
 * with the detected Text/Box components, matching the rendering approach of
 * every other CC tool.
 */
const generateToolObject = (
  tool: CustomTool,
  buildToolFunc: string,
  reactVar: string,
  textComponent: string,
  boxComponent: string,
  requireFunc: string,
  cwdFunc: string | undefined
): string => {
  const nameJson = JSON.stringify(tool.name);
  const promptString = generatePromptString(tool);
  const promptJson = JSON.stringify(promptString);
  const descJson = JSON.stringify(tool.description);
  const cmdJson = JSON.stringify(tool.command);
  const shellJson = JSON.stringify(tool.shell ?? 'sh');
  const timeoutVal = tool.timeout ?? 30000;
  const workingDirExpr = tool.workingDir
    ? JSON.stringify(tool.workingDir)
    : cwdFunc
      ? `${cwdFunc}()`
      : 'process.cwd()';
  const extraEnvJson = JSON.stringify(tool.env ?? {});

  // Build inputJSONSchema from parameters
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];
  for (const [paramName, param] of Object.entries(tool.parameters)) {
    properties[paramName] = { type: param.type, description: param.description };
    if (param.required !== false) {
      required.push(paramName);
    }
  }
  const schemaJson = JSON.stringify({ type: 'object', properties, required });

  // Parameter substitution helpers — two variants for different variable names
  const makeSubst = (varName: string): string =>
    Object.keys(tool.parameters)
      .map(k => `cmd=cmd.replace(/\\{\\{${k}\\}\\}/g,String(${varName}[${JSON.stringify(k)}]??""));`)
      .join('');
  const argsSubst = makeSubst('args');
  const inputSubst = makeSubst('input');

  // Safe substitution (try/catch per param) for renderToolUseMessage, which
  // receives partial input while the model is still streaming parameters.
  const safeInputSubst = Object.keys(tool.parameters)
    .map(k => `try{cmd=cmd.replace(/\\{\\{${k}\\}\\}/g,String(input[${JSON.stringify(k)}]??"?"));}catch(_){}`)
    .join('');

  // validateInput: type-check declared parameters
  const paramValidations = Object.entries(tool.parameters)
    .map(([k, p]) => {
      const kJson = JSON.stringify(k);
      const typeJson = JSON.stringify(p.type);
      if (p.required !== false) {
        return `if(input[${kJson}]==null)return{result:false,message:${JSON.stringify(`${k} is required`)},errorCode:1};`
             + `if(typeof input[${kJson}]!==${typeJson})return{result:false,message:${JSON.stringify(`${k} must be a ${p.type}`)},errorCode:1};`;
      }
      return `if(input[${kJson}]!=null&&typeof input[${kJson}]!==${typeJson})return{result:false,message:${JSON.stringify(`${k} must be a ${p.type}`)},errorCode:1};`;
    })
    .join('');

  const R = reactVar;
  const T = textComponent;
  const B = boxComponent;

  return `${buildToolFunc}({
name:${nameJson},
maxResultSizeChars:100000,
inputJSONSchema:${schemaJson},
inputSchema:{safeParse:(i)=>({success:true,data:i}),parse:(i)=>i},
async description(){return ${descJson}},
async prompt(){return ${promptJson}},
isConcurrencySafe(){return false},
isReadOnly(){return false},
toAutoClassifierInput(input){
  let cmd=${cmdJson};
  ${inputSubst}
  return cmd;
},
checkPermissions(input,context){
  let cmd=${cmdJson};
  ${inputSubst}
  const bashTool=context.options.tools.find(t=>t.name==="Bash");
  if(bashTool)return bashTool.checkPermissions({command:cmd,timeout:${timeoutVal}},context);
  return Promise.resolve({behavior:"passthrough",message:"Permission required to run "+${nameJson}});
},
async validateInput(input){
  ${paramValidations}
  return{result:true};
},
renderToolUseMessage(input){
  let cmd=${cmdJson};
  ${safeInputSubst}
  return ${R}.createElement(${B},{flexDirection:"column"},
    ${R}.createElement(${T},{bold:true},${nameJson}),
    ${R}.createElement(${T},{dimColor:true},cmd)
  );
},
renderToolResultMessage(content){
  const c=typeof content==="object"&&content!==null?content:{stdout:String(content),stderr:"",exitCode:0};
  const parts=[];
  if(c.stdout)parts.push(${R}.createElement(${T},null,c.stdout));
  if(c.stderr)parts.push(${R}.createElement(${T},{color:"warning"},"[stderr]\\n"+c.stderr));
  if(c.exitCode!==0&&c.exitCode!=null)parts.push(${R}.createElement(${T},{color:"error"},"[exit code: "+c.exitCode+"]"));
  if(!parts.length)parts.push(${R}.createElement(${T},{dimColor:true},"(no output)"));
  return ${R}.createElement(${B},{flexDirection:"column"},...parts);
},
async call(args){
  let cmd=${cmdJson};
  ${argsSubst}
  const {spawnSync}=${requireFunc}("child_process");
  const result=spawnSync(${shellJson},["-c",cmd],{
    encoding:"utf8",
    timeout:${timeoutVal},
    cwd:${workingDirExpr},
    env:{...process.env,...${extraEnvJson}},
    stdio:["ignore","pipe","pipe"]
  });
  if(result.error)return{data:{stdout:"",stderr:result.error.message,exitCode:-1}};
  return{data:{stdout:(result.stdout||"").trimEnd(),stderr:(result.stderr||"").trimEnd(),exitCode:result.status??-1}};
},
mapToolResultToToolResultBlockParam(content,toolUseID){
  const c=typeof content==="object"&&content!==null?content:{stdout:String(content),stderr:"",exitCode:0};
  const parts=[];
  if(c.stdout)parts.push(c.stdout);
  if(c.stderr)parts.push("[stderr]\\n"+c.stderr);
  if(c.exitCode!==0&&c.exitCode!=null)parts.push("[exit code: "+c.exitCode+"]");
  return{type:"tool_result",tool_use_id:toolUseID,content:parts.join("\\n")||"(no output)"};
}
})`;
};

const generateCustomToolsArray = (
  tools: CustomTool[],
  buildToolFunc: string,
  reactVar: string,
  textComponent: string,
  boxComponent: string,
  requireFunc: string,
  cwdFunc: string | undefined
): string => {
  const toolObjects = tools.map(t =>
    generateToolObject(t, buildToolFunc, reactVar, textComponent, boxComponent, requireFunc, cwdFunc)
  );
  return `[${toolObjects.join(',')}]`;
};

// ============================================================================
// PATCH
// ============================================================================

/**
 * Inject custom tools into Claude Code's tool list.
 *
 * Two injection strategies depending on whether the toolsets patch ran first:
 *
 * Strategy A — toolsets patch was already applied:
 *   Appends custom tools to the toolset-filtered variable after the else block,
 *   so all branches (filtered or not) receive the custom tools.
 *
 * Strategy B — original code (no toolsets patch):
 *   Spreads custom tools into the tool aggregation array directly.
 */
export const writeCustomTools = (
  oldFile: string,
  customTools: CustomTool[]
): string | null => {
  if (!customTools || customTools.length === 0) {
    return oldFile;
  }

  for (const tool of customTools) {
    if (BUILTIN_TOOL_NAMES.has(tool.name)) {
      console.error(
        `patch: customTools: tool "${tool.name}" collides with a built-in CC tool name — rename it`
      );
      return null;
    }
  }

  const buildToolFunc = findBuildToolFunc(oldFile);
  if (!buildToolFunc) {
    console.error('patch: customTools: failed to find buildTool function');
    return null;
  }

  const reactVar = getReactVar(oldFile);
  if (!reactVar) {
    console.error('patch: customTools: failed to find React variable');
    return null;
  }

  const textComponent = findTextComponent(oldFile);
  if (!textComponent) {
    console.error('patch: customTools: failed to find Text component');
    return null;
  }

  const boxComponent = findBoxComponent(oldFile);
  if (!boxComponent) {
    console.error('patch: customTools: failed to find Box component');
    return null;
  }

  const requireFunc = getRequireFuncName(oldFile);
  const cwdFunc = getCwdFuncName(oldFile);
  if (!cwdFunc) {
    console.warn('patch: customTools: could not detect session cwd function; falling back to process.cwd()');
  }

  const toolsArrayCode = generateCustomToolsArray(
    customTools,
    buildToolFunc,
    reactVar,
    textComponent,
    boxComponent,
    requireFunc,
    cwdFunc
  );

  // ------------------------------------------------------------------
  // Strategy A: toolsets patch was already applied.
  // Pattern: } else {\n  VAR = assembleCall;\n}let
  // Insert VAR=[...VAR,...customTools]; right before the trailing `let `.
  // ------------------------------------------------------------------
  const toolsetsPattern =
    /\}\s*else\s*\{\s*([$\w]+)\s*=\s*([$\w]+\([$\w]+,[$\w]+\.tools,[$\w]+\))\s*;\s*\}let /;
  const toolsetsMatch = oldFile.match(toolsetsPattern);

  if (toolsetsMatch && toolsetsMatch.index !== undefined) {
    const toolAggVar = toolsetsMatch[1];
    const insertAt =
      toolsetsMatch.index + toolsetsMatch[0].length - 'let '.length;
    const injectionCode = `${toolAggVar}=[...${toolAggVar},...${toolsArrayCode}];`;

    const newFile =
      oldFile.slice(0, insertAt) + injectionCode + oldFile.slice(insertAt);

    showDiff(oldFile, newFile, injectionCode, insertAt, insertAt);
    return newFile;
  }

  // ------------------------------------------------------------------
  // Strategy B: original code (no toolsets patch).
  // Pattern: let VAR=assembleCall(a,b.tools,c),
  // ------------------------------------------------------------------
  const originalPattern =
    /let ([$\w]+)=([$\w]+\([$\w]+,[$\w]+\.tools,[$\w]+\)),/;
  const originalMatch = oldFile.match(originalPattern);

  if (!originalMatch || originalMatch.index === undefined) {
    console.error('patch: customTools: failed to find tool aggregation pattern');
    return null;
  }

  const toolAggVar = originalMatch[1];
  const toolAggCode = originalMatch[2];
  const startIndex = originalMatch.index;
  const endIndex = startIndex + originalMatch[0].length;

  const replacement = `let ${toolAggVar}=[...${toolAggCode},...${toolsArrayCode}],`;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};
