// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getSpinnerNoFreezeLocation = (oldFile: string): LocationResult | null => {
  const wholePattern =
    /\b[$\w]+\(\(\)=>\{if\(![$\w]+\)\{[$\w]+\(\d+\);return\}[$\w]+\(\([^)]+\)=>[^)]+\+1\)\},\d+\)/;
  const wholeMatch = oldFile.match(wholePattern);

  if (!wholeMatch || wholeMatch.index === undefined) {
    console.error('patch: spinner no-freeze: failed to find wholeMatch');
    return null;
  }

  const freezeBranchPattern = /if\(![$\w]+\)\{[$\w]+\(\d+\);return\}/;
  const condMatch = wholeMatch[0].match(freezeBranchPattern);

  if (!condMatch || condMatch.index === undefined) {
    console.error('patch: spinner no-freeze: failed to find freeze condition');
    return null;
  }

  const startIndex = wholeMatch.index + condMatch.index;
  const endIndex = startIndex + condMatch[0].length;

  return {
    startIndex: startIndex,
    endIndex: endIndex,
  };
};

export const writeSpinnerNoFreeze = (oldFile: string): string | null => {
  const location = getSpinnerNoFreezeLocation(oldFile);
  if (!location) {
    return null;
  }

  const newFile =
    oldFile.slice(0, location.startIndex) + oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, '', location.startIndex, location.endIndex);
  return newFile;
};
