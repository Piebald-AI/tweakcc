// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Find the location of the line number formatting function.
 *
 * The minified code looks like:
 *   if(J.length>=${NUM})return`${J}→${G}`;return`${J.padStart(${NUM}," ")}→${G}`
 *
 * This function formats line numbers with the arrow (→) character.
 * We want to find and replace this to just return the content without line numbers.
 */
export const writeSuppressLineNumbers = (oldFile: string): string | null => {
  // The line number formatter function signature is unique:
  //   {content:VAR,startLine:VAR2}){if(!VAR)return"";let LINES=VAR.split(/\r?\n/);...}
  //
  // We replace the function body after the empty guard to just return content as-is.
  // Instead of brace-counting (which breaks on template literals), we match and
  // replace the specific mapping expressions.

  // CC >=2.1.88: has compact branch + arrow branch
  // if(FLAG())return LINES.map(...)...;return LINES.map(...)...
  // CC <2.1.88: arrow branch only
  // if(VAR.length>=N)return`...→...`;return`...→...`

  // Find the function by its unique signature.
  // CC 2.1.140+ adds an optional `tabAwareSeparator:VAR=!1` param and replaces
  // the `split(/\r?\n/)` body with an indexOf-based loop, so we only anchor on
  // the destructured-params + empty-guard prefix (which is still unique).
  const funcSig =
    /\{content:([$\w]+),startLine:[$\w]+(?:,tabAwareSeparator:[$\w]+=!1)?\}\)\{if\(!\1\)return"";/;
  const sigMatch = oldFile.match(funcSig);

  if (sigMatch && sigMatch.index !== undefined) {
    const contentVar = sigMatch[1];
    const replaceStart = sigMatch.index + sigMatch[0].length;

    // Find the next `}function ` or `}var ` or similar — the end of this function
    // Use a simple approach: find `}` that's followed by a top-level keyword
    const afterSplit = oldFile.slice(replaceStart);
    const endPattern = /\}(?=function |var |let |const |[$\w]+=[$\w]+\()/;
    const endMatch = afterSplit.match(endPattern);

    if (endMatch && endMatch.index !== undefined) {
      const replaceEnd = replaceStart + endMatch.index;
      const newCode = `return ${contentVar}`;
      const newFile =
        oldFile.slice(0, replaceStart) + newCode + oldFile.slice(replaceEnd);
      showDiff(oldFile, newFile, newCode, replaceStart, replaceEnd);
      return newFile;
    }
  }

  // Fallback: old pattern (CC <2.1.88, arrow only)
  const arrowPattern =
    /if\(([$\w]+)\.length>=\d+\)return`\$\{\1\}(?:→|\\u2192)\$\{([$\w]+)\}`;return`\$\{\1\.padStart\(\d+," "\)\}(?:→|\\u2192)\$\{\2\}`/;
  const arrowMatch = oldFile.match(arrowPattern);

  if (arrowMatch && arrowMatch.index !== undefined) {
    const contentVar = arrowMatch[2];
    const newCode = `return ${contentVar}`;
    const newFile =
      oldFile.slice(0, arrowMatch.index) +
      newCode +
      oldFile.slice(arrowMatch.index + arrowMatch[0].length);
    showDiff(
      oldFile,
      newFile,
      newCode,
      arrowMatch.index,
      arrowMatch.index + arrowMatch[0].length
    );
    return newFile;
  }

  console.error(
    'patch: suppressLineNumbers: failed to find line number formatter pattern'
  );
  return null;
};
