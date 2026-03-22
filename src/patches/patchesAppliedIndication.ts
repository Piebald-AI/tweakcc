import {
  LocationResult,
  escapeIdent,
  findBoxComponent,
  findChalkVar,
  findTextComponent,
  getReactVar,
  showDiff,
} from './index';

/**
 * PATCH 1: Finds the location of the version output pattern in Claude Code's cli.js
 */
export const findVersionOutputLocation = (
  fileContents: string
): LocationResult | null => {
  // Pattern: }.VERSION} (Claude Code)
  const versionPattern = '}.VERSION} (Claude Code)';
  const versionIndex = fileContents.indexOf(versionPattern);
  if (versionIndex == -1) {
    console.error(
      'patch: patchesAppliedIndication: failed to find versionIndex'
    );
    return null;
  }

  return {
    startIndex: 0,
    endIndex: versionIndex + versionPattern.length,
  };
};

/**
 * PATCH 2: Finds the location to insert tweakcc version in the header
 */
const findTweakccVersionLocation = (
  fileContents: string
): LocationResult | null => {
  // Find Claude Code version display
  // Pre-React-compiler: X.createElement(Y,{bold:!0},"Claude Code")," ",Z.createElement(W,{dimColor:!0},"v",VAR)
  // Post-React-compiler (CC ≥2.1.79): X.createElement(Y,null,MEMO_VAR," ",X.createElement(Y,{dimColor:!0},"v",VAR))
  const pattern =
    /[^$\w]([$\w]+)\.createElement\(([$\w]+),\{bold:!0\},"Claude Code"\)," ",([$\w]+)\.createElement\(([$\w]+),\{dimColor:!0\},"v",[$\w]+\)/;
  const newPattern =
    /[^$\w]([$\w]+)\.createElement\(([$\w]+),null,[$\w]+," ",([$\w]+)\.createElement\(([$\w]+),\{dimColor:!0\},"v",[$\w]+\)\)/;
  const oldMatch = fileContents.match(pattern);
  const isNewPattern = !oldMatch;
  const match = oldMatch ?? fileContents.match(newPattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: patchesAppliedIndication: failed to find Claude Code version pattern'
    );
    return null;
  }

  // Old pattern: insert after the match (children are comma-separated at top level)
  // New pattern: insert BEFORE the last ) to add children inside the outer createElement
  const insertIndex = isNewPattern
    ? match.index + match[0].length - 1
    : match.index + match[0].length;
  return {
    startIndex: insertIndex,
    endIndex: insertIndex,
  };
};

/**
 * PATCH 4: Inserts tweakcc version in the indicator view
 * Returns the modified content and the position where the closing paren was added
 */
