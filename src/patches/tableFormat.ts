// Please see the note about writing patches in ./index

import { debug, verbose } from '../utils';
import { TableFormat } from '../types';
import { showDiff } from './index';

/**
 * Table format patch for the Claude Code CLI.
 *
 * The CLI has a table rendering function (function `au7` in minified code) that
 * creates tables with Unicode box-drawing characters like:
 *   ┌───┬───┐
 *   │ A │ B │
 *   ├───┼───┤
 *   │ 1 │ 2 │
 *   └───┴───┘
 *
 * This patch modifies that function to use true markdown table format:
 *   | A | B |
 *   |---|---|
 *   | 1 | 2 |
 *
 * The relevant code in cli.js looks like:
 *   let[g,b,Q,F]={top:["┌","─","┬","┐"],middle:["├","─","┼","┤"],bottom:["└","─","┴","┘"]}[S]
 *
 * Where:
 *   - g = left border character
 *   - b = horizontal line character (repeated for width)
 *   - Q = junction/column separator character
 *   - F = right border character
 *
 * For markdown format, we use:
 *   - top: empty strings (no top border)
 *   - middle: ["|", "-", "|", "|"] for header separator like |---|---|
 *   - bottom: empty strings (no bottom border)
 */

// Pattern to find the table border definition object in the CLI
// The code (minified) looks like:
//     let[g,b,Q,F]={top:["┌","─","┬","┐"],middle:["├","─","┼","┤"],bottom:["└","─","┴","┘"]}[S]
// Note: The CLI is minified so there are no spaces between elements
const TABLE_BORDERS_PATTERN =
  /\{top:\["┌","─","┬","┐"\],middle:\["├","─","┼","┤"\],bottom:\["└","─","┴","┘"\]\}/;

// Native builds use Unicode escape sequences instead of literal characters
// e.g., top:["\u250C","\u2500","\u252C","\u2510"]
const TABLE_BORDERS_PATTERN_NATIVE =
  /top:\["\\u250C","\\u2500","\\u252C","\\u2510"\],middle:\["\\u251C","\\u2500","\\u253C","\\u2524"\],bottom:\["\\u2514","\\u2500","\\u2534","\\u2518"\]/;

// Replacement with true markdown table format:
// - No top border (empty strings)
// - Header separator uses |---|---| format
// - No bottom border (empty strings)
// - No row separators between data rows
// Must match the minified format exactly (no spaces)
const TABLE_BORDERS_MARKDOWN =
  '{top:["","","",""],middle:["|","-","|","|"],bottom:["","","",""]}';

// Replacement for native builds (without the leading {)
const TABLE_BORDERS_MARKDOWN_NATIVE =
  'top:["","","",""],middle:["|","-","|","|"],bottom:["","","",""]';

// Also try the spaced format for older/unminified CLI versions
const TABLE_BORDERS_PATTERN_SPACED =
  /top: \["┌", "─", "┬", "┐"\],\s+middle: \["├", "─", "┼", "┤"\],\s+bottom: \["└", "─", "┴", "┘"\]/;

const TABLE_BORDERS_MARKDOWN_SPACED =
  'top: ["", "", "", ""],\n        middle: ["|", "-", "|", "|"],\n        bottom: ["", "", "", ""]';

/**
 * Patch the table format in the CLI.
 *
 * @param oldFile - The current content of cli.js
 * @param tableFormat - The table format preference ('default', 'markdown', or 'box-drawing')
 * @returns The modified content, or null if the patch couldn't be applied or isn't needed
 */
