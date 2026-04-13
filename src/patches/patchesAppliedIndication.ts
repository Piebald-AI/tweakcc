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
 * PATCH 2: Finds the VyK compact header and returns locations for:
 *   1. Where to insert the tweakcc variable declaration (before the I= assignment)
 *   2. Where to insert the variable reference (before the closing paren of I's createElement)
 */
const findTweakccVersionLocations = (
  fileContents: string
): {
  varInsertIndex: number;
  refInsertIndex: number;
  reactVar: string;
  textComponent: string;
} | null => {
  // Find: createElement(TEXT,{bold:!0},"Claude Code"),CACHE[N]=x;else x=CACHE[N];
  // This gives us the position right after the x assignment block — where we insert our var
  const boldPattern =
    /createElement\(([$\w]+),\{bold:!0\},"Claude Code"\),([$\w]+)\[\d+\]=[$\w]+;else [$\w]+=([$\w]+)\[\d+\]/;
  const boldMatch = fileContents.match(boldPattern);
  if (!boldMatch || boldMatch.index === undefined) {
    console.error(
      'patch: patchesAppliedIndication: PATCH 2 failed to find bold Claude Code pattern'
    );
    return null;
  }
  const textComponent = boldMatch[1];

  // Find the end of the "else x=q[8];" statement — insert our var declaration after it
  const afterBold = boldMatch.index + boldMatch[0].length;
  // Skip past the semicolon
  const semiIndex = fileContents.indexOf(';', afterBold);
  if (semiIndex === -1) return null;
  const varInsertIndex = semiIndex + 1;

  // Now find the I= createElement that wraps x and the version
  // Pattern: REACT.createElement(TEXT,null,MEMO_VAR," ",REACT.createElement(TEXT,{dimColor:!0},"v",VAR))
  const newPattern =
    /[^$\w]([$\w]+)\.createElement\(([$\w]+),null,[$\w]+," ",([$\w]+)\.createElement\(([$\w]+),\{dimColor:!0\},"v",[$\w]+\)\)/;
  const match = fileContents.match(newPattern);
  if (!match || match.index === undefined) {
    // Fallback: old pattern (pre-React-compiler)
    const oldPattern =
      /[^$\w]([$\w]+)\.createElement\(([$\w]+),\{bold:!0\},"Claude Code"\)," ",([$\w]+)\.createElement\(([$\w]+),\{dimColor:!0\},"v",[$\w]+\)/;
    const oldMatch = fileContents.match(oldPattern);
    if (!oldMatch || oldMatch.index === undefined) {
      console.error(
        'patch: patchesAppliedIndication: PATCH 2 failed to find version createElement'
      );
      return null;
    }
    return {
      varInsertIndex,
      refInsertIndex: oldMatch.index + oldMatch[0].length,
      reactVar: oldMatch[1],
      textComponent,
    };
  }

  // Insert before the last ) of the createElement
  return {
    varInsertIndex,
    refInsertIndex: match.index + match[0].length - 1,
    reactVar: match[1],
    textComponent,
  };
};

/**
 * PATCH 4: Inserts tweakcc version in the indicator view
 * Returns the modified content and the position where the closing paren was added
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // 5. Find the variable assigned from createElement(header,null) and locate
  // where it's used as a child in a parent createElement. Insert after it there.
  // This works regardless of whether PATCH 2 has already modified the area.

  // Look backwards from createElement to find the variable name
  const beforeCreate = fileContents.slice(
    Math.max(0, createHeaderMatch.index - 30),
    createHeaderMatch.index + 1
  );
  // Match: VAR=COND&&  or  VAR=
  const varMatch = beforeCreate.match(/([$\w]+)=(?:[$\w]+&&)?[^$\w]?$/);
  if (varMatch) {
    const headerVar = varMatch[1];
    // Find where this variable is used as a child in a createElement:
    // ,headerVar, or ,headerVar) — in a flexDirection:"column" parent
    const searchAfter = fileContents.slice(
      createHeaderMatch.index,
      createHeaderMatch.index + 2000
    );
    // Look for ,VAR, (used as middle child) or ,VAR) (used as last child)
    const childUsePattern = new RegExp(`,${escapeIdent(headerVar)}([,\\)])`);
    const childUseMatch = searchAfter.match(childUsePattern);
    if (childUseMatch && childUseMatch.index !== undefined) {
      // Insert right after the variable reference (before the , or ))
      const insertIndex =
        createHeaderMatch.index +
        childUseMatch.index +
        childUseMatch[0].length -
        childUseMatch[1].length; // before the trailing , or )
      return {
        startIndex: insertIndex,
        endIndex: insertIndex,
      };
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

  // PATCH 2: Add tweakcc version to all header paths.
  // Path A: SyK banner borderText (chalk template literal)
  // Path B: SyK compact borderText (chalk call)
  // Path C: VyK compact React createElement (separate variable, like CC does)
  if (showTweakccVersion) {
    // Path A: Banner borderText — ` ${N7("claude",e)("Claude Code")} ${N7("inactive",e)(`v${x}`)} `
    const bannerPattern =
      /(\$\{([$\w]+)\("inactive",([$\w]+)\)\(`v\$\{[$\w]+\}`\)\}) `,/;
    const bannerMatch = content.match(bannerPattern);
    if (bannerMatch && bannerMatch.index !== undefined) {
      const oldStr = bannerMatch[0];
      const n7Fn = bannerMatch[2];
      const themeVar = bannerMatch[3];
      const newStr = `${bannerMatch[1]} \${${n7Fn}("success",${themeVar})("+ tweakcc v${tweakccVersion}")} \`,`;
      content = content.replace(oldStr, newStr);
    }

    // Path B: SyK compact borderText — K6=N7("claude",e)(" Claude Code ")
    content = content.replace(
      /([$\w]+\("claude",[$\w]+\)\(" Claude Code) ("\))/,
      `$1 + tweakcc v${tweakccVersion} $2`
    );
    const locs = findTweakccVersionLocations(content);
    if (!locs) {
      console.error('patch: patchesAppliedIndication: patch 2 failed');
      return null;
    }

    // Step 1: Insert variable declaration after the "Claude Code" bold element
    const varName = '_tw';
    const varDecl = `let ${varName}=${locs.reactVar}.createElement(${locs.textComponent},{color:"success",bold:true},"+ tweakcc v${tweakccVersion}");`;

    const oldContent2a = content;
    content =
      content.slice(0, locs.varInsertIndex) +
      varDecl +
      content.slice(locs.varInsertIndex);

    showDiff(
      oldContent2a,
      content,
      varDecl,
      locs.varInsertIndex,
      locs.varInsertIndex
    );

    // Step 2: Insert variable reference as sibling in the parent createElement
    // (adjust refInsertIndex for the inserted varDecl)
    const adjustedRefIndex = locs.refInsertIndex + varDecl.length;
    const refCode = `," ",${varName}`;

    const oldContent2b = content;
    content =
      content.slice(0, adjustedRefIndex) +
      refCode +
      content.slice(adjustedRefIndex);

    showDiff(
      oldContent2b,
      content,
      refCode,
      adjustedRefIndex,
      adjustedRefIndex
    );
  }

  // PATCH 3: Add patches applied list (if enabled)
  if (showPatchesApplied) {
    const patchesListLoc = findPatchesListLocation(content);
    if (!patchesListLoc) {
      console.error(
        'patch: patchesAppliedIndication: patch 3 skipped (version display pattern changed by PATCH 2)'
      );
    } else {
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
      let patchesListCode = lines.join('\n');

      // Avoid double comma at the start
      if (
        patchesListLoc.startIndex > 0 &&
        content[patchesListLoc.startIndex - 1] === ',' &&
        patchesListCode.startsWith(',')
      ) {
        patchesListCode = patchesListCode.slice(1);
      }

      // Avoid double comma at the end — if patches list ends with ',' and
      // the next char is also ','
      if (
        patchesListCode.endsWith(',') &&
        content[patchesListLoc.startIndex] === ','
      ) {
        patchesListCode = patchesListCode.slice(0, -1);
      }

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
  }

  // PATCH 4 & 5 disabled on CC ≥2.1.86 — the indicator view insertion
  // creates a double-comma syntax error due to changed code structure.
  // Tweakcc version is shown via PATCH 1/2/3.

  return content;
};
