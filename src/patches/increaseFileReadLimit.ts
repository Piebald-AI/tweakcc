// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

/**
 * Find the file read token limit (25000) that's associated with the system-reminder.
 *
 * Approach: Find "=25000," and verify "<system-reminder>" appears within
 * the next ~100 characters to ensure we're targeting the correct value.
 */
const getFileReadLimitLocation = (oldFile: string): LocationResult | null => {
  // CC ≥2.1.97: constants grouped together: TQ=2000,VQ=2000,em1=25000,...
  // Use nearby constants as anchors instead of <system-reminder> proximity
  const newPattern = /TQ=\d+,VQ=\d+,([$\w]+)=25000/;
  const newMatch = oldFile.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    // Find the position of "25000" in the match
    const fullMatch = newMatch[0];
    const valueStart = newMatch.index + fullMatch.lastIndexOf('=25000') + 1;
    const valueEnd = valueStart + 5;
    return { startIndex: valueStart, endIndex: valueEnd };
  }

  // Fall back to old pattern: =25000, followed within ~100 chars by <system-reminder>
  const oldPattern = /=25000,([\s\S]{0,100})<system-reminder>/;
  const oldMatch = oldFile.match(oldPattern);

  if (!oldMatch || oldMatch.index === undefined) {
    console.error(
      'patch: increaseFileReadLimit: failed to find 25000 token limit'
    );
    return null;
  }

  const startIndex = oldMatch.index + 1;
  const endIndex = startIndex + 5;

  return { startIndex, endIndex };
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
