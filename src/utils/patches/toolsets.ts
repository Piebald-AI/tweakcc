// Please see the note about writing patches in ./index.ts.

import {
  showDiff,
  findChalkVar,
  findTextComponent,
  findBoxComponent,
  getReactVar,
} from './index.js';
import {
  findSlashCommandListEndPosition,
  writeSlashCommandDefinition as writeSlashCommandDefinitionToArray,
} from './slashCommands.js';
import { Toolset } from '../types.js';

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
    /function ([$\w]+)\(\{(?:(?:isDisabled|hideIndexes|visibleOptionCount|highlightText|options|defaultValue|onCancel|onChange|onFocus|focusValue|layout|disableSelection):[$\w]+(?:=(?:[^,]+,|[^}]+\})|[,}]))+\)/g;

  const matches = Array.from(fileContents.matchAll(selectPattern));
  if (matches.length === 0) {
    console.error(
      'patch: findSelectComponentName: failed to find selectPattern'
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
 * Find Divider component using function signature pattern
 */
export const findDividerComponentName = (
  fileContents: string
): string | null => {
  // Pattern matches the Divider component's function signature
  const dividerPattern =
    /function ([$\w]+)\(\{(?:(?:orientation|title|width|padding|titlePadding|titleColor|titleDimColor|dividerChar|dividerColor|dividerDimColor|boxProps):[$\w]+(?:=(?:[^,]+,|[^}]+\})|[,}]))+\)/g;

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
  const appComponentPattern =
    /function ([$\w]+)\(\{(?:(?:commands|debug|initialPrompt|initialTools|initialMessages|initialCheckpoints|initialFileHistorySnapshots|mcpClients|dynamicMcpConfig|autoConnectIdeFlag|strictMcpConfig|systemPrompt|appendSystemPrompt|onBeforeQuery|onTurnComplete|disabled):[$\w]+(?:=(?:[^,]+,|[^}]+\})|[,}]))+\)/g;

  const matches = Array.from(fileContents.matchAll(appComponentPattern));
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
 * Get app state variable and getter function names
 */
export const getAppStateVarAndGetterFunction = (
  fileContents: string
): { appStateVar: string; appStateGetterFunction: string } | null => {
  const bodyStart = getMainAppComponentBodyStart(fileContents);
  if (bodyStart === null) {
    console.error(
      'patch: getAppStateVarAndGetterFunction: failed to find bodyStart'
    );
    return null;
  }

  // Look at the next 20 chars for the useState pattern (NOT 200)
  const chunk = fileContents.slice(bodyStart, bodyStart + 20);
  const statePattern = /let\[([$\w]+),[$\w]+\]=([$\w]+)\(\)/;
  const match = chunk.match(statePattern);

  if (!match) {
    console.error(
      'patch: getAppStateVarAndGetterFunction: failed to find statePattern'
    );
    return null;
  }

  return {
    appStateVar: match[1],
    appStateGetterFunction: match[2],
  };
};

/**
 * Get the location and identifiers for the tool fetching useMemo
 */
export const getToolFetchingUseMemoLocation = (
  fileContents: string
): {
  startIndex: number;
  endIndex: number;
  outputVarName: string;
  reactVarName: string;
  toolFilterFunction: string;
  toolPermissionContextVar: string;
} | null => {
  const bodyStart = getMainAppComponentBodyStart(fileContents);
  if (bodyStart === null) {
    console.error(
      'patch: getToolFetchingUseMemoLocation: failed to find bodyStart'
    );
    return null;
  }

  // Look at the next 300 chars
  const chunk = fileContents.slice(bodyStart, bodyStart + 300);

  // Pattern to match: let outputVar=reactVar.useMemo(()=>filterFunc(contextVar),[contextVar])
  const useMemoPattern =
    /let ([$\w]+)=([$\w]+)\.useMemo\(\(\)=>([$\w]+)\(([$\w]+)\),\[\4\]\)/;
  const match = chunk.match(useMemoPattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: getToolFetchingUseMemoLocation: failed to find useMemoPattern'
    );
    return null;
  }

  const absoluteStart = bodyStart + match.index;
  const absoluteEnd = absoluteStart + match[0].length;

  return {
    startIndex: absoluteStart,
    endIndex: absoluteEnd,
    outputVarName: match[1],
    reactVarName: match[2],
    toolFilterFunction: match[3],
    toolPermissionContextVar: match[4],
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

  return newFile;
};

