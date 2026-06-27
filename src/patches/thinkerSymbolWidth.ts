// Please see the note about writing patches in ./index

import { globalReplace } from './index';

// Claude Code 2.1.195 migrated the spinner symbol box to the JSX automatic
// runtime and React-Compiler memoization, so the old braced anchor
// `{flexWrap:"wrap",height:1,width:2}` no longer exists. The box is now spread
// inside a memoized `jsx` call as `…,flexWrap:"wrap",height:1,width:2,children:…`
// and the compiler emits one copy per render branch (≈10). Match the unbraced
// run and rewrite every copy. The unbraced run is also a substring of the old
// braced form, so this stays compatible with older Claude Code versions (where
// it matches the single braced occurrence).
const widthPattern = /flexWrap:"wrap",height:1,width:2/;

export const writeThinkerSymbolWidthLocation = (
  oldFile: string,
  width: number
): string | null => {
  if (!widthPattern.test(oldFile)) {
    console.error('patch: thinker symbol width: failed to find match');
    return null;
  }

  return globalReplace(
    oldFile,
    new RegExp(widthPattern.source, 'g'),
    `flexWrap:"wrap",height:1,width:${width}`
  );
};
