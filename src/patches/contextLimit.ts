// Please see the note about writing patches in ./index

import { showDiff } from './index';

const getContextLimitLocation = (oldFile: string): number | null => {
  // Format 1 (2.0.77 - 2.1.8): Function with model checks and variable defined immediately after
  // npm: function R$(A,Q){if(A.includes("[1m]")||Q?.includes(T8A)&&lL9(A))return 1e6;return cL9}var cL9=200000
  // native: function SP(H,$){if(H.includes("[1m]")||$?.includes(ffH)&&SAB(H))return 1e6;return OAB}var OAB=200000
  const format1Pattern =
    /function ([$\w]+)\(([$\w]+),([$\w]+)\)\{if\([$\w]+\.includes\("\[1m\]"\)\|\|[$\w]+\?\.includes\([$\w]+\)&&[$\w]+\([$\w]+\)\)return 1e6;return ([$\w]+)\}var \4=200000/;
  const format1Match = oldFile.match(format1Pattern);

  if (format1Match && format1Match.index !== undefined) {
    // Insert after the opening brace of the function
    return format1Match.index + format1Match[0].indexOf('{') + 1;
  }

  // Format 2 (2.1.8+): Function with model checks, variable defined separately
  // Example: function Jq(A,Q){if(A.includes("[1m]")||Q?.includes(n5A)&&HT9(A))return 1e6;return VT9}
  // The variable VT9=200000 is defined elsewhere in the file
  const format2Pattern =
    /function ([$\w]+)\(([$\w]+),([$\w]+)\)\{if\([$\w]+\.includes\("\[1m\]"\)\|\|[$\w]+\?\.includes\([$\w]+\)&&[$\w]+\([$\w]+\)\)return 1e6;return ([$\w]+)\}/;
  const format2Match = oldFile.match(format2Pattern);

  if (format2Match && format2Match.index !== undefined) {
    // Verify that the returned variable is actually defined as 200000 somewhere in the file
    const returnVar = format2Match[4];
    const varDefinitionPattern = new RegExp(`\\b${returnVar}=200000\\b`);
    if (varDefinitionPattern.test(oldFile)) {
      // Insert after the opening brace of the function
      return format2Match.index + format2Match[0].indexOf('{') + 1;
    }
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