const applyIndicatorViewPatch = (
  fileContents: string,
  tweakccVersion: string,
  reactVar: string,
  boxComponent: string,
  textComponent: string,
  chalkVar: string
): { content: string; closingParenIndex: number } | null => {
  // 1. Find alignItems:"center",minHeight:<value>, where value can be a number or ternary
  const alignItemsPattern =
    /alignItems:"center",minHeight:([$\w]+\?\d+:\d+|\d+),?/;
  const alignItemsMatch = fileContents.match(alignItemsPattern);
  if (!alignItemsMatch || alignItemsMatch.index === undefined) {
    console.error(
      'patch: patchesAppliedIndication: failed to find alignItems pattern for PATCH 4'
    );
    return null;
  }

  // 2. Replace alignItems:"center",minHeight:<value>, with just minHeight:<value>,
  const minHeightValue = alignItemsMatch[1];
  let content =
    fileContents.slice(0, alignItemsMatch.index) +
    `minHeight:${minHeightValue},` +
    fileContents.slice(alignItemsMatch.index + alignItemsMatch[0].length);

  // 3. Go back 200 chars from the alignItems location
  const lookbackStart = Math.max(0, alignItemsMatch.index - 200);
  const lookbackSubstring = content.slice(
    lookbackStart,
    alignItemsMatch.index + 'minHeight:9,'.length + '},'.length
  );

  // 4. Find the LAST createElement call in that subsection to get the insertion point
  const createElementPattern =
    /[^$\w]([$\w]+)\.createElement\(([$\w]+),(?:\w+|\{[^}]+\}),/g;
  const matches = Array.from(lookbackSubstring.matchAll(createElementPattern));
  if (matches.length === 0) {
    console.error(
      'patch: patchesAppliedIndication: failed to find createElement for PATCH 4'
    );
    return null;
  }

  const lastMatch = matches[matches.length - 1];

  // Calculate the absolute position after the createElement call
  const matchPositionInFile =
    lookbackStart + lastMatch.index! + lastMatch[0].length;

  // 5. Insert the tweakcc version code after the createElement call
  const insertCode = `${reactVar}.createElement(${textComponent}, null, ${chalkVar}.blue.bold("     + tweakcc v${tweakccVersion}")),${reactVar}.createElement(${boxComponent},{alignItems:"center",flexDirection:"column"},`;

  const oldContent = content;
  content =
    content.slice(0, matchPositionInFile) +
    insertCode +
    content.slice(matchPositionInFile);

  showDiff(
    oldContent,
    content,
    insertCode,
    matchPositionInFile,
    matchPositionInFile
  );

  // 6. Use stack machine to find where to add the closing paren
  let level = 1;
  let currentIndex = matchPositionInFile + insertCode.length;
  let closingParenIndex = -1;

  while (currentIndex < content.length) {
    const ch = content[currentIndex];
    if (ch === '(') {
      level++;
    } else if (ch === ')') {
      if (level === 1) {
        // Found the location - this is where we add the closing paren
        closingParenIndex = currentIndex;
        break;
      }
      level--;
    }
    currentIndex++;
  }

  if (closingParenIndex === -1) {
    console.error(
      'patch: patchesAppliedIndication: failed to find closing paren for PATCH 4'
    );
    return null;
  }

  // 7. Add ")," at the location
  const oldContent2 = content;
  content =
    content.slice(0, closingParenIndex) +
    '),' +
    content.slice(closingParenIndex);

  showDiff(oldContent2, content, '),', closingParenIndex, closingParenIndex);

  return { content, closingParenIndex: closingParenIndex + 2 }; // +2 for the added "),"
};

/**
 * PATCH 5: Inserts patches applied list in the indicator view
 * Uses stack machine starting at level 2 to find insertion point
 */
