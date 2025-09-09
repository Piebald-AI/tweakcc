// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

const getInputBoxBorderLocation = (oldFile: string): LocationResult | null => {
  // First find the approximate area with the input box characteristics
  const approxAreaPattern = /borderColor:[$\w]+==="bash"/;
  const approxAreaMatch = oldFile.match(approxAreaPattern);

  if (!approxAreaMatch || approxAreaMatch.index === undefined) {
    console.error('patch: input border: failed to find approxAreaMatch');
    return null;
  }

  // Search within a range of characters around the match for borderStyle:"round"
  const searchStart = approxAreaMatch.index;
  const searchEnd = Math.min(oldFile.length, searchStart + 200);
  const searchSection = oldFile.slice(searchStart, searchEnd);

  const borderStylePattern = /borderStyle:"round"/;
  const borderStyleMatch = searchSection.match(borderStylePattern);

  if (!borderStyleMatch || borderStyleMatch.index === undefined) {
    console.error('patch: input border: failed to find borderStyle in section');
    return null;
  }

  // Calculate absolute position in the original file
  const absoluteStart = searchStart + borderStyleMatch.index;
  const absoluteEnd = absoluteStart + borderStyleMatch[0].length;

  return {
    startIndex: absoluteStart,
    endIndex: absoluteEnd,
  };
};

export const writeInputBoxBorder = (
  oldFile: string,
  removeBorder: boolean
): string | null => {
  const location = getInputBoxBorderLocation(oldFile);
  if (!location) {
    return null;
  }

  // If removeBorder is true, change to "none" and add marginBottom, otherwise keep "round"
  const newBorderStyle = removeBorder
    ? 'borderStyle:undefined,marginBottom:1'
    : 'borderStyle:"round"';

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newBorderStyle +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    newBorderStyle,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};
