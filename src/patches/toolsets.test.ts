import { describe, expect, it } from 'vitest';

import {
  addCurrentToolsetAtToolChangeComponentScope,
  findCurrentToolsetInjectionSpan,
  findSelectComponentName,
  insertShiftTabAppStateVar,
  writeToolsetFieldToAppState,
  appendToolsetToModeDisplay,
  appendToolsetToShortcutsDisplay,
  writeComputeToolsFilter,
  writePrintToolsFilter,
  writeSubagentResolvedToolContextFix,
  writeTaskAgentFrontmatterToolsFix,
  writeToolFetchingUseMemo,
  writeModeChangeUpdateToolset,
} from './toolsets';
import { findTextComponent } from './helpers';
import { Toolset } from '../types';

const toolsets: Toolset[] = [
  { name: 'default', allowedTools: ['Read'] },
  { name: 'accept-only', allowedTools: ['Edit'] },
  { name: 'plan-only', allowedTools: ['TodoWrite'] },
];

const appStateVar = 'appState';
const assembledToolsVar = 'assembledTools';
const mergedToolsVar = 'mergedTools';

const appStateAccessors =
  'function useAppState(selector){return `Your selector in ${selector}`}' +
  'function setAppState(){return appStore().setState}';

const computeToolsInput =
  appStateAccessors +
  `computeTools=()=>{let ${appStateVar}=toolStore.getState(),` +
  `${assembledToolsVar}=assemble(${appStateVar}.toolPermissionContext,${appStateVar}.mcp.tools),` +
  `${mergedToolsVar}=merge(baseTools,${assembledToolsVar},${appStateVar}.toolPermissionContext.mode);` +
  `if(!agent)return ${mergedToolsVar};` +
  `return resolve(agent,${mergedToolsVar},!1,!0).resolvedTools}`;

const envDefault = '(process.env.TWEAKCC_TOOLSET_DEFAULT||"default")';
const envAccept = '(process.env.TWEAKCC_TOOLSET_ALLOW_EDITS||"accept-only")';
const envPlan = '(process.env.TWEAKCC_TOOLSET_PLAN||"plan-only")';
const envAuto = `(process.env.TWEAKCC_TOOLSET_AUTO||${envDefault})`;
const fallbackFor = (s: string): string =>
  `${s}.toolPermissionContext?.mode!=="plan"&&${s}.toolsetAutoMode==="plan"?${envDefault}:(${s}.toolset??(${s}.toolPermissionContext?.mode==="plan"?${envPlan}:(${s}.toolPermissionContext?.mode==="acceptEdits"?${envAccept}:(${s}.toolPermissionContext?.mode==="auto"?${envAuto}:${envDefault}))))`;
const modeAwareFallback = fallbackFor('state');
const computeModeAwareFallback = fallbackFor(appStateVar);
const printModeAwareFallback = fallbackFor('s');

