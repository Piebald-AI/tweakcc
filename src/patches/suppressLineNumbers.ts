// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

/**
 * Find the location of the line number formatting function.
 *
 * The minified code looks like:
 *   if(J.length>=${NUM})return`${J}→${G}`;return`${J.padStart(${NUM}," ")}→${G}`
 *
 * This function formats line numbers with the arrow (→) character.
 * We want to find and replace this to just return the content without line numbers.
 */
const getLineNumberFormatterLocation = (
  oldFile: string
): LocationResult | null => {
  // Pattern matches the line number formatting function:
  // if(VAR.length>=${NUM})return`${VAR}→${VAR2}`;return`${VAR.padStart(${NUM}," ")}→${VAR2}`
  //
  // Breakdown:
  // - if\( - literal "if("
  // - ([$\w]+) - capture group 1: the line number variable (e.g., [\w]+)
  // - \.length>=${NUM}\) - literal ".length>=${NUM})"
  // - return` - literal "return`"
  // - \$\{\1\} - ${VAR} using backreference to group 1
  // - → - the arrow character
  // - \$\{([$\w]+)\} - capture group 2: the content variable (e.g., [\w]+)
  // - `;return` - literal ";return`"
  // - \$\{\1\.padStart\(${NUM}," "\)\} - ${VAR.padStart(${NUM}," ")} using backreference
  // - → - the arrow character
  // - \$\{\2\}` - ${VAR2}` using backreference to group 2
  const pattern =
    /if\(([$\w]+)\.length>=\d+\)return`\$\{\1\}→\$\{([$\w]+)\}`;return`\$\{\1\.padStart\(\d+," "\)\}→\$\{\2\}`/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: suppressLineNumbers: failed to find line number formatter pattern'
    );
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1], match[2]], // [lineNumVar, contentVar]
  };
};

export const writeSuppressLineNumbers = (oldFile: string): string | null => {
  const location = getLineNumberFormatterLocation(oldFile);
  if (!location) {
    return null;
  }

  const contentVar = location.identifiers?.[1];
  if (!contentVar) {
    console.error('patch: suppressLineNumbers: content variable not captured');
    return null;
  }

  // Replace the entire line number formatting logic with just returning the content
  const newCode = `return ${contentVar}`;
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCode +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCode, location.startIndex, location.endIndex);
  return newFile;
};
