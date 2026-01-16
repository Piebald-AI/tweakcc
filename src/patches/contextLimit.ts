// Please see the note about writing patches in ./index

import { showDiff } from './index';

const getContextLimitLocation = (oldFile: string): number | null => {
  // New format (2.0.77+): Function with model checks and separate variable
  // npm: function R$(A,Q){if(A.includes("[1m]")||Q?.includes(T8A)&&lL9(A))return 1e6;return cL9}var cL9=200000
  // native: function SP(H,$){if(H.includes("[1m]")||$?.includes(ffH)&&SAB(H))return 1e6;return OAB}var OAB=200000
  const newPattern =
    /function ([$\w]+)\(([$\w,]+)\)\{if\([$\w]+\.includes\("\[(1m|2m)\]"\)\|\|[$\w]+\?\.includes\([$\w]+\)&&[$\w]+\([$\w]+\)\)return 1e6;return ([$\w]+)\}/;
  const newMatch = oldFile.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    // Insert after the opening brace of the function
    return newMatch.index + newMatch[0].indexOf('{') + 1;
  }

  // Old format: Simple function with optional model checks
  // Pattern: function funcName(paramName){if(paramName.includes("[1m]"))return 1e6;return 200000}
  // Or: function funcName(paramName){return 200000}
  const oldPattern =
    /function ([$\w]+)\(([$\w]*)\)\{((?:if\([$\w]+\.includes\("\[2m\]"\)\)return 2000000;)?(?:if\([$\w]+\.includes\("\[1m\]"\)\)return 1e6;)?return 200000)\}/;
  const oldMatch = oldFile.match(oldPattern);

  if (oldMatch && oldMatch.index !== undefined) {
    return oldMatch.index + oldMatch[0].indexOf('{') + 1;
  }

  console.error('patch: context limit: failed to find match');
  return null;
};

export const writeContextLimit = (oldFile: string): string | null => {
  const index = getContextLimitLocation(oldFile);
  if (!index) {
    return null;
  }

  const newFnDef = `if(process.env.CLAUDE_CODE_CONTEXT_LIMIT)return Number(process.env.CLAUDE_CODE_CONTEXT_LIMIT);`;

  const newFile = oldFile.slice(0, index) + newFnDef + oldFile.slice(index);

  showDiff(oldFile, newFile, newFnDef, index, index);
  return newFile;
};
