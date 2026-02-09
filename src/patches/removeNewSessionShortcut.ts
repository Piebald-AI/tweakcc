// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getNewSessionShortcutLocation = (
  oldFile: string
): LocationResult | null => {
  const pattern = /"Cmd\+K"|"Ctrl\+K"|"meta\+k"/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: removeNewSessionShortcut: failed to find new session shortcut pattern'
    );
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [],
  };
};

export const writeRemoveNewSessionShortcut = (
  oldFile: string
): string | null => {
  const location = getNewSessionShortcutLocation(oldFile);
  if (!location) {
    return null;
  }

  const newCode = '"Cmd+Shift+T"';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCode +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCode, location.startIndex, location.endIndex);
  return newFile;
};