/**
 * Sub-patch 2: Modify tool fetching useMemo to respect toolset
 */
export const writeToolFetchingUseMemo = (
  oldFile: string,
  toolsets: Toolset[]
): string | null => {
  const useMemoLoc = getToolFetchingUseMemoLocation(oldFile);
  if (!useMemoLoc) {
    console.error(
      'patch: toolsets: failed to find tool fetching useMemo location'
    );
    return null;
  }

  const stateInfo = getAppStateVarAndGetterFunction(oldFile);
  if (!stateInfo) {
    console.error('patch: toolsets: failed to find app state info');
    return null;
  }

  const { appStateVar } = stateInfo;
  const {
    startIndex,
    endIndex,
    outputVarName,
    reactVarName,
    toolFilterFunction,
    toolPermissionContextVar,
  } = useMemoLoc;

  // Create toolsets mapping: { "toolset-name": ["tool1", "tool2", ...] }
  const toolsetsJSON = JSON.stringify(
    Object.fromEntries(
      toolsets.map(ts => [
        ts.name,
        ts.allowedTools === '*' ? '*' : ts.allowedTools,
      ])
    )
  );

  // Generate the new useMemo code
  const newUseMemo = `let ${outputVarName} = ${reactVarName}.useMemo(() => {
    const toolsets = ${toolsetsJSON};
    if (toolsets.hasOwnProperty(${appStateVar}.toolset)) {
      const allowedTools = toolsets[${appStateVar}.toolset];
      if (allowedTools === "*") {
        return ${toolFilterFunction}(${toolPermissionContextVar});
      } else {
        return ${toolFilterFunction}(${toolPermissionContextVar}).filter(toolDef =>
          allowedTools.includes(toolDef.name)
        );
      }
    } else {
      return ${toolFilterFunction}(${toolPermissionContextVar});
    }
  }, [${toolFilterFunction}, ${appStateVar}.toolset])`;

  const newFile =
    oldFile.slice(0, startIndex) + newUseMemo + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, newUseMemo, startIndex, endIndex);

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

  const stateInfo = getAppStateVarAndGetterFunction(oldFile);
  if (!stateInfo) {
    console.error('patch: toolsets: failed to find app state getter');
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error('patch: toolsets: failed to find chalk variable');
    return null;
  }

  const { appStateGetterFunction } = stateInfo;

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
  const [state, setState] = ${appStateGetterFunction}();

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
        ${reactVar}.createElement(${textComponent}, { bold: true }, state.toolset || "undefined")
      ),
      ${reactVar}.createElement(${boxComponent}, { marginBottom: 1 },
        ${reactVar}.createElement(${selectComponent}, {
          options: ${selectOptions},
          onChange: (input) => {
            setState(prev => ({ ...prev, toolset: input }));
            onExit(\`Toolset changed to \${${chalkVar}.bold(input)}\`);
          },
          onCancel: () => onExit(\`Toolset not changed (left as \${${chalkVar}.bold(state.toolset)})\`)
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
  async call(onExit, ctx, input) {
    return ${reactVar}.createElement(toolsetComp, { onExit, input });
  },
  userFacingName() {
    return "toolset";
  }
}`;

  // Use the imported function to write the command definition
  return writeSlashCommandDefinitionToArray(oldFile, commandDef);
};

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Apply all toolset patches to the file
 */
export const writeToolsets = (
  oldFile: string,
  toolsets: Toolset[],
  defaultToolset: string | null
): string | null => {
  // Return null if no toolsets configured
  if (!toolsets || toolsets.length === 0) {
    return null;
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

  return result;
};
