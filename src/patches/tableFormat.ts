// Please see the note about writing patches in ./index

import { debug, verbose } from '../utils';
import { TableFormat } from '../types';
import { showDiff } from './index';

/**
 * Table format patch for the Claude Code CLI.
 *
 * The CLI has a table rendering function that creates tables with Unicode
 * box-drawing characters like:
 *
 *   ┌───┬───┐
 *   │ A │ B │
 *   ├───┼───┤
 *   │ 1 │ 2 │
 *   ├───┼───┤
 *   │ 3 │ 4 │
 *   └───┴───┘
 *
 * This patch modifies that function to support different table styles:
 *
 * 1. 'default' - No modification, keep original box-drawing with all separators
 *
 * 2. 'ascii' - Markdown-style with ASCII characters:
 *    | A | B |
 *    |---|---|
 *    | 1 | 2 |
 *    | 3 | 4 |
 *
 * 3. 'clean' - Box-drawing without row separators or top/bottom borders:
 *    │ A │ B │
 *    ├───┼───┤
 *    │ 1 │ 2 │
 *    │ 3 │ 4 │
 *
 * 4. 'clean-top-bottom' - Box-drawing without row separators, but with top/bottom:
 *    ┌───┬───┐
 *    │ A │ B │
 *    ├───┼───┤
 *    │ 1 │ 2 │
 *    │ 3 │ 4 │
 *    └───┴───┘
 *
 * The relevant code in cli.js looks like:
 *   let[g,b,Q,F]={top:["┌","─","┬","┐"],middle:["├","─","┼","┤"],bottom:["└","─","┴","┘"]}[S]
 *
 * And the row separator logic:
 *   A.rows.forEach((S,g)=>{if(R.push(...N(S,!1)),g<A.rows.length-1)R.push(T("middle"))})
 */

// =============================================================================
// Pattern Definitions
// =============================================================================

// Pattern to find the table border definition object in the CLI (NPM format)
// The code looks like:
//     let[g,b,Q,F]={top:["┌","─","┬","┐"],middle:["├","─","┼","┤"],bottom:["└","─","┴","┘"]}[S]
const TABLE_BORDERS_PATTERN =
  /\{top:\["┌","─","┬","┐"\],middle:\["├","─","┼","┤"\],bottom:\["└","─","┴","┘"\]\}/;

// Native builds use Unicode escape sequences instead of literal characters
const TABLE_BORDERS_PATTERN_NATIVE =
  /top:\["\\u250C","\\u2500","\\u252C","\\u2510"\],middle:\["\\u251C","\\u2500","\\u253C","\\u2524"\],bottom:\["\\u2514","\\u2500","\\u2534","\\u2518"\]/;

// Spaced format for older/unminified CLI versions
const TABLE_BORDERS_PATTERN_SPACED =
  /top: \["┌", "─", "┬", "┐"\],\s+middle: \["├", "─", "┼", "┤"\],\s+bottom: \["└", "─", "┴", "┘"\]/;

// Pattern for inter-row separator logic
// The minified code looks like:
//   A.rows.forEach((S,g)=>{if(R.push(...N(S,!1)),g<A.rows.length-1)R.push(T("middle"))})
// The formatted code looks like:
//   if ((R.push(...N(S, !1)), g < A.rows.length - 1)) R.push(T("middle"));
// We need to remove the condition and the push of T("middle") to remove inter-row separators

// Minified pattern (no extra parens, no spaces)
const INTER_ROW_SEP_PATTERN_MINIFIED =
  /if\(([$\w]+)\.push\(\.\.\.([$\w]+)\(([$\w]+),!1\)\),([$\w]+)<([$\w]+)\.rows\.length-1\)([$\w]+)\.push\(([$\w]+)\("middle"\)\)/g;

// Formatted pattern (extra parens, spaces, optional semicolon)
const INTER_ROW_SEP_PATTERN_FORMATTED =
  /if\s*\(\s*\(\s*([$\w]+)\.push\(\.\.\.([$\w]+)\(([$\w]+)\s*,\s*!1\)\)\s*,\s*([$\w]+)\s*<\s*([$\w]+)\.rows\.length\s*-\s*1\s*\)\s*\)\s*([$\w]+)\.push\(([$\w]+)\("middle"\)\)\s*;?/g;

// Patterns to remove T("top") and T("bottom") pushes for clean format
// Minified: R.push(T("top")),R.push(...  ->  R.push(...
// We match the R.push(T("top")), prefix and remove it
const PUSH_TOP_PATTERN_MINIFIED = /([$\w]+)\.push\(([$\w]+)\("top"\)\),/g;
// Minified: ),R.push(T("bottom")),Math  ->  ),Math
const PUSH_BOTTOM_PATTERN_MINIFIED =
  /,([$\w]+)\.push\(([$\w]+)\("bottom"\)\),/g;

// Formatted versions
const PUSH_TOP_PATTERN_FORMATTED =
  /([$\w]+)\.push\(\s*([$\w]+)\(\s*"top"\s*\)\s*\)\s*,\s*/g;
