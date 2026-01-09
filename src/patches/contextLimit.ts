// Please see the note about writing patches in ./index

import { showDiff } from './index';

const getContextLimitLocation = (oldFile: string): number | null => {
  // v2.1.2+ format: function Lz(A,Q){if(A.includes("[1m]")||Q?.includes(k8A)&&eO9(A))return 1e6;return tO9}
  // The return value uses a variable (tO9) instead of literal 200000
  const newPattern =
    /function ([$\w]+)\(([$\w,]*)\)\{if\([^}]+return 1e6;return ([$\w]+)\}var \3=200000/;
  const newMatch = oldFile.match(newPattern);
  if (newMatch && newMatch.index !== undefined) {
    return newMatch.index + newMatch[0].indexOf('{') + 1;
  }

  // Legacy format: function funcName(paramName){if(paramName.includes("[1m]"))return 1e6;return 200000}
  // Or: function funcName(paramName){return 200000}
  const pattern =
    /function ([$\w]+)\(([$\w]*)\)\{((?:if\([$\w]+\.includes\("\[2m\]"\)\)return 2000000;)?(?:if\([$\w]+\.includes\("\[1m\]"\)\)return 1e6;)?return 200000)\}/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: context limit: failed to find match');
    return null;
  }

  return match.index + match[0].indexOf('{') + 1;
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
