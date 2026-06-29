// Please see the note about writing patches in ./index

import { globalReplace } from './index';

export const writeInputBoxBorder = (
  oldFile: string,
  removeBorder: boolean
): string | null => {
  if (!removeBorder) return oldFile;

  const newFile = globalReplace(
    oldFile,
    /borderStyle:"round"(,borderLeft:!1,borderRight:!1,borderBottom:!0)/g,
    (_m, trailing) => `borderStyle:undefined${trailing}`
  );

  if (newFile === oldFile) {
    console.error('patch: input border: failed to find input border pattern');
    return null;
  }

  return newFile;
};