const applyIndicatorPatchesListPatch = (
  fileContents: string,
  startIndex: number,
  reactVar: string,
  boxComponent: string,
  textComponent: string,
  chalkVar: string,
  patchesApplies: string[]
): string | null => {
  // Find the insertion point: the closing paren of the Fragment createElement that
  // wraps the entire header component output.
  //
  // Strategy 1 (CC ≥2.1.79): Find createElement(REACT.Fragment,null,...) near the
  // alignItems location and use its closing paren.
  // Strategy 2 (older CC): Use stack machine from startIndex at level 4.
  let insertionIndex = -1;

  // Strategy 1: Look for Fragment createElement after startIndex
  const fragmentPattern = /createElement\([$\w]+\.Fragment,null,/;
  const searchRegion = fileContents.slice(startIndex, startIndex + 5000);
  const fragmentMatch = searchRegion.match(fragmentPattern);

  if (fragmentMatch && fragmentMatch.index !== undefined) {
    // Walk to find the closing paren of this createElement call
    const fragStart = startIndex + fragmentMatch.index;
    let level = 1; // we're right after "createElement("
    const scanFrom = fragStart + fragmentMatch[0].length;
    for (let i = scanFrom; i < fileContents.length; i++) {
      const ch = fileContents[i];
      if (ch === '(') level++;
      else if (ch === ')') {
        level--;
        if (level === 0) {
          insertionIndex = i;
          break;
        }
      }
    }
  }

  // Strategy 2: Stack machine (older CC)
  if (insertionIndex === -1) {
    let level = 4;
    let currentIndex = startIndex;
    while (
      currentIndex < fileContents.length &&
      currentIndex < startIndex + 10000
    ) {
      const ch = fileContents[currentIndex];
      if (ch === '(') {
        level++;
      } else if (ch === ')') {
        if (level === 1) {
          insertionIndex = currentIndex;
          break;
        }
        level--;
      }
      currentIndex++;
    }
  }

  if (insertionIndex === -1) {
    console.error(
      'patch: patchesAppliedIndication: failed to find insertion point for PATCH 5'
    );
    return null;
  }

  // Build the patches applied list (same format as PATCH 3)
  const lines = [];
  lines.push(
    `,${reactVar}.createElement(${boxComponent}, { flexDirection: "column" },`
  );
  lines.push(
    `${reactVar}.createElement(${boxComponent}, null, ${reactVar}.createElement(${textComponent}, {color: "success", bold: true}, "┃ "), ${reactVar}.createElement(${textComponent}, {color: "success", bold: true}, "✓ tweakcc patches are applied")),`
  );
  for (let item of patchesApplies) {
    item = item.replace('CHALK_VAR', chalkVar);
    lines.push(
      `${reactVar}.createElement(${boxComponent}, null, ${reactVar}.createElement(${textComponent}, {color: "success", bold: true}, "┃ "), ${reactVar}.createElement(${textComponent}, {dimColor: true}, \`  * ${item}\`)),`
    );
  }
  lines.push('),');
  const patchesListCode = lines.join('');

  // Insert at the found location
  const oldContent = fileContents;
  const content =
    fileContents.slice(0, insertionIndex) +
    patchesListCode +
    fileContents.slice(insertionIndex);

  showDiff(
    oldContent,
    content,
    patchesListCode,
    insertionIndex,
    insertionIndex
  );

  return content;
};

/**
 * PATCH 3: Finds the location to insert the patches applied list
 */
const findPatchesListLocation = (
  fileContents: string
): LocationResult | null => {
  // 1. Find the version display area (may already be modified by PATCH 2)
  // Find the "Claude Code" that's near dimColor:!0},"v" (the header version display)
  const versionDisplayPattern =
    /"Claude Code".{0,200}\{dimColor:!0\},"v",[$\w]+\)/;
  const versionDisplayMatch = fileContents.match(versionDisplayPattern);
  if (!versionDisplayMatch || versionDisplayMatch.index === undefined) {
    console.error(
      'patch: patchesAppliedIndication: failed to find version display for patch 3'
    );
    return null;
  }
  const matchResult = { index: versionDisplayMatch.index };

  // 2. Go back 1500 chars from the match start
  const lookbackStart = Math.max(0, matchResult.index - 1500);
  const lookbackSubstring = fileContents.slice(
    lookbackStart,
    matchResult.index
  );

  // 3. Take the last `}function ([$\w]+)\(`
  const functionPattern = /\}function ([$\w]+)\(/g;
  const functionMatches = Array.from(
    lookbackSubstring.matchAll(functionPattern)
  );
  if (functionMatches.length === 0) {
    console.error(
      'patch: patchesAppliedIndication: failed to find header component function'
    );
    return null;
  }
  const lastFunctionMatch = functionMatches[functionMatches.length - 1];
  const headerComponentName = lastFunctionMatch[1];

  // 4. Search for the createElement call with the header component
  const createHeaderPattern = new RegExp(
    `[^$\\w]([$\\w]+)\\.createElement\\(${escapeIdent(headerComponentName)},null\\),?`
  );
  const createHeaderMatch = fileContents.match(createHeaderPattern);
  if (!createHeaderMatch || createHeaderMatch.index === undefined) {
    console.error(
      'patch: patchesAppliedIndication: failed to find createElement call for header'
    );
    return null;
  }

  // 5. In CC ≥2.1.79 (React compiler), the header createElement is inside a
  // memo cache conditional (g=J&&createElement(header,null),A[13]=J,...).
  // Inserting after it would break the conditional. Instead, find where the
  // header variable is used as a child in a parent createElement and insert
  // after it there.
  //
  // Find: createElement(header,null) assigns to some variable (e.g. 'g')
  // Then find where that variable appears as a child: ...R,h,I,g))
  // Insert after the variable reference in the children list.

  // First check if we're inside a memo conditional
  const afterMatch = fileContents.slice(
    createHeaderMatch.index + createHeaderMatch[0].length,
    createHeaderMatch.index + createHeaderMatch[0].length + 50
  );

  if (/^[$\w]+\[\d+\]=/.test(afterMatch)) {
    // React compiler memo pattern — find where the variable is used as a child
    // The variable is assigned like: g=J&&createElement(header,null),A[13]=J,A[14]=g
    // Look backwards from createElement to find the variable name
    const beforeCreate = fileContents.slice(
      Math.max(0, createHeaderMatch.index - 20),
      createHeaderMatch.index + 1
    );
    const varMatch = beforeCreate.match(/([$\w]+)=[$\w]+&&[^$\w]?$/);
    if (varMatch) {
      const headerVar = varMatch[1];
      // Find where this variable is used as a child: ,headerVar) or ,headerVar,
      // in a createElement call after the assignment
      const searchAfter = fileContents.slice(
        createHeaderMatch.index,
        createHeaderMatch.index + 2000
      );
      const childUsePattern = new RegExp(`,${escapeIdent(headerVar)}\\)`);
      const childUseMatch = searchAfter.match(childUsePattern);
      if (childUseMatch && childUseMatch.index !== undefined) {
        // Insert right before the ) — after the header variable as a sibling
        const insertIndex =
          createHeaderMatch.index +
          childUseMatch.index +
          childUseMatch[0].length -
          1; // before the )
        return {
          startIndex: insertIndex,
          endIndex: insertIndex,
        };
      }
    }
  }

  // Fallback for older CC: insert after the createElement call
  const insertIndex = createHeaderMatch.index + createHeaderMatch[0].length;
  return {
    startIndex: insertIndex,
    endIndex: insertIndex,
  };
};