export const writeTableFormat = (
  oldFile: string,
  tableFormat: TableFormat
): string | null => {
  // If tableFormat is 'default' or 'box-drawing', don't modify anything (keep original box-drawing)
  if (tableFormat === 'default' || tableFormat === 'box-drawing') {
    debug(
      `Table format is "${tableFormat}", no patching needed (keeping box-drawing)`
    );
    return null;
  }

  // For 'markdown' format, patch the box-drawing characters to ASCII
  if (tableFormat !== 'markdown') {
    debug(`Unknown table format "${tableFormat}", skipping`);
    return null;
  }

  let newFile = oldFile;
  let patchCount = 0;

  // 1. Patch the main table border definition object
  // Try minified pattern first (current CLI version), then native, then spaced (older versions)
  if (TABLE_BORDERS_PATTERN.test(newFile)) {
    const beforeBorderPatch = newFile;
    newFile = newFile.replace(TABLE_BORDERS_PATTERN, TABLE_BORDERS_MARKDOWN);
    if (newFile !== beforeBorderPatch) {
      patchCount++;
      debug('Patched table border definition object (minified format)');
    }
  } else if (TABLE_BORDERS_PATTERN_NATIVE.test(newFile)) {
    const beforeBorderPatch = newFile;
    newFile = newFile.replace(
      TABLE_BORDERS_PATTERN_NATIVE,
      TABLE_BORDERS_MARKDOWN_NATIVE
    );
    if (newFile !== beforeBorderPatch) {
      patchCount++;
      debug(
        'Patched table border definition object (native Unicode escape format)'
      );
    }
  } else if (TABLE_BORDERS_PATTERN_SPACED.test(newFile)) {
    const beforeBorderPatch = newFile;
    newFile = newFile.replace(
      TABLE_BORDERS_PATTERN_SPACED,
      TABLE_BORDERS_MARKDOWN_SPACED
    );
    if (newFile !== beforeBorderPatch) {
      patchCount++;
      debug('Patched table border definition object (spaced format)');
    }
  } else {
    verbose(
      'Could not find table border definition pattern - CLI may have changed'
    );
  }

  // 2. Patch vertical border characters
  // NPM uses literal "│", native uses escaped "\u2502"
  {
    const beforeVertPatch = newFile;

    // Native format: let VAR="\u2502" and " \u2502"
    newFile = newFile.replace(
      /let\s+([$\w]+)\s*=\s*"\\u2502";/g,
      'let $1="|";'
    );
    newFile = newFile.replace(/" \\u2502"/g, '" |"');
    newFile = newFile.replace(/"\\u2502"/g, '"|"');

    // NPM format: let VAR = "│" and " │"
    newFile = newFile.replace(/let\s+([$\w]+)\s*=\s*"│";/g, 'let $1 = "|";');
    newFile = newFile.replace(/"\s*│"/g, '" |"');

    if (newFile !== beforeVertPatch) {
      patchCount++;
      debug('Patched vertical border characters');
    }
  }

  // 3. Patch the horizontal separator for compact view
  // NPM: "─".repeat(  Native: "\u2500".repeat(
  {
    const beforeHorizPatch = newFile;
    newFile = newFile.replace(/"─"\.repeat\(/g, '"-".repeat(');
    newFile = newFile.replace(/"\\u2500"\.repeat\(/g, '"-".repeat(');
    if (newFile !== beforeHorizPatch) {
      patchCount++;
      debug('Patched horizontal separator characters');
    }
  }

  // 4. Remove inter-row separators (keep only header separator)
  // The CLI code looks like:
  //   A.rows.forEach((S,g)=>{if(R.push(...N(S,!1)),g<A.rows.length-1)R.push(T("middle"))})
  // The if uses comma operator: executes R.push(...N(S,!1)), then checks g<rows.length-1
  // We want to keep just: A.rows.forEach((S,g)=>{R.push(...N(S,!1))})
  {
    // Match: if(VAR.push(...N(VAR,!1)),VAR<VAR.rows.length-1)VAR.push(T("middle"))
    // Replace with just: VAR.push(...N(VAR,!1))
    const interRowSepPattern =
      /if\(([$\w]+)\.push\(\.\.\.([$\w]+)\(([$\w]+),!1\)\),([$\w]+)<([$\w]+)\.rows\.length-1\)([$\w]+)\.push\(([$\w]+)\("middle"\)\)/g;
    const beforeInterRowPatch = newFile;
    // Replace with just the push call (without the if and the middle separator)
    newFile = newFile.replace(interRowSepPattern, '$1.push(...$2($3,!1))');
    if (newFile !== beforeInterRowPatch) {
      patchCount++;
      debug('Removed inter-row separators (keeping header separator only)');
    }
  }

  if (patchCount === 0) {
    verbose(
      'No table format patches were applied - patterns may not have matched'
    );
    return null;
  }

  // Show a summary diff
  const patchSummary = `[Table format patch: ${patchCount} modifications for markdown style]`;
  debug(patchSummary);

  // Show a diff near the first change
  const firstDiffIndex = findFirstDifference(oldFile, newFile);
  if (firstDiffIndex !== -1) {
    // Find where the first changed region ends in both files
    const { oldEnd, newEnd } = findFirstDiffEnd(
      oldFile,
      newFile,
      firstDiffIndex
    );
    const injectedText = newFile.slice(firstDiffIndex, newEnd);

    showDiff(oldFile, newFile, injectedText, firstDiffIndex, oldEnd);
  }

  debug(
    `Table format patch applied: ${patchCount} changes, file size ${oldFile.length} -> ${newFile.length}`
  );
  return newFile;
};

/**
 * Find the index of the first difference between two strings.
 */
function findFirstDifference(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length !== b.length ? minLen : -1;
}

/**
 * Find where the first differing region ends in both strings.
 * This helps identify the boundaries of a single replacement.
 */
function findFirstDiffEnd(
  oldStr: string,
  newStr: string,
  diffStart: number
): { oldEnd: number; newEnd: number } {
  // Scan backwards from the ends to find where they match again
  let oldIdx = oldStr.length - 1;
  let newIdx = newStr.length - 1;

  while (
    oldIdx >= diffStart &&
    newIdx >= diffStart &&
    oldStr[oldIdx] === newStr[newIdx]
  ) {
    oldIdx--;
    newIdx--;
  }

  return { oldEnd: oldIdx + 1, newEnd: newIdx + 1 };
}
