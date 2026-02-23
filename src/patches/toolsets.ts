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
  writeSlashCommandDefinition as writeSlashCommandDefinitionToArray,
} from './slashCommands';
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
  // Pattern matches the Select component's function signature
  const selectPattern =
    /\.createElement\(([$\w]+),.{0,100}"Yes, use recommended settings"/;
  const match = fileContents.match(selectPattern);
  if (!match) {
    console.error(
      'patch: findSelectComponentName: failed to find selectPattern'
    );
    return null;
  }

  return match[1];
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
    console.error(
      'patch: findDividerComponentName: failed to find dividerPattern'
    );
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
  const pattern =
    /function ([$\w]+)\(.{0,110}`Your selector in.{0,1000}?function ([$\w]+)\(\)\{return [$\w]+\(\)\.setState\}/;
  const match = fileContents.match(pattern);

  if (!match) {
    console.error(
      'patch: getAppStateSelectorAndUseState: failed to find pattern'
    );
    return null;
  }

  return {
    appStateUseSelectorFn: match[1],
    appStateSetState: match[2],
  };
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
export const writeToolsetFieldToAppState = (
  oldFile: string,
  defaultToolset: string | null
): string | null => {
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
  const toolsetValue = defaultToolset
    ? JSON.stringify(defaultToolset)
    : 'undefined';
  const textToInsert = `,toolset:${toolsetValue}`;
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
  toolsets: Toolset[]
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

  // Generate the replacement code
  const replacement = `let currentToolset = ${appStateUseSelectorFn}(state => state.toolset);
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
 * Sub-patch 3: Add the toolset component definition
 */
export const writeToolsetComponentDefinition = (
  oldFile: string,
  toolsets: Toolset[]
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
  if (!dividerComponent) {
    console.error('patch: toolsets: failed to find Divider component');
    return null;
  }

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

  // Generate the component code
  const componentCode = `const toolsetComp = ({ onExit, input }) => {
  const currentToolset = ${appStateUseSelectorFn}(state => state.toolset);

  const setState = ${appStateSetState}();

  // Handle command-line argument
  if (input !== "" && input != null) {
    if (!${toolsetNames}.includes(input)) {
      onExit(${chalkVar}.red(\`\${${chalkVar}.bold(input)} is not a valid toolset. Valid toolsets: ${toolsets.map(t => t.name).join(', ')}\`));
      return;
    } else {
      setState(prev => ({ ...prev, toolset: input }));
      onExit(\`Toolset changed to \${${chalkVar}.bold(input)}\`);
      return;
    }
  }

  // Render interactive UI
  return ${reactVar}.createElement(
    ${boxComponent},
    { flexDirection: "column" },
    ${reactVar}.createElement(${dividerComponent}, { dividerColor: "permission" }),
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
            setState(prev => ({ ...prev, toolset: input }));
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
  // Search for the bash mode indicator
  const bashModePattern = /\{color:"bashBorder"\},"! for bash mode"/;
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
export const insertShiftTabAppStateVar = (oldFile: string): string | null => {
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
  const codeToInsert = `let currentToolset=${appStateUseSelectorFn}(state => state.toolset);`;

  const newFile =
    oldFile.slice(0, insertionPoint) +
    codeToInsert +
    oldFile.slice(insertionPoint);

  showDiff(oldFile, newFile, codeToInsert, insertionPoint, insertionPoint);

  return newFile;
};

/**
 * Append the toolset name to the mode display text
 */
export const appendToolsetToModeDisplay = (oldFile: string): string | null => {
  // Find the pattern where mode text is rendered
  // Looking for: tl(Y).toLowerCase(), " on"
  // We want to change it to: tl(Y).toLowerCase(), " on: ", currentToolset || "undefined"

  const modeDisplayPattern = /([$\w]+)\((\w+)\)\.toLowerCase\(\)," on"/;
  const match = oldFile.match(modeDisplayPattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: toolsets: appendToolsetToModeDisplay: failed to find mode display pattern'
    );
    return null;
  }

  const tlFunction = match[1];
  const modeVar = match[2];

  // Replace with the new pattern that includes toolset
  const oldText = match[0];
  // insertShiftTabAppStateVar provides the definition for currentToolset.
  const newText = `${tlFunction}(${modeVar}).toLowerCase()," on [",currentToolset||"undefined","]"`;

  const newFile = oldFile.replace(oldText, newText);

  if (newFile === oldFile) {
    console.error(
      'patch: toolsets: appendToolsetToModeDisplay: failed to modify mode display'
    );
    return null;
  }

  showDiff(
    oldFile,
    newFile,
    newText,
    match.index,
    match.index + oldText.length
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

  // Use the last match (there are two in 2.0.37, 1 in .41).
  const match = matches.at(-1);
  if (!match || match.index === undefined) {
    console.error(
      "patch: toolsets: appendToolsetToShortcutsDisplay: could not find '? for shortcuts'"
    );
    return null;
  }

  // Replace with the new pattern that includes toolset
  const oldText = match[0];
  const newText = `"? for shortcuts [",currentToolset||"undefined","]"`;

  const newFile = oldFile.replace(oldText, newText);
  if (newFile === oldFile) {
    console.error(
      'patch: toolsets: appendToolsetToModeDisplay: failed to modify mode display'
    );
    return null;
  }

  showDiff(
    oldFile,
    newFile,
    newText,
    match.index,
    match.index + oldText.length
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
    /[\w$]+\([\w$]+,function\([\w$]+\)\{[\w$]+\("tengu_ext_at_mentioned",\{\}\);/;
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
  oldFile: string
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

  // Inject the currentToolset access right at the start of the component scope
  const injectionCode = `const currentToolset = ${appStateUseSelectorFn}(state => state.toolset);`;

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
  planModeToolset: string,
  defaultToolset: string
): string | null => {
  const modeChangeResult = findModeChange(oldFile);
  if (!modeChangeResult) {
    return null;
  }

  const { index: modeChangeIndex, modeVar, setStateVar } = modeChangeResult;

  // Build the injection code using setState directly
  const injectionCode = `if(${modeVar}==="plan"){${setStateVar}((prev)=>({...prev,toolset:${JSON.stringify(planModeToolset)}}));}else{${setStateVar}((prev)=>({...prev,toolset:${JSON.stringify(defaultToolset)}}));}`;

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
 * @param defaultToolset - The default toolset name (or null)
 * @param planModeToolset - Optional toolset to switch to when entering plan mode
 */
export const writeToolsets = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null,
  planModeToolset?: string | null
): string | null => {
  // Return if no toolsets are configured
  if (!toolsets || toolsets.length === 0) {
    return oldFile;
  }

  let result: string | null = oldFile;

  // Step 1: Add toolset field to app state
  result = writeToolsetFieldToAppState(result, defaultToolset);
  if (!result) {
    console.error(
      'patch: toolsets: step 1 failed (writeToolsetFieldToAppState)'
    );
    return null;
  }

  // Step 2: Modify tool fetching useMemo
  result = writeToolFetchingUseMemo(result, toolsets);
  if (!result) {
    console.error('patch: toolsets: step 2 failed (writeToolFetchingUseMemo)');
    return null;
  }

  // Step 3: Add toolset component definition
  result = writeToolsetComponentDefinition(result, toolsets);
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
  result = insertShiftTabAppStateVar(result);
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
  if (planModeToolset && defaultToolset) {
    // First, add setState access at the tool change component scope
    result = addCurrentToolsetAtToolChangeComponentScope(result);
    if (!result) {
      console.error(
        'patch: toolsets: step 8a failed (addCurrentToolsetAtToolChangeComponentScope)'
      );
      return null;
    }

    // Then, inject the mode change toolset switching code
    result = writeModeChangeUpdateToolset(
      result,
      planModeToolset,
      defaultToolset
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
