// Please see the note about writing patches in ./index.js.

import { showDiff } from './index.js';

const getContextLimitLocation = (oldFile: string): number | null => {
  // Pattern: function funcName(paramName){if(paramName.includes("[1m]"))return 1e6;return 200000}
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