const PUSH_BOTTOM_PATTERN_FORMATTED =
  /,\s*([$\w]+)\.push\(\s*([$\w]+)\(\s*"bottom"\s*\)\s*\)\s*,/g;

// =============================================================================
// Replacement Values
// =============================================================================

// ASCII/Markdown format - use | and - characters
const TABLE_BORDERS_ASCII =
  '{top:["","","",""],middle:["|","-","|","|"],bottom:["","","",""]}';

const TABLE_BORDERS_ASCII_NATIVE =
  'top:["","","",""],middle:["|","-","|","|"],bottom:["","","",""]';

const TABLE_BORDERS_ASCII_SPACED =
  'top: ["", "", "", ""],\n        middle: ["|", "-", "|", "|"],\n        bottom: ["", "", "", ""]';

// Clean format - box-drawing but no top/bottom borders
const TABLE_BORDERS_CLEAN =
  '{top:["","","",""],middle:["├","─","┼","┤"],bottom:["","","",""]}';

const TABLE_BORDERS_CLEAN_NATIVE =
  'top:["","","",""],middle:["\\u251C","\\u2500","\\u253C","\\u2524"],bottom:["","","",""]';

const TABLE_BORDERS_CLEAN_SPACED =
  'top: ["", "", "", ""],\n        middle: ["├", "─", "┼", "┤"],\n        bottom: ["", "", "", ""]';

// Clean-top-bottom format - keep borders as is, we only remove inter-row separators
// (No replacement needed for borders, just remove inter-row separators)

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Remove inter-row separators from the file content.
 * Tries both minified and formatted patterns.
 * Returns the modified content and whether it was successful.
 */
function removeInterRowSeparators(content: string): {
  result: string;
  success: boolean;
} {
  let result = content;
  let success = false;

  // Try minified pattern first (most common in production)
  const beforeMinified = result;
  result = result.replace(
    INTER_ROW_SEP_PATTERN_MINIFIED,
    '$1.push(...$2($3,!1))'
  );
  if (result !== beforeMinified) {
    success = true;
  }

  // Also try formatted pattern (for formatted/prettified files)
  const beforeFormatted = result;
  result = result.replace(
    INTER_ROW_SEP_PATTERN_FORMATTED,
    '$1.push(...$2($3,!1))'
  );
  if (result !== beforeFormatted) {
    success = true;
  }

  return { result, success };
}

/**
 * Remove top/bottom border pushes from the file content.
 * This removes the R.push(T("top")) and R.push(T("bottom")) calls
 * to prevent blank lines in the clean format output.
 * Returns the modified content and whether it was successful.
 */
function removeTopBottomPushes(content: string): {
  result: string;
  success: boolean;
} {
  let result = content;
  let success = false;

  // Remove T("top") push - minified
  const beforeTopMinified = result;
  result = result.replace(PUSH_TOP_PATTERN_MINIFIED, '');
  if (result !== beforeTopMinified) {
    success = true;
  }

  // Remove T("top") push - formatted
  const beforeTopFormatted = result;
  result = result.replace(PUSH_TOP_PATTERN_FORMATTED, '');
  if (result !== beforeTopFormatted) {
    success = true;
  }

  // Remove T("bottom") push - minified
  const beforeBottomMinified = result;
  result = result.replace(PUSH_BOTTOM_PATTERN_MINIFIED, ',');
  if (result !== beforeBottomMinified) {
    success = true;
  }

  // Remove T("bottom") push - formatted
  const beforeBottomFormatted = result;
  result = result.replace(PUSH_BOTTOM_PATTERN_FORMATTED, ',');
  if (result !== beforeBottomFormatted) {
    success = true;
  }

  return { result, success };
}

// =============================================================================
// Main Patch Function
// =============================================================================

/**
 * Patch the table format in the CLI.
 *
 * @param oldFile - The current content of cli.js
 * @param tableFormat - The table format preference
 * @returns The modified content, or null if the patch couldn't be applied or isn't needed
 */
