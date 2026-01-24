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

// Replacement with true markdown table format:
// - No top border (empty strings)
// - Header separator uses |---|---| format
// - No bottom border (empty strings)
// - No row separators between data rows
// Must match the minified format exactly (no spaces)
const TABLE_BORDERS_MARKDOWN =
  '{top:["","","",""],middle:["|","-","|","|"],bottom:["","","",""]}';

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

  // Check if this is a native binary bundle (Bun bytecode)
  // Native bundles start with "// @bun @bytecode" and don't have the same structure
  if (oldFile.includes('@bun @bytecode') || oldFile.includes('/$bunfs/')) {
    verbose(
      'Table format patch: Native binary installation detected. Table format customization is only supported for NPM installations.'
    );
    console.log(
      'Note: Table format customization is not yet supported for native binary installations.'
    );
    return null;
  }

  let newFile = oldFile;
  let patchCount = 0;

  // 1. Patch the main table border definition object
  // Try minified pattern first (current CLI version), then spaced pattern (older versions)
  if (TABLE_BORDERS_PATTERN.test(newFile)) {
    const beforeBorderPatch = newFile;
    newFile = newFile.replace(TABLE_BORDERS_PATTERN, TABLE_BORDERS_MARKDOWN);
    if (newFile !== beforeBorderPatch) {
      patchCount++;
      debug('Patched table border definition object (minified format)');
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
      'Could not find table border definition pattern - CLI may have changed or this may be a native installation'
    );
  }

  // 2. Patch vertical border initialization (let o = "│";)
  // We need to be careful here as there might be multiple occurrences
  // We specifically want the one in the table rendering function context
  {
    // Find the table rendering function context and patch vertical borders within it
    const tableFunctionPattern =
      /function\s+(\w)\((\w)\)\s*\{[\s\S]{1,500}?top:\s*\[/;
    const funcMatch = newFile.match(tableFunctionPattern);

    if (funcMatch && funcMatch.index !== undefined) {
      // Find and patch vertical border patterns near this function
      // Within ~2000 characters before the border definition
      const searchStart = Math.max(0, funcMatch.index - 2000);
      const searchEnd = funcMatch.index + 500;
      const searchRegion = newFile.slice(searchStart, searchEnd);

      // Patch "│" to "|" in this region
      const patchedRegion = searchRegion
        .replace(/let\s+(\w)\s*=\s*"│";/g, 'let $1 = "|";')
        .replace(/"\s*│"/g, '" |"');

      if (patchedRegion !== searchRegion) {
        newFile =
          newFile.slice(0, searchStart) +
          patchedRegion +
          newFile.slice(searchEnd);
        patchCount++;
        debug('Patched vertical border characters in table rendering region');
      }
    }
  }

  // 3. Patch the horizontal separator for compact view (Q = "─".repeat(b))
  {
    const beforeHorizPatch = newFile;
    newFile = newFile.replace(/"─"\.repeat\(/g, '"-".repeat(');
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
      /if\((\w)\.push\(\.\.\.(\w)\((\w),!1\)\),(\w)<(\w)\.rows\.length-1\)(\w)\.push\((\w)\("middle"\)\)/g;
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

  // Calculate what changed for the diff display
  const oldLength = oldFile.length;
  const newLength = newFile.length;

  // Show a diff near the first change
  const firstDiffIndex = findFirstDifference(oldFile, newFile);
  if (firstDiffIndex !== -1) {
    const contextStart = Math.max(0, firstDiffIndex - 50);
    const contextEnd = Math.min(newFile.length, firstDiffIndex + 150);

    showDiff(
      oldFile,
      newFile,
      `Table borders changed to markdown style (${patchCount} patches)`,
      contextStart,
      contextEnd
    );
  }

  debug(
    `Table format patch applied: ${patchCount} changes, file size ${oldLength} -> ${newLength}`
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
