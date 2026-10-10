// Please see the note about writing patches in ./index

import {
  showDiff,
  findChalkVar,
  findTextComponent,
  findBoxComponent,
  getReactVar,
} from './index';
import {
  findSlashCommandListEndPosition,
  insertAfterLoginRegistration,
  writeSlashCommandDefinition as writeSlashCommandDefinitionToArray,
} from './slashCommands';
import { isGraphContextActive, resolveAcrossGraph } from './graphContext';
import { Toolset } from '../types';

// ============================================================================
// UTILITY FUNCTIONS - Variable Discovery
// ============================================================================

/**
 * Find Select component using function signature pattern
 */
export const findSelectComponentName = (
  fileContents: string
): string | null => {
  const selectRenderPattern =
    /\.(?:createElement|jsxs?)\(([$\w]+),\{(?=[^}]{0,240}options:)(?=[^}]{0,240}onChange:)[^}]{0,360}\}/g;

  for (const match of fileContents.matchAll(selectRenderPattern)) {
    const window = fileContents.slice(
      match.index,
      Math.min(fileContents.length, match.index + match[0].length + 180)
    );
    if (/Yes, use recommended settings|recommended settings/.test(window)) {
      continue;
    }
    return match[1];
  }

  const selectDefinitionPatterns = [
    /function ([$\w]+)\(\{(?=[^}]{0,600}options:)(?=[^}]{0,600}onChange:)(?=[^}]{0,600}onCancel:)[^}]{0,900}\}\)/g,
    /function ([$\w]+)\(([$\w]+)\)\{(?:(?!function ).){0,900}\{(?=[^}]{0,600}options:)(?=[^}]{0,600}onChange:)(?=[^}]{0,600}onCancel:)[^}]{0,900}\}=\2/g,
  ];

  for (const selectPattern of selectDefinitionPatterns) {
    for (const match of fileContents.matchAll(selectPattern)) {
      const body = fileContents.slice(
        match.index,
        Math.min(fileContents.length, match.index + match[0].length + 1200)
      );
      if (
        /\.createElement\(|\.jsxs?\(/.test(body) &&
        !/return\s*\{/.test(body)
      ) {
        return match[1];
      }
    }
  }

  // Code-split builds (CC 2.1.2xx) render Select through a bare JSX-runtime
  // import in other chunks: e(De,{options:E,onFocus:F,onChange:M,…,visibleOptionCount:Te,…})
  if (isGraphContextActive()) {
    const imported = resolveAcrossGraph(
      'ink:Select',
      source =>
        source.match(
          /[^$\w.][$\w]+\(([$\w]+),\{options:[$\w]+,(?:[$\w]+:[$\w]+,){0,4}onChange:[$\w]+,(?:[$\w]+:[$\w]+,){0,4}visibleOptionCount:/
        )?.[1]
    );
    if (imported) return imported;
  }

  console.error('patch: findSelectComponentName: failed to find selectPattern');
  return null;
};

const getToolsetFallbackExpression = (
  stateExpression: string,
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string => {
  // Each mode binding can be forced at CC start via runtime environment
  // variables (read by the patched cli.js, so no re-apply is needed). They
  // override the bindings configured in the tweakcc menu (#569).
  const defaultValue = `(process.env.TWEAKCC_TOOLSET_DEFAULT||${
    defaultToolset ? JSON.stringify(defaultToolset) : 'undefined'
  })`;
  const acceptEditsValue = `(process.env.TWEAKCC_TOOLSET_ALLOW_EDITS||${
    acceptEditsToolset ? JSON.stringify(acceptEditsToolset) : defaultValue
  })`;
  const planValue = `(process.env.TWEAKCC_TOOLSET_PLAN||${
    planModeToolset ? JSON.stringify(planModeToolset) : defaultValue
  })`;
  const autoValue = `(process.env.TWEAKCC_TOOLSET_AUTO||${defaultValue})`;

  return `${stateExpression}.toolPermissionContext?.mode!=="plan"&&${stateExpression}.toolsetAutoMode==="plan"?${defaultValue}:(${stateExpression}.toolset??(${stateExpression}.toolPermissionContext?.mode==="plan"?${planValue}:(${stateExpression}.toolPermissionContext?.mode==="acceptEdits"?${acceptEditsValue}:(${stateExpression}.toolPermissionContext?.mode==="auto"?${autoValue}:${defaultValue}))))`;
};

/**
 * Find Divider component using function signature pattern
 */
export const findDividerComponentName = (
  fileContents: string
): string | null => {
  // Pattern matches the Divider component's function signature
  // TODO: this could be refactored to a single function that takes a list of params, and maybe even finds and returns the longest match.
  const dividerPattern =
    /function ([$\w]+)(?:\([$\w]+\)\{let [$\w]+=[$\w]+\(\d+\),\{(?:(?:orientation|title|width|padding|titlePadding|titleColor|titleDimColor|dividerChar|dividerColor|dividerDimColor|boxProps):[$\w]+,?)+\}=|\(\{(?:(?:orientation|title|width|padding|titlePadding|titleColor|titleDimColor|dividerChar|dividerColor|dividerDimColor|boxProps):[$\w]+(?:=(?:[^,]+,|[^}]+\})|[,}]))+\))/g;

  const matches = Array.from(fileContents.matchAll(dividerPattern));
  if (matches.length === 0) {
    return null;
  }

  // Return the longest match (most complete signature)
  let longestMatch = matches[0];
  for (const match of matches) {
    if (match[0].length > longestMatch[0].length) {
      longestMatch = match;
    }
  }

  return longestMatch[1];
};

/**
 * Find the start of the main app component body
 */
export const getMainAppComponentBodyStart = (
  fileContents: string
): number | null => {
  // Pattern matches the main app component function signature with all its props
  // Updated for 2.1.20: added initialAgentName, initialAgentColor, taskListId, remoteSessionConfig, autoTickIntervalMs
  const appComponentPattern =
    /function ([$\w]+)\(\{(?:\w+:[$\w]+(?:=(?:[^,]+,|[^}]+\})|[,}]))+initialFileHistorySnapshots:[$\w]+,(?:\w+:[$\w]+(?:=(?:[^,]+,|[^}]+\})|[,}]))+\)/g;

  const allMatches = Array.from(fileContents.matchAll(appComponentPattern));
  // Filter to only matches that contain 'commands:' - unique to main app component
  const matches = allMatches.filter(m => m[0].includes('commands:'));
  if (matches.length === 0) {
    console.error(
      'patch: getMainAppComponentBodyStart: failed to find appComponentPattern'
    );
    return null;
  }

  // Take the very longest match
  let longestMatch = matches[0];
  for (const match of matches) {
    if (match[0].length > longestMatch[0].length) {
      longestMatch = match;
    }
  }

  if (longestMatch.index === undefined) {
    console.error(
      'patch: getMainAppComponentBodyStart: failed to find appComponentPattern longestMatch'
    );
    return null;
  }

  return longestMatch.index + longestMatch[0].length;
};

/**
 * Get app state selector and useState function names
 */
