// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

/**
 * Find the file read token limit (25000) that's associated with the system-reminder.
 *
 * Approach: Find "=25000," and verify "<system-reminder>" appears within
 * the next ~100 characters to ensure we're targeting the correct value.
 */
const getFileReadLimitLocation = (oldFile: string): LocationResult | null => {
  // Pattern: =25000, followed within ~100 chars by <system-reminder>
  const pattern = /=25000,([\s\S]{0,100})<system-reminder>/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: increaseFileReadLimit: failed to find 25000 token limit near system-reminder'
    );
    return null;
  }

  // The "25000" starts at match.index + 1 (after the "=")
  const startIndex = match.index + 1;
  const endIndex = startIndex + 5; // "25000" is 5 characters

  return {
    startIndex,
    endIndex,
  };
};

export const writeIncreaseFileReadLimit = (oldFile: string): string | null => {
  const location = getFileReadLimitLocation(oldFile);
  if (!location) {
    return null;
  }

  const newValue = '1000000';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newValue +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newValue, location.startIndex, location.endIndex);
  return newFile;
};
