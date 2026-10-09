// Please see the note about writing patches in ./index

import { graphMemo, isGraphContextActive, graphSources } from './graphContext';
import { showDiff } from './index';

const patchReadToolPrompt = (file: string): string => {
  let newFile = file;
  const replacements: Array<[RegExp, string]> = [
    [
      /"- Results are returned using cat -n format, with line numbers starting at 1"/g,
      '"- Results are returned as raw file content without line-number prefixes"',
    ],
    [
      /`\$\{[$\w]+\}\. Each line is the line number, a single separator \(a tab or \\?`:\\?`\), then the verbatim file content \(including any leading whitespace\)\.`/g,
      '`- Results are returned as raw file content without line-number prefixes`',
    ],
  ];

  for (const [pattern, replacement] of replacements) {
    const before = newFile;
    newFile = newFile.replace(pattern, replacement);
    if (newFile !== before) {
      showDiff(file, newFile, replacement, 0, 0);
    }
  }

  return newFile;
};

// CC 2.1.140+ adds an optional `tabAwareSeparator:VAR=!1` param and replaces
// the `split(/\r?\n/)` body with an indexOf-based loop, so we only anchor on
// the destructured-params + empty-guard prefix (which is still unique).
const FORMATTER_SIGNATURE =
  /\{content:([$\w]+),startLine:[$\w]+(?:,tabAwareSeparator:[$\w]+=!1)?\}\)\{if\(!\1\)return"";/;

// The `}` closing the formatter, found by the top-level keyword that follows it.
const FORMATTER_END = /\}(?=function |var |let |const |[$\w]+=[$\w]+\()/;

/** The formatter body to replace, or null when it cannot be rewritten. */
const formatterRange = (
  file: string
): { contentVar: string; start: number; end: number } | null => {
  const sig = file.match(FORMATTER_SIGNATURE);
  if (!sig || sig.index === undefined) return null;
  const start = sig.index + sig[0].length;
  const end = file.slice(start).match(FORMATTER_END);
  if (!end || end.index === undefined) return null;
  return { contentVar: sig[1], start, end: start + end.index };
};

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
  const range = formatterRange(oldFile);

  if (range) {
    const { contentVar, start: replaceStart, end: replaceEnd } = range;
    const newCode = `return ${contentVar}`;
    let newFile =
      oldFile.slice(0, replaceStart) + newCode + oldFile.slice(replaceEnd);
    showDiff(oldFile, newFile, newCode, replaceStart, replaceEnd);

    const helperPattern =
      /function ([$\w]+)\(([$\w]+),[$\w]+,[$\w]+\)\{let [$\w]+=\2\.endsWith\("\\r"\)\?\2\.slice\(0,-1\):\2;return`\$\{[$\w]+\}\$\{[$\w]+\}\$\{[$\w]+\}`\}/;
    const helperMatch = newFile.match(helperPattern);
    if (helperMatch && helperMatch.index !== undefined) {
      const replacement = `function ${helperMatch[1]}(${helperMatch[2]}){return ${helperMatch[2]}.endsWith("\\r")?${helperMatch[2]}.slice(0,-1):${helperMatch[2]}}`;
      const beforeHelper = newFile;
      newFile =
        newFile.slice(0, helperMatch.index) +
        replacement +
        newFile.slice(helperMatch.index + helperMatch[0].length);
      showDiff(
        beforeHelper,
        newFile,
        replacement,
        helperMatch.index,
        helperMatch.index + helperMatch[0].length
      );
    }

    newFile = patchReadToolPrompt(newFile);
    return newFile;
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

  // Code-split builds (CC 2.1.2xx) keep the Read tool prompt in a different
  // module from the formatter; patch it there, but only when the formatter
  // itself exists somewhere in the graph.
  if (isGraphContextActive() && graphCanRewriteFormatter()) {
    const newFile = patchReadToolPrompt(oldFile);
    if (newFile !== oldFile) return newFile;
  }

  console.error(
    'patch: suppressLineNumbers: failed to find line number formatter pattern'
  );
  return null;
};

// Only rewrite the Read tool prompt when the formatter itself can be
// rewritten; otherwise the model would be told there are no line numbers
// while the output still has them.
const graphCanRewriteFormatter = (): boolean =>
  !!graphMemo('suppressLineNumbers:formatter', () =>
    [...(graphSources()?.values() ?? [])].some(
      source => formatterRange(source) !== null
    )
  );