export const getAppStateSelectorAndUseState = (
  fileContents: string
): { appStateUseSelectorFn: string; appStateSetState: string } | null => {
  // CC <2.1.83: function D8(...`Your selector in...function iA(){return STORE().setState}
  const oldPattern =
    /function ([$\w]+)\(.{0,110}`Your selector in.{0,1000}?function ([$\w]+)\(\)\{return [$\w]+\(\)\.setState\}/;
  const oldMatch = fileContents.match(oldPattern);

  if (oldMatch) {
    return {
      appStateUseSelectorFn: oldMatch[1],
      appStateSetState: oldMatch[2],
    };
  }

  // CC >=2.1.83: Find selector function that uses useSyncExternalStore with a store
  // that contains thinkingEnabled. Pattern:
  //   function D8(A){...STORE(),...useSyncExternalStore(...)...}
  //   function iA(){return STORE().setState}
  // where STORE is used in context with thinkingEnabled

  // Step 1: Find setState functions: function NAME(){return STORE().setState}
  const setStatePat = /function ([$\w]+)\(\)\{return ([$\w]+)\(\)\.setState\}/g;
  const setStateMatches = Array.from(fileContents.matchAll(setStatePat));

  for (const ssMatch of setStateMatches) {
    const setStateFn = ssMatch[1];
    const storeFn = ssMatch[2];

    // Step 2: Find the selector function that calls STORE() and useSyncExternalStore
    // within its own body (no crossing function boundaries)
    const escapedStore = storeFn.replace(/\$/g, '\\$');
    const selectorPat = new RegExp(
      `function ([$\\w]+)\\([$\\w]+\\)\\{(?:(?!\\bfunction\\b).){0,300}${escapedStore}\\(\\)(?:(?!\\bfunction\\b).){0,300}useSyncExternalStore\\(`
    );
    const selectorMatch = fileContents.match(selectorPat);
    if (!selectorMatch) continue;

    const selectorFn = selectorMatch[1];

    // Step 3: Verify this is the app state store (has thinkingEnabled)
    const escapedSelector = selectorFn.replace(/\$/g, '\\$');
    const verifyPat = new RegExp(`${escapedSelector}\\(.{0,80}thinkingEnabled`);
    if (!verifyPat.test(fileContents)) continue;

    return {
      appStateUseSelectorFn: selectorFn,
      appStateSetState: setStateFn,
    };
  }

  console.error(
    'patch: getAppStateSelectorAndUseState: failed to find pattern'
  );
  return null;
};

/**
 * Find the top-level position before the slash command list
 * This is where we'll insert the toolset component definition
 */
export const findTopLevelPositionBeforeSlashCommand = (
  fileContents: string
): number | null => {
  const arrayEnd = findSlashCommandListEndPosition(fileContents);
  if (arrayEnd === null) {
    console.error(
      'patch: findTopLevelPositionBeforeSlashCommand: failed to find arrayEnd'
    );
    return null;
  }

  // Example code structure (from spec):
  // var Nb2, Dj, bD, ttA, YeA, etA;
  // var OH = R(() => {
  //   _A1();
  //   mTQ();
  //   ...
  //   ((Nb2 = G0(() => [
  //     Lb2,
  //     Cv2,
  //     pTQ,  <-- We're at the end of this array
  //   ]
  //
  // We need to walk backwards from arrayEnd to find the opening '{' of the block
  // that contains this array, then find the semicolon before it.

  // Use stack machine to walk backwards out of the block
  let level = 1; // We're inside a block
  let i = arrayEnd;

  while (i >= 0 && level > 0) {
    if (fileContents[i] === '}') {
      level++; // Going backwards, so } means entering a deeper block
    } else if (fileContents[i] === '{') {
      level--; // Going backwards, so { means exiting a block
      if (level === 0) {
        break; // Found the opening brace
      }
    }
    i--;
  }

  if (i < 0) {
    console.error(
      'patch: findTopLevelPositionBeforeSlashCommand: failed to find matching open-brace'
    );
    return null;
  }

  // Now walk backwards from the '{' to find the previous semicolon
  while (i >= 0 && fileContents[i] !== ';') {
    i--;
  }

  if (i < 0) {
    console.error(
      'patch: findTopLevelPositionBeforeSlashCommand: failed to find matching semicolon'
    );
    return null;
  }

  // Return the position AFTER the semicolon
  return i + 1;
};

// ============================================================================
// SUB-PATCH IMPLEMENTATIONS
// ============================================================================

/**
 * Sub-patch 1: Add toolset field to app state initialization
 */
export const writeToolsetFieldToAppState = (oldFile: string): string | null => {
  // Find all occurrences of thinkingEnabled:SOMETHING()
  const thinkingEnabledPattern = /thinkingEnabled:([$\w]+)\(\)/g;
  const matches = Array.from(oldFile.matchAll(thinkingEnabledPattern));

  if (matches.length === 0) {
    console.error('patch: toolsets: failed to find thinkingEnabled pattern');
    return null;
  }

  // Collect all end indices
  const modifications: { index: number }[] = [];
  for (const match of matches) {
    if (match.index !== undefined) {
      const endIndex = match.index + match[0].length;
      modifications.push({ index: endIndex });
    }
  }

  // Sort in descending order to avoid index shifts
  modifications.sort((a, b) => b.index - a.index);

  // Apply modifications
  let newFile = oldFile;
  // Initialize toolset to undefined (NOT the default toolset name): every
  // read site uses `state.toolset ?? <mode-aware fallback>`, so a non-null
  // initial value would short-circuit the fallback and the toolset bound to
  // the startup permission mode (e.g. --permission-mode plan) would never
  // apply at load (#569). Shift+Tab and /toolset set it explicitly later.
  const textToInsert = `,toolset:undefined,toolsetAutoMode:null`;
  for (const mod of modifications) {
    newFile =
      newFile.slice(0, mod.index) + textToInsert + newFile.slice(mod.index);
  }

  if (newFile === oldFile) {
    console.error('patch: toolsets: failed to modify app state initialization');
    return null;
  }

  // Show diff for the last modification (representative of all changes)
  const lastMod = modifications[modifications.length - 1];
  showDiff(oldFile, newFile, textToInsert, lastMod.index, lastMod.index);

  return newFile;
};

/**
 * Sub-patch 2: Modify tool fetching useMemo to respect toolset
 */
export const writeToolFetchingUseMemo = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  const stateInfo = getAppStateSelectorAndUseState(oldFile);
  if (!stateInfo) {
    console.error(
      'patch: toolsets: toolFetchingMemo: failed to find app state info'
    );
    return null;
  }

  const { appStateUseSelectorFn } = stateInfo;

  // Pattern to find: let toolAggregationVar=toolAggregationCode(arg1,arg2.tools,arg3);
  const pattern = /let ([$\w]+)=([$\w]+\([$\w]+,[$\w]+\.tools,[$\w]+\)),/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: toolsets: failed to find tool aggregation pattern');
    return null;
  }

  const toolAggregationVar = match[1];
  const toolAggregationCode = match[2];

  // Create toolsets mapping: { "toolset-name": ["tool1", "tool2", ...] }
  const toolsetsJSON = JSON.stringify(
    Object.fromEntries(
      toolsets.map(ts => [
        ts.name,
        ts.allowedTools === '*' ? '*' : ts.allowedTools,
      ])
    )
  );

  // When persisted app state is loaded it may not have a toolset field (saved before
  // the toolset patch existed), causing currentToolset to be undefined. Fall back to
  // the active mode's toolset so restrictions are active from the first render.
  const fallback = getToolsetFallbackExpression(
    'state',
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );

  // Generate the replacement code
  const replacement = `let currentToolset = ${appStateUseSelectorFn}(state => ${fallback});
let ${toolAggregationVar} = undefined;
const toolsets = ${toolsetsJSON};
if (toolsets.hasOwnProperty(currentToolset)) {
  const allowedTools = toolsets[currentToolset];
  if (allowedTools === "*") {
    ${toolAggregationVar} = ${toolAggregationCode};
  } else {
    ${toolAggregationVar} = ${toolAggregationCode}.filter((toolDef) => allowedTools.includes(toolDef.name));
  }
} else {
  ${toolAggregationVar} = ${toolAggregationCode};
}let `;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};

/**
 * Sub-patch 2b: Patch computeTools() to also filter the tools sent to the API.
 *
 * Sub-patch 2 only filters the UI display list (useMergedTools). The actual tools
 * sent to the Claude API come from computeTools() inside getToolUseContext(), which
 * independently recomputes the full unfiltered tool list from the store.
 *
 * In the minified code, computeTools looks like:
 *   VARNAME=()=>{let STATE=STORE.getState(),
 *     ASSEMBLED=assembleToolPool(STATE.toolPermissionContext,STATE.mcp.tools),
 *     MERGED=mergeAndFilterTools(INIT,ASSEMBLED,STATE.toolPermissionContext.mode);
 *     if(!AGENT)return MERGED;
 *     return resolve(AGENT,MERGED,!1,!0).resolvedTools}
 *
 * We filter the main/orchestrator tools, but preserve native agent-resolved tools so
 * custom agent frontmatter `tools:` definitions continue to work.
 */
export const writeComputeToolsFilter = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  const stateInfo = getAppStateSelectorAndUseState(oldFile);
  if (!stateInfo) {
    console.error(
      'patch: toolsets: computeToolsFilter: failed to find app state info'
    );
    return null;
  }

  // stateInfo validated above — computeTools reads toolset from STORE.getState() directly

  // Find the computeTools closure pattern:
  // Old form: VAR=()=>{let STATE=STORE.getState(),ASSEMBLED=ASSEMBLE(STATE.toolPermissionContext,STATE.mcp.tools),MERGED=MERGE(INIT,ASSEMBLED,STATE.toolPermissionContext.mode);if(!AGENT)return MERGED;return RESOLVE(AGENT,MERGED,!1,!0).resolvedTools}
  // CC 2.1.140+: VAR=NS.useCallback(()=>{...let ASSEMBLED=ASSEMBLE(STATE.toolPermissionContext,STATE.mcp.tools,{skillTools:STATE.skillTools}),...},[deps])
  const pattern =
    /([$\w]+)=(?:([$\w]+\.useCallback\())?\(\)=>\{let ([$\w]+)=([$\w]+)\.getState\(\),([$\w]+)=([$\w]+)\(\3\.toolPermissionContext,\3\.mcp\.tools(?:,\{skillTools:\3\.skillTools\})?\),([$\w]+)=([$\w]+)\([$\w]+,\5,\3\.toolPermissionContext\.mode\);if\(!([$\w]+)\)return \7;return ([$\w]+)\(\9,\7,!1,!0\)\.resolvedTools\}/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: toolsets: computeToolsFilter: failed to find computeTools pattern'
    );
    return null;
  }

  const closureVar = match[1];
  const useCallbackPrefix = match[2] || '';
  const stateVar = match[3];
  const storeVar = match[4];
  const assembledVar = match[5];
  const assembleFn = match[6];
  const mergedVar = match[7];
  const mergeFn = match[8];
  const agentVar = match[9];
  const resolveFn = match[10];
  const skillToolsArg = match[0].includes(`{skillTools:${stateVar}.skillTools}`)
    ? `,{skillTools:${stateVar}.skillTools}`
    : '';

  // Create toolsets mapping
  const toolsetsJSON = JSON.stringify(
    Object.fromEntries(
      toolsets.map(ts => [
        ts.name,
        ts.allowedTools === '*' ? '*' : ts.allowedTools,
      ])
    )
  );

  const fallback = getToolsetFallbackExpression(
    stateVar,
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );

  // Actually let me re-examine the match to get the init tools var
  const fullMatch = match[0];
  // Extract the init var from MERGE(INIT,ASSEMBLED,...)
  const mergeCallMatch = fullMatch.match(
    new RegExp(
      `${mergeFn.replace(/\$/g, '\\$')}\\(([$\\w]+),${assembledVar.replace(/\$/g, '\\$')},`
    )
  );
  if (!mergeCallMatch) {
    console.error(
      'patch: toolsets: computeToolsFilter: failed to extract init var from merge call'
    );
    return null;
  }
  const initVar = mergeCallMatch[1];

  // Set globalThis.__tweakcc_toolset so the error message helper can read it.
  // Agents with an explicit `tools:` frontmatter list get the unfiltered pool
  // (their declared tools win — #597); agents without one inherit the active
  // toolset by resolving against the filtered pool instead of everything.
  const newClosure = `${closureVar}=${useCallbackPrefix}()=>{let ${stateVar}=${storeVar}.getState(),${assembledVar}=${assembleFn}(${stateVar}.toolPermissionContext,${stateVar}.mcp.tools${skillToolsArg}),${mergedVar}=${mergeFn}(${initVar},${assembledVar},${stateVar}.toolPermissionContext.mode);const __ts=${toolsetsJSON},__tc=${fallback},__tf=(t)=>{globalThis.__tweakcc_toolset={name:__tc,tools:__ts[__tc]};if(__ts.hasOwnProperty(__tc)){const a=__ts[__tc];if(a==="*")return t;return t.filter(d=>d.name==="Skill"||a.includes(d.name))}return t};if(!${agentVar})return __tf(${mergedVar});return ${resolveFn}(${agentVar},${agentVar}.tools?${mergedVar}:__tf(${mergedVar}),!1,!0).resolvedTools}`;

  const startIndex = match.index;
  const endIndex = startIndex + fullMatch.length;

  const newFile =
    oldFile.slice(0, startIndex) + newClosure + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, newClosure, startIndex, endIndex);

  return newFile;
};

/**
 * Sub-patch 2c: Patch the non-interactive --print tool context.
 *
 * The interactive app passes tools from computeTools(), patched above. The
 * print path builds its own tools list from app state and passes it directly
 * to the query loop, so it needs the same filter at that callsite.
 */
export const writePrintToolsFilter = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  const toolsetsJSON = JSON.stringify(
    Object.fromEntries(
      toolsets.map(ts => [
        ts.name,
        ts.allowedTools === '*' ? '*' : ts.allowedTools,
      ])
    )
  );
  const fallback = getToolsetFallbackExpression(
    's',
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );

  const resolverPattern =
    /let ([$\w]+)=([$\w]+)\(([$\w]+)\);(?=[\s\S]{0,8000}tools:\1,refreshTools:\(\)=>\2\(([$\w]+)\(\)\))/;
  const resolverMatch = oldFile.match(resolverPattern);
  const directPattern =
    /let ([$\w]+)=([$\w]+)\(([$\w]+)\);(?=[\s\S]{0,2500}tools:\1,refreshTools:\(\)=>\2\(\3\))/;
  const directMatch = resolverMatch ? null : oldFile.match(directPattern);
  const match = resolverMatch ?? directMatch;
  if (!match || match.index === undefined) {
    console.error(
      'patch: toolsets: printToolsFilter: failed to find print tools initialization'
    );
    return null;
  }

  const toolsVar = match[1];
  const computeFn = match[2];
  const stateVar = match[3];
  const getterFn = resolverMatch ? match[4] : null;

  const filterCode = `let ${toolsVar}=${computeFn}(${stateVar}),__tptu=${toolsVar};const __tpts=${toolsetsJSON},__tptf=(t,s)=>{const n=${fallback};globalThis.__tweakcc_toolset={name:n,tools:__tpts[n]};if(__tpts.hasOwnProperty(n)){const a=__tpts[n];if(a==="*")return t;return t.filter(d=>d.name==="Skill"||a.includes(d.name))}return t},__tptc=(tool,s)=>{const n=${fallback};globalThis.__tweakcc_toolset={name:n,tools:__tpts[n]};if(__tpts.hasOwnProperty(n)){const a=__tpts[n];if(a==="*")return null;if(tool&&tool.name!=="Skill"&&Array.isArray(a)&&!a.includes(tool.name))return{behavior:"deny",message:__tweakcc_toolErrorMsg(tool.name),decisionReason:{type:"other",reason:"toolset"}}}return null};${toolsVar}=__tptf(${toolsVar},${stateVar});`;

  let newFile =
    oldFile.slice(0, match.index) +
    filterCode +
    oldFile.slice(match.index + match[0].length);

  showDiff(
    oldFile,
    newFile,
    filterCode,
    match.index,
    match.index + match[0].length
  );

  const refreshPattern = new RegExp(
    getterFn
      ? `refreshTools:\\(\\)=>${computeFn.replace(/\$/g, '\\$')}\\(${getterFn.replace(/\$/g, '\\$')}\\(\\)\\)`
      : `refreshTools:\\(\\)=>${computeFn.replace(/\$/g, '\\$')}\\(${stateVar.replace(/\$/g, '\\$')}\\)`
  );
  const refreshMatch = newFile.match(refreshPattern);
  if (!refreshMatch || refreshMatch.index === undefined) {
    console.error(
      'patch: toolsets: printToolsFilter: failed to find print refreshTools'
    );
    return null;
  }

  const refreshReplacement = getterFn
    ? `refreshTools:()=>{let s=${getterFn}(),u=${computeFn}(s);__tptu=u;return __tptf(u,s)}`
    : `refreshTools:()=>{let u=${computeFn}(${stateVar});__tptu=u;return __tptf(u,${stateVar})}`;
  const beforeRefresh = newFile;
  newFile =
    newFile.slice(0, refreshMatch.index) +
    refreshReplacement +
    newFile.slice(refreshMatch.index + refreshMatch[0].length);

  showDiff(
    beforeRefresh,
    newFile,
    refreshReplacement,
    refreshMatch.index,
    refreshMatch.index + refreshMatch[0].length
  );

  const canUseToolSearchStart = refreshMatch.index;
  const canUseToolSearch = newFile.slice(
    canUseToolSearchStart,
    canUseToolSearchStart + 8000
  );
  const canUseToolMatch = canUseToolSearch.match(
    /([,{])canUseTool:([$\w]+)(?=[,}])/
  );
  if (!canUseToolMatch || canUseToolMatch.index === undefined) {
    console.error(
      'patch: toolsets: printToolsFilter: failed to find print canUseTool'
    );
    return null;
  }

  const canUseToolVar = canUseToolMatch[2];
  const canUseToolReplacement = getterFn
    ? `${canUseToolMatch[1]}canUseTool:async(...a)=>__tptc(a[0],${getterFn}())??await ${canUseToolVar}(...a)`
    : `${canUseToolMatch[1]}canUseTool:async(...a)=>__tptc(a[0],${stateVar})??await ${canUseToolVar}(...a)`;
  const canUseToolIndex = canUseToolSearchStart + canUseToolMatch.index;
  const beforeCanUseTool = newFile;
  newFile =
    newFile.slice(0, canUseToolIndex) +
    canUseToolReplacement +
    newFile.slice(canUseToolIndex + canUseToolMatch[0].length);

  showDiff(
    beforeCanUseTool,
    newFile,
    canUseToolReplacement,
    canUseToolIndex,
    canUseToolIndex + canUseToolMatch[0].length
  );

  const agentToolsSearchStart = canUseToolIndex;
  const agentToolsSearch = newFile.slice(
    agentToolsSearchStart,
    agentToolsSearchStart + 12000
  );
  const agentToolsMatch = agentToolsSearch.match(
    /availableTools:([$\w]+)(?=,[$\w]+:|,\.\.\.)/
  );
  if (agentToolsMatch?.index !== undefined) {
    const agentToolsIndex = agentToolsSearchStart + agentToolsMatch.index;
    const agentToolsReplacement = 'availableTools:__tptu';
    const beforeAgentTools = newFile;
    newFile =
      newFile.slice(0, agentToolsIndex) +
      agentToolsReplacement +
      newFile.slice(agentToolsIndex + agentToolsMatch[0].length);

    showDiff(
      beforeAgentTools,
      newFile,
      agentToolsReplacement,
      agentToolsIndex,
      agentToolsIndex + agentToolsMatch[0].length
    );
  }

  return newFile;
};

export const writeSubagentResolvedToolContextFix = (
  oldFile: string
): string => {
  const pattern =
    /tools:([$\w]+),commands:\[\]([\s\S]{0,4500}?)canUseTool:([$\w]+),toolUseContext:([$\w]+),querySource:([$\w]+),spawnedBySkill:/;
  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) return oldFile;

  const replacement = `tools:${match[1]},commands:[]${match[2]}canUseTool:async(...a)=>${match[1]}.some(t=>t.name===a[0]?.name)?{behavior:"allow",decisionReason:{type:"other",reason:"subagent_toolset"}}:await ${match[3]}(...a),toolUseContext:{...${match[4]},options:{...${match[4]}.options,tools:${match[1]}}},querySource:${match[5]},spawnedBySkill:`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + match[0].length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + match[0].length
  );

  return newFile;
};

export const writeTaskAgentFrontmatterToolsFix = (oldFile: string): string => {
  const pattern =
    /([,;])([$\w]+)=([$\w]+)\(([$\w]+),([$\w]+)\(([$\w]+)\.mcp\.tools\.concat\(([$\w]+)\)\),\{skipReplFilter:!0,skillTools:\6\.skillTools\}\)(?=,[$\w]+=)/;
  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) return oldFile;

  const prefix = oldFile.slice(Math.max(0, match.index - 1200), match.index);
  const nativeToolsVar = match[7].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (
    !new RegExp(`${nativeToolsVar}=.*?\\.options\\.tools\\.filter\\(`).test(
      prefix
    )
  ) {
    return oldFile;
  }

  const replacement = `${match[1]}${match[2]}=${match[6]}.mcp.tools.concat(${match[7]})`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + match[0].length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + match[0].length
  );

  return newFile;
};

/**
 * Sub-patch 2d: Replace "No such tool available" errors with toolset-aware messages.
 *
 * When a toolset is active and the model tries to call a filtered-out tool,
 * the generic "No such tool available: X" error wastes output context because
 * the model often tries alternative tools that are also unavailable.
 *
 * This patch replaces those errors with messages that list the available tools
 * and the active toolset, so the model knows what it CAN use.
 */
export const writeToolsetAwareErrors = (
  oldFile: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _toolsets: Toolset[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _defaultToolset: string | null
): string | null => {
  // Note: toolsets/defaultToolset params are unused — the helper reads from
  // globalThis.__tweakcc_toolset at runtime (set by writeComputeToolsFilter).

  // Replace the error template strings with toolset-aware versions.
  // CC <2.1.140 pattern: `<tool_use_error>Error: No such tool available: ${VARNAME}</tool_use_error>`
  // CC >=2.1.140 pattern: `<tool_use_error>Error: No such tool available: ${VARNAME}${HINT}</tool_use_error>`
  //   (second interpolation is an extra hint produced by a helper like $N6,
  //    e.g. ". <tool> exists but is not enabled in this context.")
  const errorPattern =
    /`<tool_use_error>Error: No such tool available: \$\{([$\w.]+)\}(?:\$\{([$\w.]+)\})?<\/tool_use_error>`/g;

  let newFile = oldFile;
  let matchCount = 0;

  // Helper reads from globalThis.__tweakcc_toolset (set by computeTools filter in sub-patch 2b)
  const helperName = '__tweakcc_toolErrorMsg';
  const helperFn =
    `function ${helperName}(toolName,hint){` +
    `hint=hint||"";` +
    `var info=globalThis.__tweakcc_toolset;` +
    `if(info&&info.tools&&info.tools!=="*"&&Array.isArray(info.tools)){` +
    `return "<tool_use_error>Error: No such tool available: "+toolName+hint+". The active toolset is '"+info.name+"' which only includes: "+info.tools.join(", ")+". Do not attempt to use "+toolName+" again — it will fail. If the user switches toolsets via /toolset, you may retry.</tool_use_error>"` +
    `}return "<tool_use_error>Error: No such tool available: "+toolName+hint+"</tool_use_error>"` +
    `};`;

  // Replace all error template literals with helper calls
  newFile = newFile.replace(errorPattern, (_match, varName, hintVar) => {
    matchCount++;
    return hintVar
      ? `${helperName}(${varName},${hintVar})`
      : `${helperName}(${varName})`;
  });

  if (matchCount === 0) {
    console.error(
      'patch: toolsets: toolsetAwareErrors: failed to find error pattern'
    );
    return null;
  }

  // Also replace the toolUseResult versions (without XML tags)
  const resultPattern =
    /`Error: No such tool available: \$\{([$\w.]+)\}(?:\$\{([$\w.]+)\})?`/g;
  newFile = newFile.replace(resultPattern, (_match, varName, hintVar) => {
    const call = hintVar
      ? `${helperName}(${varName},${hintVar})`
      : `${helperName}(${varName})`;
    return `${call}.replace(/<\\/?tool_use_error>/g,"")`;
  });

  // Inject the helper function at the top of the file (after the shebang/comments)
  const insertPoint = newFile.indexOf('\n', newFile.indexOf('// Version:'));
  if (insertPoint === -1) {
    console.error(
      'patch: toolsets: toolsetAwareErrors: failed to find insertion point for helper'
    );
    return null;
  }

  newFile =
    newFile.slice(0, insertPoint + 1) +
    helperFn +
    newFile.slice(insertPoint + 1);

  return newFile;
};

/**
 * Sub-patch 3: Add the toolset component definition
 */
export const writeToolsetComponentDefinition = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  const insertionPoint = findTopLevelPositionBeforeSlashCommand(oldFile);
  if (insertionPoint === null) {
    console.error(
      'patch: toolsets: failed to find slash command insertion point'
    );
    return null;
  }

  const reactVar = getReactVar(oldFile);
  if (!reactVar) {
    console.error('patch: toolsets: failed to find React variable');
    return null;
  }

  const boxComponent = findBoxComponent(oldFile);
  if (!boxComponent) {
    console.error('patch: toolsets: failed to find Box component');
    return null;
  }

  const textComponent = findTextComponent(oldFile);
  if (!textComponent) {
    console.error('patch: toolsets: failed to find Text component');
    return null;
  }

  const selectComponent = findSelectComponentName(oldFile);
  if (!selectComponent) {
    console.error('patch: toolsets: failed to find Select component');
    return null;
  }

  const dividerComponent = findDividerComponentName(oldFile);

  const stateInfo = getAppStateSelectorAndUseState(oldFile);
  if (!stateInfo) {
    console.error('patch: toolsets: failed to find app state getter');
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error('patch: toolsets: failed to find chalk variable');
    return null;
  }

  const { appStateUseSelectorFn, appStateSetState } = stateInfo;

  // Generate toolset names array
  const toolsetNames = JSON.stringify(toolsets.map(ts => ts.name));

  // Generate select options
  const selectOptions = JSON.stringify(
    toolsets.map(ts => ({
      label: ts.name,
      value: ts.name,
      description:
        ts.allowedTools === '*'
          ? 'All tools'
          : ts.allowedTools.length === 0
            ? 'No tools'
            : `${ts.allowedTools.length} tool${ts.allowedTools.length !== 1 ? 's' : ''}: ${ts.allowedTools.join(', ')}`,
    }))
  );

  const fallback = getToolsetFallbackExpression(
    'state',
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );

  // Generate the component code
  const componentCode = `const toolsetComp = ({ onExit, input }) => {
  const currentToolset = ${appStateUseSelectorFn}(state => ${fallback});

  const setState = ${appStateSetState}();

  // Handle command-line argument
  if (input !== "" && input != null) {
    if (!${toolsetNames}.includes(input)) {
      onExit(${chalkVar}.red(\`\${${chalkVar}.bold(input)} is not a valid toolset. Valid toolsets: ${toolsets.map(t => t.name).join(', ')}\`));
      return;
    } else {
      setState(prev => ({ ...prev, toolset: input, toolsetAutoMode: null }));
      onExit(\`Toolset changed to \${${chalkVar}.bold(input)}\`);
      return;
    }
  }

  // Render interactive UI
  return ${reactVar}.createElement(
    ${boxComponent},
    { flexDirection: "column" },
    ${dividerComponent ? `${reactVar}.createElement(${dividerComponent}, { dividerColor: "permission" }),` : `${reactVar}.createElement(${textComponent}, { dimColor: true }, "─".repeat(40)),`}
    ${reactVar}.createElement(
      ${boxComponent},
      { paddingX: 1, marginBottom: 1, flexDirection: "column" },
      ${reactVar}.createElement(${boxComponent}, null,
        ${reactVar}.createElement(${textComponent}, { bold: true, color: "remember" }, "Select toolset")
      ),
      ${reactVar}.createElement(${boxComponent}, null,
        ${reactVar}.createElement(${textComponent}, { dimColor: true }, "A toolset is a collection of tools that Claude sees and is allowed to call.")
      ),
      ${reactVar}.createElement(${boxComponent}, { marginBottom: 1 },
        ${reactVar}.createElement(${textComponent}, { dimColor: true }, "Claude cannot call tools that are not included in the selected toolset.")
      ),
      ${reactVar}.createElement(${boxComponent}, null,
        ${reactVar}.createElement(${textComponent}, { color: "warning" }, "Note that Claude may hallucinate that it has access to tools outside of the toolset.")
      ),
      ${reactVar}.createElement(${boxComponent}, { marginBottom: 1 },
        ${reactVar}.createElement(${textComponent}, { dimColor: true }, "If so, explicitly remind it what its tool list is, or tell it to check it itself.")
      ),
      ${reactVar}.createElement(${boxComponent}, null,
        ${reactVar}.createElement(${textComponent}, { dimColor: true, bold: true }, "Toolsets are managed with tweakcc. "),
        ${reactVar}.createElement(${textComponent}, { dimColor: true }, "Run "),
        ${reactVar}.createElement(${textComponent}, { color: "permission" }, "npx tweakcc"),
        ${reactVar}.createElement(${textComponent}, { dimColor: true }, " to manage them.")
      ),
      ${reactVar}.createElement(${boxComponent}, { marginBottom: 1 },
        ${reactVar}.createElement(${textComponent}, { color: "permission" }, "https://github.com/Piebald-AI/tweakcc")
      ),
      ${reactVar}.createElement(${boxComponent}, { marginBottom: 1 },
        ${reactVar}.createElement(${textComponent}, null, "Current toolset: "),
        ${reactVar}.createElement(${textComponent}, { bold: true }, currentToolset || "undefined")
      ),
      ${reactVar}.createElement(${boxComponent}, { marginBottom: 1 },
        ${reactVar}.createElement(${selectComponent}, {
          options: ${selectOptions},
          onChange: (input) => {
            setState(prev => ({ ...prev, toolset: input, toolsetAutoMode: null }));
            onExit(\`Toolset changed to \${${chalkVar}.bold(input)}\`);
          },
          onCancel: () => onExit(\`Toolset not changed (left as \${${chalkVar}.bold(currentToolset)})\`)
        })
      ),
      ${reactVar}.createElement(${textComponent}, { dimColor: true, italic: true }, "Enter to confirm · Esc to exit")
    )
  );
};`;

  const newFile =
    oldFile.slice(0, insertionPoint) +
    componentCode +
    oldFile.slice(insertionPoint);

  showDiff(oldFile, newFile, componentCode, insertionPoint, insertionPoint);

  return newFile;
};

/**
 * Find where to insert the app state variable getter in the statusline component
 */
export const findShiftTabAppStateVarInsertionPoint = (
  oldFile: string
): number | null => {
  // Search for the bash mode indicator.
  // CC <2.1.140 used "! for bash mode"; CC >=2.1.140 renamed it to "! for shell mode".
  const bashModePattern =
    /\{color:"bashBorder"(?:\},|,children:)"! for (?:bash|shell) mode"/;
  const match = oldFile.match(bashModePattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: toolsets: findShiftTabAppStateVarInsertionPoint: failed to find bash mode pattern'
    );
    return null;
  }

  // Get 10000 chars before the match
  // where earlier patches push the function declaration further away)
  const lookbackStart = Math.max(0, match.index - 10000);
  const chunk = oldFile.slice(lookbackStart, match.index);

  // Find the function declaration pattern - handles both:
  // - function NAME({...}){ (older CC, destructured params)
  // - function NAME(T){ (CC 2.1.20+, single param destructured in body)
  const functionPattern = /function ([$\w]+)\((?:\{[^}]+\}|[$\w]+)\)\{/g;
  const matches = Array.from(chunk.matchAll(functionPattern));

  if (matches.length === 0) {
    console.error(
      'patch: toolsets: findShiftTabAppStateVarInsertionPoint: failed to find function pattern'
    );
    return null;
  }

  // Take the last match (closest to the bash mode indicator)
  const lastMatch = matches[matches.length - 1];
  if (lastMatch.index === undefined) {
    console.error(
      'patch: toolsets: findShiftTabAppStateVarInsertionPoint: match has no index'
    );
    return null;
  }

  // Return position AFTER the opening brace
  return lookbackStart + lastMatch.index + lastMatch[0].length;
};

/**
 * Insert the state getter variable at the start of the statusline component
 * This is for appendToolsetToModeDisplay which injects `currentTool` but can't define it itself.
 */
export const insertShiftTabAppStateVar = (
  oldFile: string,
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  const insertionPoint = findShiftTabAppStateVarInsertionPoint(oldFile);
  if (insertionPoint === null) {
    console.error(
      'patch: toolsets: insertShiftTabAppStateVar: failed to find insertion point'
    );
    return null;
  }

  const stateInfo = getAppStateSelectorAndUseState(oldFile);
  if (!stateInfo) {
    console.error(
      'patch: toolsets: insertShiftTabAppStateVar: failed to find app state getter'
    );
    return null;
  }

  const { appStateUseSelectorFn } = stateInfo;
  const fallback = getToolsetFallbackExpression(
    'state',
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );
  const codeToInsert = `let currentToolset=${appStateUseSelectorFn}(state => ${fallback});`;

  const newFile =
    oldFile.slice(0, insertionPoint) +
    codeToInsert +
    oldFile.slice(insertionPoint);

  showDiff(oldFile, newFile, codeToInsert, insertionPoint, insertionPoint);

  return newFile;
};

/**
 * Find the function-body span holding the injected `let currentToolset=` marker.
 */
export const findCurrentToolsetInjectionSpan = (
  fileContents: string
): { start: number; end: number } | null => {
  const start = fileContents.indexOf('let currentToolset=');
  if (start === -1) {
    return null;
  }

  let depth = 1;
  let inString: string | null = null;
  let escape = false;
  for (let i = start; i < fileContents.length; i++) {
    const c = fileContents[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === inString) inString = null;
    } else if (c === '"' || c === "'" || c === '`') {
      inString = c;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        return { start, end: i };
      }
    }
  }

  return null;
};

/**
 * Append the toolset name to the mode display text
 */
export const appendToolsetToModeDisplay = (oldFile: string): string | null => {
  const modeDisplayPattern = /([$\w]+)\(([$\w]+)\)\.toLowerCase\(\)," on"/g;
  const matches = Array.from(oldFile.matchAll(modeDisplayPattern));

  if (matches.length === 0) {
    console.error(
      'patch: toolsets: appendToolsetToModeDisplay: failed to find mode display pattern'
    );
    return null;
  }

  const span = findCurrentToolsetInjectionSpan(oldFile);
  if (!span) {
    console.error(
      'patch: toolsets: appendToolsetToModeDisplay: failed to find currentToolset injection span'
    );
    return oldFile;
  }

  const inScope = matches.filter(
    m => m.index !== undefined && m.index >= span.start && m.index < span.end
  );
  if (inScope.length === 0) {
    console.error(
      'patch: toolsets: appendToolsetToModeDisplay: no mode display site within currentToolset scope; skipping'
    );
    return oldFile;
  }

  let newFile = oldFile;
  for (const match of [...inScope].reverse()) {
    if (match.index === undefined) continue;
    const tlFunction = match[1];
    const modeVar = match[2];
    const newText = `${tlFunction}(${modeVar}).toLowerCase(),currentToolset?\` on [\${currentToolset}]\`:""`;
    newFile =
      newFile.slice(0, match.index) +
      newText +
      newFile.slice(match.index + match[0].length);
  }

  const lastMatch = inScope[inScope.length - 1];
  showDiff(
    oldFile,
    newFile,
    'currentToolset?` on [${currentToolset}]`:""',
    lastMatch.index ?? 0,
    (lastMatch.index ?? 0) + lastMatch[0].length
  );

  return newFile;
};

/**
 * Append the toolset name to the "? for shortcuts" display
 */
export const appendToolsetToShortcutsDisplay = (
  oldFile: string
): string | null => {
  const shortcutsPattern = /"\? for shortcuts"/g;
  const matches = Array.from(oldFile.matchAll(shortcutsPattern));
  if (matches.length === 0) {
    console.error(
      "patch: toolsets: appendToolsetToShortcutsDisplay: could not find '? for shortcuts'"
    );
    return null;
  }

  const span = findCurrentToolsetInjectionSpan(oldFile);
  if (!span) {
    console.error(
      'patch: toolsets: appendToolsetToShortcutsDisplay: failed to find currentToolset injection span'
    );
    return oldFile;
  }

  const inScope = matches.filter(
    m => m.index !== undefined && m.index >= span.start && m.index < span.end
  );
  if (inScope.length === 0) {
    console.error(
      'patch: toolsets: appendToolsetToShortcutsDisplay: no shortcuts site within currentToolset scope; skipping'
    );
    return oldFile;
  }

  const newText = `currentToolset?\`? for shortcuts [\${currentToolset}]\`:"? for shortcuts"`;
  let newFile = oldFile;
  for (const match of [...inScope].reverse()) {
    if (match.index === undefined) continue;
    newFile =
      newFile.slice(0, match.index) +
      newText +
      newFile.slice(match.index + match[0].length);
  }

  const firstMatch = inScope[0];
  showDiff(
    oldFile,
    newFile,
    newText,
    firstMatch.index ?? 0,
    (firstMatch.index ?? 0) + firstMatch[0].length
  );

  return newFile;
};

/**
 * Sub-patch 4: Add the slash command definition
 */
export const writeSlashCommandDefinition = (oldFile: string): string | null => {
  const reactVar = getReactVar(oldFile);
  if (!reactVar) {
    console.error('patch: toolsets: failed to find React variable');
    return null;
  }

  // Generate the slash command definition
  const commandDef = `, {
  aliases: ["change-tools"],
  type: "local-jsx",
  name: "toolset",
  description: "Select a toolset (managed by tweakcc)",
  argumentHint: "[toolset-name]",
  isEnabled: () => true,
  isHidden: false,
  load: () => Promise.resolve().then(() => ({call: (onExit, ctx, input) => {
    return ${reactVar}.createElement(toolsetComp, { onExit, input });
  }})),
  userFacingName() {
    return "toolset";
  }
}`;

  // Use the imported function to write the command definition
  return writeSlashCommandDefinitionToArray(oldFile, commandDef);
};

// ============================================================================
// MODE CHANGE TOOLSET FUNCTIONS
// ============================================================================

/**
 * Find the tool change component scope
 * Pattern: X(Y,function(Z){W("tengu_ext_at_mentioned",{});
 * Returns the start index
 */
export const findToolChangeComponentScope = (
  fileContents: string
): number | null => {
  const pattern =
    /[\w$]+\([\w$]+,function\([\w$]+\)\{[\w$]+\("tengu_ext_at_mentioned",\{\}\)[;,]/;
  const match = fileContents.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: findToolChangeComponentScope: failed to find tool change component scope'
    );
    return null;
  }

  return match.index;
};

/**
 * Add setState function access at the tool change component scope
 * So that writeModeChangeUpdateToolset can use them.
 */
export const addCurrentToolsetAtToolChangeComponentScope = (
  oldFile: string,
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  const scopeIndex = findToolChangeComponentScope(oldFile);
  if (scopeIndex === null) {
    return null;
  }

  const stateInfo = getAppStateSelectorAndUseState(oldFile);
  if (!stateInfo) {
    console.error(
      'patch: addCurrentToolsetAtToolChangeComponentScope: failed to get app state getter function'
    );
    return null;
  }

  const { appStateUseSelectorFn } = stateInfo;
  const fallback = getToolsetFallbackExpression(
    'state',
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );

  // Inject the currentToolset access right at the start of the component scope
  const injectionCode = `const currentToolset = ${appStateUseSelectorFn}(state => ${fallback});`;

  const newFile =
    oldFile.slice(0, scopeIndex) + injectionCode + oldFile.slice(scopeIndex);

  showDiff(oldFile, newFile, injectionCode, scopeIndex, scopeIndex);

  return newFile;
};

/**
 * Find the mode change location in the code
 * Pattern: if(X==="acceptEdits")Y("auto-accept-mode");...mode:Z
 * Returns the index after the semicolon (insertion point) and the mode variable
 */
export const findModeChange = (
  fileContents: string
): { index: number; modeVar: string; setStateVar: string } | null => {
  const pattern =
    /if\(([$\w]+)\(\([$\w]+\)=>\(\{\.\.\.[$\w]+,toolPermissionContext.{0,200}?mode:([$\w]+)/;
  const match = fileContents.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: findModeChange: failed to find mode change location');
    return null;
  }

  return {
    index: match.index,
    modeVar: match[2],
    // We can't get a setState ourselves because it's a hook that gets it and this code is not in
    // the top-level component.But there's already an instantiation 600+ lines back (as of 2.1.31,
    // and it's `h1 = h7()`), but even simpler, in newer versions they use in like the next line.
    setStateVar: match[1],
  };
};

/**
 * Write the mode change toolset update code
 * This injects code before the mode change to automatically switch toolsets
 */
export const writeModeChangeUpdateToolset = (
  oldFile: string,
  defaultToolset: string,
  acceptEditsToolset: string,
  planModeToolset: string
): string | null => {
  const modeChangeResult = findModeChange(oldFile);
  if (!modeChangeResult) {
    return null;
  }

  const { index: modeChangeIndex, modeVar, setStateVar } = modeChangeResult;

  // Build the injection code using setState directly. Each binding can be
  // forced at CC start via TWEAKCC_TOOLSET_* env vars (#569).
  const injectionCode = `if(${modeVar}==="plan"){${setStateVar}((prev)=>({...prev,toolset:process.env.TWEAKCC_TOOLSET_PLAN||${JSON.stringify(planModeToolset)},toolsetAutoMode:"plan"}));}else if(${modeVar}==="acceptEdits"){${setStateVar}((prev)=>({...prev,toolset:process.env.TWEAKCC_TOOLSET_ALLOW_EDITS||${JSON.stringify(acceptEditsToolset)},toolsetAutoMode:null}));}else if(${modeVar}==="auto"){${setStateVar}((prev)=>({...prev,toolset:process.env.TWEAKCC_TOOLSET_AUTO||process.env.TWEAKCC_TOOLSET_DEFAULT||${JSON.stringify(defaultToolset)},toolsetAutoMode:null}));}else{${setStateVar}((prev)=>({...prev,toolset:process.env.TWEAKCC_TOOLSET_DEFAULT||${JSON.stringify(defaultToolset)},toolsetAutoMode:null}));}`;

  // Inject right before the mode change
  const newFile =
    oldFile.slice(0, modeChangeIndex) +
    injectionCode +
    oldFile.slice(modeChangeIndex);

  showDiff(oldFile, newFile, injectionCode, modeChangeIndex, modeChangeIndex);

  return newFile;
};

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Apply all toolset patches to the file
 * @param oldFile - The file content to patch
 * @param toolsets - Array of toolset configurations
 * @param defaultToolset - Optional toolset to use in default Shift+Tab mode
 * @param acceptEditsToolset - Optional toolset to use in accept-edits Shift+Tab mode
 * @param planModeToolset - Optional toolset to switch to when entering plan mode
 */
/**
 * Code-split builds (CC 2.1.2xx). The REPL no longer builds its tool list in
 * one memo; every caller goes through the tool catalog
 * (`var K5={getAllBaseTools:AC,getTools:tP,assembleToolPool:ept}`), where
 *   var tP=(e,r)=>{…}            // e = tool permission context
 *   function ept(e,r,n){let s=tP(e,n),…}
 * are also exported and called directly. Filter inside both definitions so
 * every path sees the active toolset, and register `/toolset [name]`.
 *
 * The active toolset lives in globalThis.__tweakccToolset (set by
 * /toolset); when unset, the same mode bindings as the classic patch apply
 * (default / plan / acceptEdits / auto toolsets, plus the
 * TWEAKCC_TOOLSET_* environment overrides).
 */
const writeToolsetsCodeSplit = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  const toolsetsJSON = JSON.stringify(
    Object.fromEntries(
      toolsets.map(ts => [
        ts.name,
        ts.allowedTools === '*' ? '*' : ts.allowedTools,
      ])
    )
  );
  let file = oldFile;

  const catalog = file.match(
    /[{,]getAllBaseTools:[$\w]+,getTools:([$\w]+),assembleToolPool:([$\w]+)\}/
  );
  if (catalog) {
    const [, getTools, assemble] = catalog;
    const esc = (s: string) => s.replace(/\$/g, '\\$');
    const getToolsDef = file.match(
      new RegExp(`var ${esc(getTools)}=\\(([$\\w]+),([$\\w]+)\\)=>\\{`)
    );
    const assembleDef = file.match(
      new RegExp(
        `function ${esc(assemble)}\\(([$\\w]+),([$\\w]+),([$\\w]+)\\)\\{`
      )
    );
    if (getToolsDef?.index !== undefined && assembleDef?.index !== undefined) {
      const fallback = getToolsetFallbackExpression(
        'tweakccState',
        defaultToolset,
        acceptEditsToolset,
        planModeToolset
      );
      const filter =
        // Entries ending in `*` match by prefix, e.g. `mcp__*` for every MCP tool.
        `function tweakccToolAllowed(tweakccAllowed,tweakccTool){return tweakccAllowed==="*"||tweakccAllowed.some(tweakccEntry=>tweakccEntry===tweakccTool||tweakccEntry.endsWith("*")&&tweakccTool.startsWith(tweakccEntry.slice(0,-1)))}` +
        `const tweakccFilterMemo=new WeakMap;function tweakccFilterTools(tweakccTools,tweakccContext){` +
        `let tweakccState={toolset:globalThis.__tweakccToolset,toolsetAutoMode:null,toolPermissionContext:tweakccContext},` +
        `tweakccName=${fallback},tweakccSets=${toolsetsJSON};` +
        `if(!Array.isArray(tweakccTools)||typeof tweakccName!=="string"||!Object.prototype.hasOwnProperty.call(tweakccSets,tweakccName))return tweakccTools;` +
        // Same input + same toolset → same array: callers compare tool
        // lists by identity and refresh when they differ.
        `let tweakccCached=tweakccFilterMemo.get(tweakccTools);if(tweakccCached&&tweakccCached.name===tweakccName)return tweakccCached.out;` +
        `let tweakccAllowed=tweakccSets[tweakccName],` +
        `tweakccOut=tweakccAllowed==="*"?tweakccTools:tweakccTools.filter(tweakccTool=>tweakccToolAllowed(tweakccAllowed,tweakccTool.name));` +
        `tweakccFilterMemo.set(tweakccTools,{name:tweakccName,out:tweakccOut});return tweakccOut}` +
        `globalThis.__tweakccFilterTools=tweakccFilterTools;` +
        // Effective toolset for a permission context (explicit choice, else
        // the mode binding) and the status-line suffix built from it.
        `globalThis.__tweakccToolsetName=(tweakccContext)=>{let tweakccState={toolset:globalThis.__tweakccToolset,toolsetAutoMode:null,toolPermissionContext:tweakccContext??{}};let tweakccName=${fallback};return typeof tweakccName==="string"&&tweakccName?tweakccName:void 0};` +
        `globalThis.__tweakccToolsetLabel=(tweakccMode)=>{let tweakccName=globalThis.__tweakccToolsetName({mode:tweakccMode});return tweakccName?" ["+tweakccName+"]":""};` +
        // Whether the main session's active toolset allows a tool, for the
        // declared-tool hold below (computeToolPool records the context).
        `globalThis.__tweakccToolsetAllows=(tweakccTool)=>{let tweakccAllowed=${toolsetsJSON}[globalThis.__tweakccToolsetName(globalThis.__tweakccMainToolContext)];return tweakccAllowed===void 0||tweakccToolAllowed(tweakccAllowed,tweakccTool)};` +
        // "No such tool available" text naming the active toolset and its
        // tools (sub-patch 2d); undefined when no restricted toolset applies.
        `globalThis.__tweakcc_toolErrorMsg=(tweakccTool,tweakccHint)=>{let tweakccName=globalThis.__tweakccToolsetName(globalThis.__tweakccMainToolContext),tweakccAllowed=${toolsetsJSON}[tweakccName];if(!Array.isArray(tweakccAllowed))return;` +
        `let tweakccLead="Error: No such tool available: "+tweakccTool+(tweakccHint??"");` +
        `return tweakccLead+(tweakccLead.endsWith(".")?" ":". ")+"The active toolset is '"+tweakccName+"' which only includes: "+(tweakccAllowed.join(", ")||"no tools")+". Do not attempt to use "+tweakccTool+" again \\u2014 it will fail. If the user switches toolsets via /toolset, you may retry."};`;
      const [aHead, a1, a2, a3] = assembleDef;
      const newAssemble = `${filter}function ${assemble}(${a1},${a2},${a3}){return tweakccFilterTools(tweakccAssembleToolPool(${a1},${a2},${a3}),${a1})}function tweakccAssembleToolPool(${a1},${a2},${a3}){`;
      file =
        file.slice(0, assembleDef.index) +
        newAssemble +
        file.slice(assembleDef.index + aHead.length);
      const getToolsAgain = file.match(
        new RegExp(`var ${esc(getTools)}=\\(([$\\w]+),([$\\w]+)\\)=>\\{`)
      )!;
      const [gHead, g1, g2] = getToolsAgain;
      const newGetTools = `var ${getTools}=(${g1},${g2})=>tweakccFilterTools(tweakccGetTools(${g1},${g2}),${g1}),tweakccGetTools=(${g1},${g2})=>{`;
      file =
        file.slice(0, getToolsAgain.index!) +
        newGetTools +
        file.slice(getToolsAgain.index! + gHead.length);
      showDiff(oldFile, file, 'toolset filter in tool catalog', 0, 0);
    }
  }

  // The REPL session store merges its startup tool list back into the pool
  // and caches the result, so filter its output as well:
  //   computeToolPool(h,M,E){let K={toolPermissionContext:h.toolPermissionContext,…
  const storePool = file.match(
    /computeToolPool\(([$\w]+),([$\w]+),([$\w]+)\)\{let [$\w]+=\{toolPermissionContext:\1\.toolPermissionContext,/
  );
  if (storePool?.index !== undefined) {
    const [, s, t, u] = storePool;
    const head = `computeToolPool(${s},${t},${u}){`;
    const wrapper =
      `computeToolPool(${s},${t},${u}){globalThis.__tweakccMainToolContext=${s}.toolPermissionContext;let tweakccPool=this.tweakccComputeToolPool(${s},${t},${u}),tweakccFiltered=globalThis.__tweakccFilterTools?.(tweakccPool?.tools,${s}.toolPermissionContext);` +
      `if(!tweakccPool||!Array.isArray(tweakccFiltered)||tweakccFiltered===tweakccPool.tools)return tweakccPool;` +
      `if(this.tweakccPoolMemo?.src===tweakccPool&&this.tweakccPoolMemo.tools===tweakccFiltered)return this.tweakccPoolMemo.out;` +
      `let tweakccOut={...tweakccPool,tools:tweakccFiltered};this.tweakccPoolMemo={src:tweakccPool,tools:tweakccFiltered,out:tweakccOut};return tweakccOut}` +
      `tweakccComputeToolPool(${s},${t},${u}){`;
    const before = file;
    file =
      file.slice(0, storePool.index) +
      wrapper +
      file.slice(storePool.index + head.length);
    showDiff(before, file, wrapper, storePool.index, storePool.index);
  }

  // CC 2.1.29x keeps every tool it has declared in a conversation on the
  // wire (prompt-cache stability) and re-declares tools that left the pool,
  // so a narrower toolset would keep sending the old tools. The held set asks
  // `keeps(name)` before re-declaring; let it drop tools the toolset excludes:
  //   keeps(e){return this.has(e)&&e!==ha}
  const heldKeeps = file.match(
    /keeps\(([$\w]+)\)\{return this\.has\(\1\)&&\1!==[$\w]+\}/
  );
  if (heldKeeps?.index !== undefined) {
    const end = heldKeeps.index + heldKeeps[0].length - 1;
    const addition = `&&(globalThis.__tweakccToolsetAllows?.(${heldKeeps[1]})??!0)`;
    const previous = file;
    file = file.slice(0, end) + addition + file.slice(end);
    showDiff(previous, file, addition, end, end);
  }

  // Unknown-tool results list the active toolset's tools:
  //   content:`<tool_use_error>Error: No such tool available: ${w}${Ge}</tool_use_error>`,…,toolUseResult:`Error: No such tool available: ${w}${Ge}`
  const toolErrors = file.replace(
    /`(<tool_use_error>)?Error: No such tool available: \$\{([$\w.]+)\}(?:\$\{([$\w.]+)\})?(?:<\/tool_use_error>)?`/g,
    (original, open, name, hint) => {
      const message = `globalThis.__tweakcc_toolErrorMsg?.(${name},${hint ?? '""'})`;
      return open
        ? `((tweakccMessage)=>tweakccMessage?"<tool_use_error>"+tweakccMessage+"</tool_use_error>":${original})(${message})`
        : `(${message}??${original})`;
    }
  );
  if (toolErrors !== file) {
    showDiff(file, toolErrors, '__tweakcc_toolErrorMsg', 0, 0);
    file = toolErrors;
  }

  // Mode status line: `⏸ plan mode on` → `⏸ plan mode on [readonly]`.
  //   if(ee[6]!==M)Me=bW(M),…;const Ie=E?"":" on";…children:[Ce,Me,Ie,K]
  const onLabel = file.match(/const ([$\w]+)=([$\w]+)\?"":" on";/);
  if (onLabel?.index !== undefined) {
    const before = file.slice(Math.max(0, onLabel.index - 400), onLabel.index);
    const modeVar = [
      ...before.matchAll(/if\([$\w]+\[\d+\]!==([$\w]+)\)[$\w]+=[$\w]+\(\1\)/g),
    ].at(-1)?.[1];
    if (modeVar) {
      const replacement = `const ${onLabel[1]}=(${onLabel[2]}?"":" on")+(globalThis.__tweakccToolsetLabel?.(${modeVar})??"");`;
      const previous = file;
      file =
        file.slice(0, onLabel.index) +
        replacement +
        file.slice(onLabel.index + onLabel[0].length);
      showDiff(
        previous,
        file,
        replacement,
        onLabel.index,
        onLabel.index + onLabel[0].length
      );
    }
  }

  // Shift+Tab re-applies the mode bindings, as the classic patch does on a
  // mode change: drop the explicit /toolset choice so the toolset bound to the
  // new mode takes effect. The main-session cycle is the one inside `if(`:
  //   OV(`[${IF(dy)} on]`);if(i("tengu_mode_cycle",{to:d(dy),trigger:d("shift_tab")}),…
  // (the teammate branch's call is a plain statement).
  if (defaultToolset && (acceptEditsToolset || planModeToolset)) {
    const modeCycle = file.match(
      /if\([$\w]+\("tengu_mode_cycle",\{to:[$\w]+\([$\w]+\),trigger:[$\w]+\("shift_tab"\)\}\)/
    );
    if (modeCycle?.index !== undefined) {
      const reset = 'globalThis.__tweakccToolset=void 0;';
      const previous = file;
      file =
        file.slice(0, modeCycle.index) + reset + file.slice(modeCycle.index);
      showDiff(previous, file, reset, modeCycle.index, modeCycle.index);
    }
  }

  if (file.includes('name:"login"') && !file.includes('name:"toolset"')) {
    const commandDef = buildToolsetPickerCommand(file, toolsets);
    const registered = commandDef
      ? insertAfterLoginRegistration(file, commandDef)
      : null;
    if (registered) file = registered;
  }

  return file === oldFile ? null : file;
};

/**
 * `/toolset` for code-split builds: with a name it switches directly; with
 * no argument it renders a native Select picker (Claude Code's own Select,
 * Box and Text, reached through the graph bridge).
 */
const buildToolsetPickerCommand = (
  file: string,
  toolsets: Toolset[]
): string | null => {
  const react = getReactVar(file);
  const box = findBoxComponent(file);
  const text = findTextComponent(file);
  const select = findSelectComponentName(file);
  if (!react || !box || !text || !select) return null;
  const names = toolsets.map(ts => ts.name);
  const options = JSON.stringify([
    ...toolsets.map(ts => ({
      label: ts.name,
      value: ts.name,
      description:
        ts.allowedTools === '*'
          ? 'All tools'
          : ts.allowedTools.length === 0
            ? 'No tools'
            : `${ts.allowedTools.length} tool${ts.allowedTools.length !== 1 ? 's' : ''}: ${ts.allowedTools.join(', ')}`,
    })),
    {
      label: 'Mode default',
      value: '__tweakcc_default',
      description:
        'Clear the selection and use the toolset bound to the current mode',
    },
  ]);
  const h = `${react}.createElement`;
  return (
    `,{type:"local-jsx",name:"toolset",description:${JSON.stringify(
      `Choose the toolset Claude can use (${names.join(', ')})`
    )},argumentHint:"[name|default]",` +
    `load:()=>Promise.resolve({call:async(tweakccDone,tweakccContext,tweakccArgs)=>{` +
    `const tweakccNames=${JSON.stringify(names)},tweakccWanted=String(tweakccArgs??"").trim(),` +
    `tweakccSay=(message)=>tweakccDone(message,{display:"system"}),` +
    // The session store memoizes its tool pool on the permission context's
    // identity, so a pool filtered under the previous toolset would be reused;
    // a fresh context object makes the next query rebuild it.
    `tweakccRefresh=()=>tweakccContext?.setAppState?.(tweakccState=>({...tweakccState,toolPermissionContext:{...tweakccState.toolPermissionContext}})),` +
    // A configured toolset named `default`/`none` wins over the reset aliases.
    `tweakccSet=(name)=>{if(name==="__tweakcc_default"||!tweakccNames.includes(name)&&(name==="default"||name==="none")){globalThis.__tweakccToolset=void 0;tweakccRefresh();tweakccSay("Toolset cleared; using the mode default.");return}` +
    `if(!tweakccNames.includes(name)){tweakccSay("Unknown toolset: "+name+". Available: "+tweakccNames.join(", "));return}` +
    `globalThis.__tweakccToolset=name;tweakccRefresh();tweakccSay("Toolset changed to "+name+".")};` +
    `if(tweakccWanted){tweakccSet(tweakccWanted);return null}` +
    `const tweakccCurrent=globalThis.__tweakccToolsetName?.(tweakccContext?.getAppState?.()?.toolPermissionContext);` +
    `return ${h}(${box},{flexDirection:"column",paddingX:1},` +
    `${h}(${text},{bold:!0,color:"suggestion"},"Select toolset"),` +
    `${h}(${text},{dimColor:!0},"A toolset limits which tools Claude can see and call."),` +
    `${h}(${box},{marginY:1},${h}(${text},null,"Current: "+(tweakccCurrent??"none (all tools)"))),` +
    `${h}(${select},{options:${options},defaultValue:tweakccCurrent,defaultFocusValue:tweakccCurrent,onChange:tweakccSet,onCancel:()=>tweakccSay("Toolset not changed.")}),` +
    `${h}(${box},{marginTop:1},${h}(${text},{dimColor:!0,italic:!0},"Enter to confirm \\u00b7 Esc to cancel \\u00b7 managed with tweakcc")))` +
    `}})}`
  );
};

export const writeToolsets = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null,
  acceptEditsToolset?: string | null,
  planModeToolset?: string | null
): string | null => {
  // Return if no toolsets are configured
  if (!toolsets || toolsets.length === 0) {
    return oldFile;
  }

  if (isGraphContextActive()) {
    return writeToolsetsCodeSplit(
      oldFile,
      toolsets,
      defaultToolset,
      acceptEditsToolset,
      planModeToolset
    );
  }

  let result: string | null = oldFile;

  // Step 1: Add toolset field to app state
  result = writeToolsetFieldToAppState(result);
  if (!result) {
    console.error(
      'patch: toolsets: step 1 failed (writeToolsetFieldToAppState)'
    );
    return null;
  }

  // Step 2: Modify tool fetching useMemo
  result = writeToolFetchingUseMemo(
    result,
    toolsets,
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );
  if (!result) {
    console.error('patch: toolsets: step 2 failed (writeToolFetchingUseMemo)');
    return null;
  }

  // Step 2b: Patch computeTools() to filter API-bound tools
  result = writeComputeToolsFilter(
    result,
    toolsets,
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );
  if (!result) {
    console.error('patch: toolsets: step 2b failed (writeComputeToolsFilter)');
    return null;
  }

  // Step 2c: Patch the non-interactive --print tool context
  result = writePrintToolsFilter(
    result,
    toolsets,
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );
  if (!result) {
    console.error('patch: toolsets: step 2c failed (writePrintToolsFilter)');
    return null;
  }

  result = writeTaskAgentFrontmatterToolsFix(result);
  result = writeSubagentResolvedToolContextFix(result);

  // Step 2d: Patch "No such tool available" error messages to be toolset-aware
  const result2d = writeToolsetAwareErrors(result, toolsets, defaultToolset);
  if (!result2d) {
    console.error(
      'patch: toolsets: step 2d failed (writeToolsetAwareErrors) — continuing without friendlier errors'
    );
  } else {
    result = result2d;
  }

  // Step 3: Add toolset component definition
  result = writeToolsetComponentDefinition(
    result,
    toolsets,
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );
  if (!result) {
    console.error(
      'patch: toolsets: step 3 failed (writeToolsetComponentDefinition)'
    );
    return null;
  }

  // Step 4: Add slash command definition
  result = writeSlashCommandDefinition(result);
  if (!result) {
    console.error(
      'patch: toolsets: step 4 failed (writeSlashCommandDefinition)'
    );
    return null;
  }

  // Step 5: Insert state getter in statusline component
  result = insertShiftTabAppStateVar(
    result,
    defaultToolset,
    acceptEditsToolset,
    planModeToolset
  );
  if (!result) {
    console.error('patch: toolsets: step 5 failed (insertShiftTabAppStateVar)');
    return null;
  }

  // Step 6: Append toolset name to mode display
  result = appendToolsetToModeDisplay(result);
  if (!result) {
    console.error(
      'patch: toolsets: step 6 failed (appendToolsetToModeDisplay)'
    );
    return null;
  }

  // Step 7: Append toolset name to shortcuts display
  result = appendToolsetToShortcutsDisplay(result);
  if (!result) {
    console.error(
      'patch: toolsets: step 7 failed (appendToolsetToShortcutsDisplay)'
    );
    return null;
  }

  // Step 8: Mode-change toolset switching (optional)
  if (defaultToolset && (acceptEditsToolset || planModeToolset)) {
    const effectiveAcceptEditsToolset = acceptEditsToolset ?? defaultToolset;
    const effectivePlanModeToolset = planModeToolset ?? defaultToolset;

    // First, add setState access at the tool change component scope
    result = addCurrentToolsetAtToolChangeComponentScope(
      result,
      defaultToolset,
      effectiveAcceptEditsToolset,
      effectivePlanModeToolset
    );
    if (!result) {
      console.error(
        'patch: toolsets: step 8a failed (addCurrentToolsetAtToolChangeComponentScope)'
      );
      return null;
    }

    // Then, inject the mode change toolset switching code
    result = writeModeChangeUpdateToolset(
      result,
      defaultToolset,
      effectiveAcceptEditsToolset,
      effectivePlanModeToolset
    );
    if (!result) {
      console.error(
        'patch: toolsets: step 8b failed (writeModeChangeUpdateToolset)'
      );
      return null;
    }
  }

  return result;
};