/**
 * Modifies the CLI to show patches applied indication
 * - PATCH 1: Modifies version output text
 * - PATCH 2: Adds tweakcc version to header
 * - PATCH 3: Adds patches applied list
 */
export const writePatchesAppliedIndication = (
  fileContents: string,
  tweakccVersion: string,
  patchesApplies: string[],
  showTweakccVersion: boolean = true,
  showPatchesApplied: boolean = true
): string | null => {
  // PATCH 1: Version output modification
  const versionOutputLocation = findVersionOutputLocation(fileContents);
  if (!versionOutputLocation) {
    console.error(
      'patch: patchesAppliedIndication: failed to version output location'
    );
    return null;
  }

  const newText = `\\n${tweakccVersion} (tweakcc)`;
  // Patch ALL occurrences of the version pattern (commander help text + console.log early exit)
  const versionPattern = '}.VERSION} (Claude Code)';
  let content = fileContents.replaceAll(
    versionPattern,
    versionPattern + newText
  );

  showDiff(
    fileContents,
    content,
    newText,
    versionOutputLocation.endIndex,
    versionOutputLocation.endIndex
  );

  // Find shared components needed by multiple patches
  const chalkVar = findChalkVar(fileContents);
  if (!chalkVar) {
    console.error(
      'patch: patchesAppliedIndication: failed to find chalk variable'
    );
    return null;
  }

  const textComponent = findTextComponent(fileContents);
  if (!textComponent) {
    console.error(
      'patch: patchesAppliedIndication: failed to find text component'
    );
    return null;
  }

  const reactVar = getReactVar(fileContents);
  if (!reactVar) {
    console.error(
      'patch: patchesAppliedIndication: failed to find React variable'
    );
    return null;
  }

  const boxComponent = findBoxComponent(fileContents);
  if (!boxComponent) {
    console.error(
      'patch: patchesAppliedIndication: failed to find Box component'
    );
    return null;
  }

  // PATCH 2: Add tweakcc version to header (if enabled)
  if (showTweakccVersion) {
    const tweakccVersionLoc = findTweakccVersionLocation(content);
    if (!tweakccVersionLoc) {
      console.error('patch: patchesAppliedIndication: patch 2 failed');
      return null;
    }

    const tweakccVersionCode = `, " ",${reactVar}.createElement(${textComponent}, null, ${chalkVar}.blue.bold('+ tweakcc v${tweakccVersion}'))`;

    const oldContent2 = content;
    content =
      content.slice(0, tweakccVersionLoc.startIndex) +
      tweakccVersionCode +
      content.slice(tweakccVersionLoc.endIndex);

    showDiff(
      oldContent2,
      content,
      tweakccVersionCode,
      tweakccVersionLoc.startIndex,
      tweakccVersionLoc.endIndex
    );
  }

  // PATCH 3: Add patches applied list (if enabled)
  if (showPatchesApplied) {
    const patchesListLoc = findPatchesListLocation(content);
    if (!patchesListLoc) {
      console.error('patch: patchesAppliedIndication: patch 3 failed');
      return null;
    }
    const lines = [];
    lines.push(
      `,${reactVar}.createElement(${boxComponent}, { flexDirection: "column" },`
    );
    lines.push(
      `${reactVar}.createElement(${boxComponent}, null, ${reactVar}.createElement(${textComponent}, {color: "success", bold: true}, "┃ "), ${reactVar}.createElement(${textComponent}, {color: "success", bold: true}, "✓ tweakcc patches are applied")),`
    );
    for (let item of patchesApplies) {
      item = item.replace('CHALK_VAR', chalkVar);
      lines.push(
        `${reactVar}.createElement(${boxComponent}, null, ${reactVar}.createElement(${textComponent}, {color: "success", bold: true}, "┃ "), ${reactVar}.createElement(${textComponent}, {dimColor: true}, \`  * ${item}\`)),`
      );
    }
    lines.push('),');
    const patchesListCode = lines.join('\n');

    const oldContent3 = content;
    content =
      content.slice(0, patchesListLoc.startIndex) +
      patchesListCode +
      content.slice(patchesListLoc.endIndex);

    showDiff(
      oldContent3,
      content,
      patchesListCode,
      patchesListLoc.startIndex,
      patchesListLoc.endIndex
    );
  }

  // PATCH 4: Add tweakcc version to indicator view (if enabled)
  let patch4ClosingParenIndex = -1;
  if (showTweakccVersion) {
    const patch4Result = applyIndicatorViewPatch(
      content,
      tweakccVersion,
      reactVar,
      boxComponent,
      textComponent,
      chalkVar
    );
    if (!patch4Result) {
      console.error('patch: patchesAppliedIndication: patch 4 failed');
      return null;
    }

    content = patch4Result.content;
    patch4ClosingParenIndex = patch4Result.closingParenIndex;
  }

  // PATCH 5: Add patches applied list to indicator view (if enabled)
  if (showPatchesApplied) {
    // If patch 4 wasn't applied, we need to find the insertion point
    if (patch4ClosingParenIndex === -1) {
      // Find alignItems:"center",minHeight:<value>, to use as reference point
      const alignItemsPattern =
        /alignItems:"center",minHeight:([$\w]+\?\d+:\d+|\d+),?/;
      const alignItemsMatch = content.match(alignItemsPattern);
      if (!alignItemsMatch || alignItemsMatch.index === undefined) {
        console.error(
          'patch: patchesAppliedIndication: failed to find reference point for PATCH 5'
        );
        return null;
      }
      patch4ClosingParenIndex =
        alignItemsMatch.index + alignItemsMatch[0].length;
    }

    const finalContent = applyIndicatorPatchesListPatch(
      content,
      patch4ClosingParenIndex,
      reactVar,
      boxComponent,
      textComponent,
      chalkVar,
      patchesApplies
    );
    if (!finalContent) {
      console.error('patch: patchesAppliedIndication: patch 5 failed');
      return null;
    }
    content = finalContent;
  }

  return content;
};
