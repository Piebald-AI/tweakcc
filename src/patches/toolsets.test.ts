import { describe, expect, it } from 'vitest';

import {
  addCurrentToolsetAtToolChangeComponentScope,
  findSelectComponentName,
  insertShiftTabAppStateVar,
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

const modeAwareFallback =
  'state.toolPermissionContext?.mode!=="plan"&&state.toolsetAutoMode==="plan"?"default":(state.toolset??(state.toolPermissionContext?.mode==="plan"?"plan-only":"default"))';
const computeModeAwareFallback = `${appStateVar}.toolPermissionContext?.mode!=="plan"&&${appStateVar}.toolsetAutoMode==="plan"?"default":(${appStateVar}.toolset??(${appStateVar}.toolPermissionContext?.mode==="plan"?"plan-only":"default"))`;
const printModeAwareFallback =
  's.toolPermissionContext?.mode!=="plan"&&s.toolsetAutoMode==="plan"?"default":(s.toolset??(s.toolPermissionContext?.mode==="plan"?"plan-only":"default"))';

describe('toolsets missing state.toolset fallback', () => {
  it('uses the mode-aware fallback in UI tool filtering', () => {
    const file =
      appStateAccessors +
      'let merged=aggregate(firstArg,source.tools,permissionMode),tail';

    const result = writeToolFetchingUseMemo(
      file,
      toolsets,
      'default',
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
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(computeModeAwareFallback);
  });

  it('uses the mode-aware fallback in print-mode tool filtering', () => {
    const file =
      'let tools=computeTools(state);startQuery({tools:tools,refreshTools:()=>computeTools(getState()),canUseTool:allowTool})';

    const result = writePrintToolsFilter(
      file,
      toolsets,
      'default',
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
      'function Status(p){return render({color:"bashBorder"},"! for shell mode")}';

    const result = insertShiftTabAppStateVar(file, 'default', 'plan-only');

    expect(result).not.toBeNull();
    expect(result).toContain(
      `let currentToolset=useAppState(state => ${modeAwareFallback});`
    );
  });

  it('uses the mode-aware fallback in the tool-change component scope', () => {
    const file =
      appStateAccessors +
      'wrap(arg,function(evt){track("tengu_ext_at_mentioned",{});return null})';

    const result = addCurrentToolsetAtToolChangeComponentScope(
      file,
      'default',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      `const currentToolset = useAppState(state => ${modeAwareFallback});`
    );
  });
});

describe('writeModeChangeUpdateToolset', () => {
  it('marks plan toolset as auto-selected only on automatic mode changes', () => {
    const input =
      'if(setState((prev)=>({...prev,toolPermissionContext:{...prev.toolPermissionContext,mode:nextMode}}))){}';

    const result = writeModeChangeUpdateToolset(input, 'plan-only', 'default');

    expect(result).not.toBeNull();
    expect(result).toContain('toolset:"plan-only",toolsetAutoMode:"plan"');
    expect(result).toContain('toolset:"default",toolsetAutoMode:null');
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
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(`if(!agent)return __tf(${mergedToolsVar});`);
  });

  it('preserves native resolved tools for active agents', () => {
    const result = writeComputeToolsFilter(
      computeToolsInput,
      toolsets,
      'default',
      'plan-only'
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      `return resolve(agent,${mergedToolsVar},!1,!0).resolvedTools`
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
});