describe('toolsets missing state.toolset fallback', () => {
  it('uses the mode-aware fallback in UI tool filtering', () => {
    const file =
      appStateAccessors +
      'let merged=aggregate(firstArg,source.tools,permissionMode),tail';

    const result = writeToolFetchingUseMemo(
      file,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(modeAwareFallback);
  });

  it('uses the mode-aware fallback in computeTools filtering', () => {
    const result = writeComputeToolsFilter(
      computeToolsInput,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(computeModeAwareFallback);
    expect(result).toContain(
      'return t.filter(d=>d.name==="Skill"||a.includes(d.name))'
    );
  });

  it('uses the mode-aware fallback in print-mode tool filtering', () => {
    const file =
      'let tools=computeTools(state);startQuery({tools:tools,refreshTools:()=>computeTools(getState()),canUseTool:allowTool})';

    const result = writePrintToolsFilter(
      file,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(printModeAwareFallback);
    expect(result).toContain(
      'refreshTools:()=>{let s=getState(),u=computeTools(s);__tptu=u;return __tptf(u,s)}'
    );
    expect(result).toContain(
      'canUseTool:async(...a)=>__tptc(a[0],getState())??await allowTool(...a)'
    );
    expect(result).toContain(
      'return t.filter(d=>d.name==="Skill"||a.includes(d.name))'
    );
    expect(result).toContain(
      'if(tool&&tool.name!=="Skill"&&Array.isArray(a)&&!a.includes(tool.name))'
    );
  });

  it('filters 2.1.165 print-mode resolver tools', () => {
    const file =
      'let visibleTools=resolveTools(currentState);' +
      'x'.repeat(3200) +
      'startQuery({tools:visibleTools,refreshTools:()=>resolveTools(getState()),canUseTool:allowTool})';

    const result = writePrintToolsFilter(
      file,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(printModeAwareFallback);
    expect(result).toContain('visibleTools=__tptf(visibleTools,currentState);');
    expect(result).toContain(
      'refreshTools:()=>{let s=getState(),u=resolveTools(s);__tptu=u;return __tptf(u,s)}'
    );
    expect(result).toContain(
      'canUseTool:async(...a)=>__tptc(a[0],getState())??await allowTool(...a)'
    );
  });

  it('filters direct-state print-mode refresh tools', () => {
    const file =
      'let tools=computeTools(state);startQuery({tools:tools,refreshTools:()=>computeTools(state),canUseTool:allowTool})';

    const result = writePrintToolsFilter(
      file,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(printModeAwareFallback);
    expect(result).toContain(
      'refreshTools:()=>{let u=computeTools(state);__tptu=u;return __tptf(u,state)}'
    );
    expect(result).toContain(
      'canUseTool:async(...a)=>__tptc(a[0],state)??await allowTool(...a)'
    );
  });

  it('preserves the initial print-mode tool snapshot', () => {
    const initialSnapshot =
      'let dyn=assembleDynamic(state.mcp.tools,state.toolPermissionContext),initial=[...base,...dyn];toolsRef.current=initial;';
    const file =
      'let tools=computeTools(state);' +
      initialSnapshot +
      'startQuery({tools:tools,refreshTools:()=>computeTools(state),canUseTool:allowTool})';

    const result = writePrintToolsFilter(
      file,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(initialSnapshot);
    expect(result).toContain('let tools=computeTools(state),__tptu=tools;');
    expect(result).not.toContain('initial=__tptf(initial,state)');
  });

  it('preserves unfiltered print-mode tools for latest Task subagents', () => {
    const file =
      'let taskTools=computeTools(state);startQuery({tools:taskTools,' +
      'refreshTools:()=>computeTools(getState()),canUseTool:allowTool,' +
      'availableTools:S,forkContextMessages:void 0,' +
      'options:{tools:childTools,commands:[],debug:false,verbose:false}});' +
      'for await(let event of runQuery({messages:msgs,systemPrompt:sys,' +
      'userContext:user,systemContext:ctx,canUseTool:parentCanUse,' +
      'toolUseContext:childCtx,querySource:source})){}';

    const result = writePrintToolsFilter(
      file,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      'let taskTools=computeTools(state),__tptu=taskTools;'
    );
    expect(result).toContain('taskTools=__tptf(taskTools,state);');
    expect(result).toContain('availableTools:__tptu');
    expect(result).not.toContain('availableTools:S');
  });

  it('uses the mode-aware fallback in the statusline display', () => {
    const file =
      appStateAccessors +
      'function Status({toolPermissionContext:permission}){return render({color:"bashBorder"},"! for shell mode")}';

    const result = insertShiftTabAppStateVar(
      file,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      `let currentToolset=useAppState(state => ${modeAwareFallback});`
    );
  });

  it('finds the statusline insertion point with the jsx-runtime bash hint', () => {
    const file =
      appStateAccessors +
      'function Status(props){return jsxRT.jsx(w,{color:"bashBorder",children:"! for shell mode"})}';

    const result = insertShiftTabAppStateVar(
      file,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      `let currentToolset=useAppState(state => ${modeAwareFallback});`
    );
  });

  it('initializes app state toolset as undefined so the mode binding applies at load', () => {
    const file = 'state={thinkingEnabled:FDH(),promptSuggestionEnabled:rX()}';

    const result = writeToolsetFieldToAppState(file);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'thinkingEnabled:FDH(),toolset:undefined,toolsetAutoMode:null'
    );
    expect(result).not.toContain('toolset:"');
  });

  it('appends the live toolset to every in-scope mode display site', () => {
    const file =
      'function Footer(){let currentToolset=getToolset();' +
      'let k6=el(y,{},sym(mode)," ",title(mode).toLowerCase()," on",hint);' +
      'let NH=el(y,{},sym(mode)," ",title(mode).toLowerCase()," on",chord);' +
      'return k6}';

    const result = appendToolsetToModeDisplay(file);

    expect(result).not.toBeNull();
    expect(result).not.toContain('.toLowerCase()," on"');
    expect(
      result!.match(
        /title\(mode\)\.toLowerCase\(\),currentToolset\?` on \[\$\{currentToolset\}\]`:""/g
      )
    ).toHaveLength(2);
  });

  it('does not append the toolset to mode sites outside the currentToolset scope', () => {
    const file =
      'function Footer(){let currentToolset=getToolset();' +
      'inside(mode).toLowerCase()," on";return null}' +
      'outside(mode).toLowerCase()," on";';

    const result = appendToolsetToModeDisplay(file);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'inside(mode).toLowerCase(),currentToolset?` on [${currentToolset}]`:""'
    );
    expect(result).toContain('outside(mode).toLowerCase()," on"');
  });

  it('appends the toolset only to in-scope "? for shortcuts" sites', () => {
    const file =
      'function Footer(){let currentToolset=getToolset();' +
      'jsxRT.jsx(w,{children:"? for shortcuts"});return null}' +
      'jsxRT.jsx(w,{children:"? for shortcuts"});';

    const result = appendToolsetToShortcutsDisplay(file);

    expect(result).not.toBeNull();
    expect(
      result!.match(
        /currentToolset\?`\? for shortcuts \[\$\{currentToolset\}\]`:"\? for shortcuts"/g
      )
    ).toHaveLength(1);
    expect(result).toContain('jsxRT.jsx(w,{children:"? for shortcuts"})');
  });

  it('uses the mode-aware fallback in the tool-change component scope', () => {
    const file =
      appStateAccessors +
      'wrap(arg,function(evt){track("tengu_ext_at_mentioned",{});return null})';

    const result = addCurrentToolsetAtToolChangeComponentScope(
      file,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      `const currentToolset = useAppState(state => ${modeAwareFallback});`
    );
  });

  it('finds the tool-change scope when the analytics call is comma-sequenced', () => {
    const file =
      appStateAccessors +
      'wrap(arg,function(evt){track("tengu_ext_at_mentioned",{}),next(evt)})';

    const result = addCurrentToolsetAtToolChangeComponentScope(
      file,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      `const currentToolset = useAppState(state => ${modeAwareFallback});`
    );
  });
});

describe('findCurrentToolsetInjectionSpan', () => {
  it('returns the enclosing function body span of the marker', () => {
    const file =
      'a();function F(){let currentToolset=x;body({k:1});return 0}tail();';

    const span = findCurrentToolsetInjectionSpan(file);

    expect(span).not.toBeNull();
    expect(span!.start).toBe(file.indexOf('let currentToolset='));
    expect(file.slice(span!.start, span!.end + 1)).toBe(
      'let currentToolset=x;body({k:1});return 0}'
    );
  });

  it('ignores braces inside string literals when walking out of the function', () => {
    const file = 'function F(){let currentToolset=g("}{}");return 1}after();';

    const span = findCurrentToolsetInjectionSpan(file);

    expect(span).not.toBeNull();
    expect(file.slice(span!.start, span!.end + 1)).toBe(
      'let currentToolset=g("}{}");return 1}'
    );
  });

  it('ignores braces inside template literals when walking out of the function', () => {
    const file =
      'function F(){let currentToolset=x;let label=` on [${currentToolset}]`;return label}after();';

    const span = findCurrentToolsetInjectionSpan(file);

    expect(span).not.toBeNull();
    expect(file.slice(span!.start, span!.end + 1)).toBe(
      'let currentToolset=x;let label=` on [${currentToolset}]`;return label}'
    );
  });

  it('returns null when no marker is present', () => {
    expect(
      findCurrentToolsetInjectionSpan('function F(){return 1}')
    ).toBeNull();
  });
});

describe('writeModeChangeUpdateToolset', () => {
  it('switches default, accept edits, and plan modes independently', () => {
    const input =
      'if(setState((prev)=>({...prev,toolPermissionContext:{...prev.toolPermissionContext,mode:nextMode}}))){}';

    const result = writeModeChangeUpdateToolset(
      input,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      'toolset:process.env.TWEAKCC_TOOLSET_PLAN||"plan-only",toolsetAutoMode:"plan"'
    );
    expect(result).toContain('nextMode==="acceptEdits"');
    expect(result).toContain(
      'toolset:process.env.TWEAKCC_TOOLSET_ALLOW_EDITS||"accept-only",toolsetAutoMode:null'
    );
    expect(result).toContain('nextMode==="auto"');
    expect(result).toContain(
      'toolset:process.env.TWEAKCC_TOOLSET_AUTO||process.env.TWEAKCC_TOOLSET_DEFAULT||"default",toolsetAutoMode:null'
    );
    expect(result).toContain(
      'toolset:process.env.TWEAKCC_TOOLSET_DEFAULT||"default",toolsetAutoMode:null'
    );
  });
});

describe('writeSubagentResolvedToolContextFix', () => {
  it('uses captured resolved tool/context variables for tool execution lookup', () => {
    const resolvedToolsVar = '$tools';
    const contextVar = 'ctx2';
    const canUseToolVar = '$allow';
    const querySourceVar = 'src2';
    const input =
      `let ${resolvedToolsVar}=agentMcpTools.length>0?dedupe([...frontmatterTools,...agentMcpTools],"name"):frontmatterTools;` +
      `if(!exact)for(let item of attach(${resolvedToolsVar},model,msgs,{callSite:"attachments_subagent"})){};` +
      `let childOptions={tools:${resolvedToolsVar},commands:[]},${contextVar}=clone(parent,{options:childOptions});` +
      'for await(let event of query({messages:msgs,systemPrompt:sys,' +
      `userContext:user,systemContext:system,canUseTool:${canUseToolVar},` +
      `toolUseContext:${contextVar},querySource:${querySourceVar},` +
      'spawnedBySkill:skill,maxTurns:maxTurns})){}';

    const result = writeSubagentResolvedToolContextFix(input);

    expect(result).toContain(
      `canUseTool:async(...a)=>${resolvedToolsVar}.some(t=>t.name===a[0]?.name)?{behavior:"allow",decisionReason:{type:"other",reason:"subagent_toolset"}}:await ${canUseToolVar}(...a)`
    );
    expect(result).toContain(
      `toolUseContext:{...${contextVar},options:{...${contextVar}.options,tools:${resolvedToolsVar}}},querySource:${querySourceVar}`
    );
    expect(result).not.toContain(
      `canUseTool:${canUseToolVar},toolUseContext:${contextVar}`
    );
  });
});

describe('writeTaskAgentFrontmatterToolsFix', () => {
  it('uses captured vars for the full native candidate pool before frontmatter filtering', () => {
    const nativeToolsVar = '$nativeTools';
    const appStateVar = 'state2';
    const candidateVar = '$candidate';
    const resolvedVar = 'resolved2';
    const contextVar = 'ctx2';
    const input =
      'let agentDef=customAgent??defaultAgent,' +
      `${appStateVar}=runtime.getAppState(),permission=readPerm(runtime),` +
      `${nativeToolsVar}=runtime.options.tools.filter(isBaseTool),` +
      'permissionForAgent={...permission,mode:agentDef.permissionMode??"acceptEdits"};' +
      `${candidateVar}=resolve(permissionForAgent,wrap(${appStateVar}.mcp.tools.concat(${nativeToolsVar})),{skipReplFilter:!0,skillTools:${appStateVar}.skillTools}),` +
      `${resolvedVar}=schemaTool?[...${candidateVar}.filter((tool)=>!same(tool,structuredOutput)),schemaTool]:${candidateVar},` +
      `launch={agentDefinition:agentDef,availableTools:isFork?runtime.options.tools:${resolvedVar},` +
      'forkContextMessages:isFork?runtime.messages:void 0};' +
      'for await(let event of query({messages:msgs,systemPrompt:sys,' +
      `systemContext:system,canUseTool:allow,toolUseContext:${contextVar},` +
      'querySource:source,spawnedBySkill:skill,maxTurns:maxTurns})){}';

    const result = writeTaskAgentFrontmatterToolsFix(input);

    expect(result).toContain(
      `${candidateVar}=${appStateVar}.mcp.tools.concat(${nativeToolsVar}),${resolvedVar}=`
    );
    expect(result).toContain(
      `availableTools:isFork?runtime.options.tools:${resolvedVar}`
    );
    expect(result).not.toContain(`${candidateVar}=resolve(`);
  });

  it('does not rewrite unrelated simple availableTools fields', () => {
    const input = 'start({availableTools:S,forkContextMessages:void 0})';

    expect(writeTaskAgentFrontmatterToolsFix(input)).toBe(input);
  });
});

describe('writeComputeToolsFilter', () => {
  it('filters the no-agent computeTools branch', () => {
    const result = writeComputeToolsFilter(
      computeToolsInput,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(`if(!agent)return __tf(${mergedToolsVar});`);
  });

  it('preserves declared agent tools but filters undeclared agents', () => {
    const result = writeComputeToolsFilter(
      computeToolsInput,
      toolsets,
      'default',
      'accept-only',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      `return resolve(agent,agent.tools?${mergedToolsVar}:__tf(${mergedToolsVar}),!1,!0).resolvedTools`
    );
    expect(result).not.toContain(
      `return __tf(resolve(agent,${mergedToolsVar},!1,!0).resolvedTools)`
    );
  });
});

describe('findTextComponent', () => {
  it('finds text component when props are destructured in the function body', () => {
    const input =
      'function TextLike(props){let cacheSlot=cache.c(31),rest,background,textChildren,color,dim,bold,italic,underline,strikethrough,inverse,wrap;' +
      'if(cacheSlot[0]!==props)({color:color,backgroundColor:background,dimColor:dim,bold:bold,italic:italic,underline:underline,strikethrough:strikethrough,inverse:inverse,wrap:wrap,children:textChildren,...rest}=props);' +
      'let resolvedDim=dim===void 0?!1:dim,resolvedBold=bold===void 0?!1:bold,resolvedItalic=italic===void 0?!1:italic}';

    expect(findTextComponent(input)).toBe('TextLike');
  });
});

describe('findSelectComponentName', () => {
  it('finds a Select component from its options/onChange/onCancel signature', () => {
    const input =
      'function SelectMenu({options:opts,onChange:change,onCancel:cancel,placeholder:hint}){' +
      'return R.createElement(Box,{children:opts.map(option=>option.label)})}' +
      'R.createElement(YesNoPrompt,{options:yesNoOptions,onChange:onYes,onCancel:onNo,children:"Yes, use recommended settings"});';

    expect(findSelectComponentName(input)).toBe('SelectMenu');
  });

  it('skips the recommended-settings yes/no prompt when using usage fallback', () => {
    const input =
      'R.createElement(YesNoPrompt,{options:yesNoOptions,onChange:onYes,onCancel:onNo,children:"Yes, use recommended settings"});' +
      'R.createElement(GenericSelect,{options:selectOptions,onChange:onSelect,onCancel:onCancel});';

    expect(findSelectComponentName(input)).toBe('GenericSelect');
  });

  it('skips selector/state helpers and finds the render component', () => {
    const input =
      'function SelectState({options:opts,onChange:change,onCancel:cancel}){' +
      'return {options:opts,onChange:change,onCancel:cancel,highlightedIndex:0}}' +
      'function MenuSelect({options:items,onChange:onPick,onCancel:onClose,placeholder:hint}){' +
      'return R.createElement(Box,{children:items.map(option=>option.label)})}';

    expect(findSelectComponentName(input)).toBe('MenuSelect');
  });

  it('finds a Select rendered via the jsx runtime', () => {
    const input =
      'jsxRT.jsx(GenericSelect,{options:selectOptions,onChange:onSelect,onCancel:onCancel,isDisabled:!1});';

    expect(findSelectComponentName(input)).toBe('GenericSelect');
  });

  it('finds a jsx-bodied Select from its signature when no createElement is present', () => {
    const input =
      'function MenuSelect({options:items,onChange:onPick,onCancel:onClose,placeholder:hint}){' +
      'return jsxRT.jsx(Box,{children:items.map(option=>option.label)})}';

    expect(findSelectComponentName(input)).toBe('MenuSelect');
  });

  it('skips the recommended-settings prompt rendered via jsx', () => {
    const input =
      'jsxRT.jsx(YesNoPrompt,{options:yesNoOptions,onChange:onYes,onCancel:onNo,children:"Yes, use recommended settings"});' +
      'jsxRT.jsx(GenericSelect,{options:selectOptions,onChange:onSelect,onCancel:onCancel});';

    expect(findSelectComponentName(input)).toBe('GenericSelect');
  });
});