export const writeTableFormat = (
  oldFile: string,
  tableFormat: TableFormat
): string | null => {
  // If tableFormat is 'default', don't modify anything (keep original box-drawing)
  if (tableFormat === 'default') {
    debug('Table format is "default", no patching needed');
    return null;
  }

  let newFile = oldFile;
  let patchCount = 0;

  // ==========================================================================
  // Handle 'ascii' format
  // ==========================================================================
  if (tableFormat === 'ascii') {
    // 1. Patch the main table border definition object
    if (TABLE_BORDERS_PATTERN.test(newFile)) {
      const before = newFile;
      newFile = newFile.replace(TABLE_BORDERS_PATTERN, TABLE_BORDERS_ASCII);
      if (newFile !== before) {
        patchCount++;
        debug('Patched table border definition object (minified format)');
      }
    } else if (TABLE_BORDERS_PATTERN_NATIVE.test(newFile)) {
      const before = newFile;
      newFile = newFile.replace(
        TABLE_BORDERS_PATTERN_NATIVE,
        TABLE_BORDERS_ASCII_NATIVE
      );
      if (newFile !== before) {
        patchCount++;
        debug('Patched table border definition object (native Unicode format)');
      }
    } else if (TABLE_BORDERS_PATTERN_SPACED.test(newFile)) {
      const before = newFile;
      newFile = newFile.replace(
        TABLE_BORDERS_PATTERN_SPACED,
        TABLE_BORDERS_ASCII_SPACED
      );
      if (newFile !== before) {
        patchCount++;
        debug('Patched table border definition object (spaced format)');
      }
    } else {
      verbose(
        'Could not find table border definition pattern - CLI may have changed'
      );
    }

    // 2. Patch vertical border characters (│ -> |)
    {
      const before = newFile;

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

      if (newFile !== before) {
        patchCount++;
        debug('Patched vertical border characters');
      }
    }

    // 3. Patch the horizontal separator for compact view
    {
      const before = newFile;
      newFile = newFile.replace(/"─"\.repeat\(/g, '"-".repeat(');
      newFile = newFile.replace(/"\\u2500"\.repeat\(/g, '"-".repeat(');
      if (newFile !== before) {
        patchCount++;
        debug('Patched horizontal separator characters');
      }
    }

    // 4. Remove inter-row separators
    {
      const { result, success } = removeInterRowSeparators(newFile);
      if (success) {
        newFile = result;
        patchCount++;
        debug('Removed inter-row separators');
      }
    }

    // 5. Remove top/bottom border pushes to avoid blank lines
    {
      const { result, success } = removeTopBottomPushes(newFile);
      if (success) {
        newFile = result;
        patchCount++;
        debug('Removed top/bottom border pushes');
      }
    }
  }

  // ==========================================================================
  // Handle 'clean' format (box-drawing without borders or row separators)
  // ==========================================================================
  else if (tableFormat === 'clean') {
    // 1. Patch the table border definition to remove top/bottom borders
    if (TABLE_BORDERS_PATTERN.test(newFile)) {
      const before = newFile;
      newFile = newFile.replace(TABLE_BORDERS_PATTERN, TABLE_BORDERS_CLEAN);
      if (newFile !== before) {
        patchCount++;
        debug(
          'Patched table border definition for clean format (minified format)'
        );
      }
    } else if (TABLE_BORDERS_PATTERN_NATIVE.test(newFile)) {
      const before = newFile;
      newFile = newFile.replace(
        TABLE_BORDERS_PATTERN_NATIVE,
        TABLE_BORDERS_CLEAN_NATIVE
      );
      if (newFile !== before) {
        patchCount++;
        debug(
          'Patched table border definition for clean format (native Unicode format)'
        );
      }
    } else if (TABLE_BORDERS_PATTERN_SPACED.test(newFile)) {
      const before = newFile;
      newFile = newFile.replace(
        TABLE_BORDERS_PATTERN_SPACED,
        TABLE_BORDERS_CLEAN_SPACED
      );
      if (newFile !== before) {
        patchCount++;
        debug(
          'Patched table border definition for clean format (spaced format)'
        );
      }
    } else {
      verbose(
        'Could not find table border definition pattern - CLI may have changed'
      );
    }

    // 2. Remove inter-row separators
    {
      const { result, success } = removeInterRowSeparators(newFile);
      if (success) {
        newFile = result;
        patchCount++;
        debug('Removed inter-row separators');
      }
    }

    // 3. Remove T("top") and T("bottom") pushes to prevent blank lines
    {
      const { result, success } = removeTopBottomPushes(newFile);
      if (success) {
        newFile = result;
        patchCount++;
        debug('Removed top/bottom border pushes');
      }
    }
  }

  // ==========================================================================
  // Handle 'clean-top-bottom' format (box-drawing with borders, no row separators)
  // ==========================================================================
  else if (tableFormat === 'clean-top-bottom') {
    // Only remove inter-row separators, keep everything else
    const { result, success } = removeInterRowSeparators(newFile);
    if (success) {
      newFile = result;
      patchCount++;
      debug('Removed inter-row separators (keeping top/bottom borders)');
    }
  }

  // ==========================================================================
  // Unknown format
  // ==========================================================================
  else {
    debug(`Unknown table format "${tableFormat}", skipping`);
    return null;
  }

  // ==========================================================================
  // Final reporting
  // ==========================================================================
  if (patchCount === 0) {
    verbose(
      'No table format patches were applied - patterns may not have matched'
    );
    return null;
  }

  // Show a summary diff
  const patchSummary = `[Table format patch: ${patchCount} modifications for ${tableFormat} style]`;
  debug(patchSummary);

  // Show a diff near the first change
  const firstDiffIndex = findFirstDifference(oldFile, newFile);
  if (firstDiffIndex !== -1) {
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

// =============================================================================
// Helper Functions
// =============================================================================

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
