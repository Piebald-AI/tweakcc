// Please see the note about writing patches in ./index.

import { LocationResult, showDiff } from './index';

const getVerbosePropertyLocation = (oldFile: string): LocationResult | null => {
  const createElementPattern =
    /createElement\([$\w]+,\{[^}]+spinnerTip[^}]+overrideMessage[^}]+\}/;
  const createElementMatch = oldFile.match(createElementPattern);

  if (!createElementMatch || createElementMatch.index === undefined) {
    console.error(
      'patch: verbose: failed to find createElement with spinnerTip and overrideMessage'
    );
    return null;
  }

  const extractedString = createElementMatch[0];

  const verbosePattern = /verbose:[^,}]+/;
  const verboseMatch = extractedString.match(verbosePattern);

  if (!verboseMatch || verboseMatch.index === undefined) {
    console.error('patch: verbose: failed to find verbose property');
    return null;
  }

  // Calculate absolute positions in the original file
  const absoluteVerboseStart = createElementMatch.index + verboseMatch.index;
  const absoluteVerboseEnd = absoluteVerboseStart + verboseMatch[0].length;

  return {
    startIndex: absoluteVerboseStart,
    endIndex: absoluteVerboseEnd,
  };
};

export const writeVerboseProperty = (oldFile: string): string | null => {
  const location = getVerbosePropertyLocation(oldFile);
  if (!location) {
    return null;
  }

  const newCode = 'verbose:true';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCode +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCode, location.startIndex, location.endIndex);
  return newFile;
};
