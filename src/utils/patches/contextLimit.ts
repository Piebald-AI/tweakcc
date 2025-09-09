// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

const getContextLimitLocation = (oldFile: string): LocationResult | null => {
  // Pattern: function funcName(paramName){if(paramName.includes("[1m]"))return 1e6;return 200000}
  // Or: function funcName(paramName){return 200000}
  const pattern =
    /function ([$\w]+)\(([$\w]*)\)\{((?:if\([$\w]+\.includes\("\[1m\]"\)\)return 1e6;)?return 200000)\}/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: context limit: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1], match[2], match[3]], // funcName, paramName, oldBody
  };
};

export const writeContextLimit = (oldFile: string): string | null => {
  const location = getContextLimitLocation(oldFile);
  if (!location) {
    return null;
  }

  const funcName = location.identifiers?.[0];
  const paramName = location.identifiers?.[1];
  const oldBody = location.identifiers?.[2];

  const newFnDef = `function ${funcName}(${paramName}){if(process.env.CLAUDE_CODE_CONTEXT_LIMIT)return Number(process.env.CLAUDE_CODE_CONTEXT_LIMIT);${oldBody}}`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newFnDef +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newFnDef, location.startIndex, location.endIndex);
  return newFile;
};
