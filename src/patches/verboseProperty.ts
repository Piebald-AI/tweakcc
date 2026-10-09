// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getVerbosePropertyLocation = (oldFile: string): LocationResult | null => {
  // CC >=2.1.280: Match verbose prop in CALL context, not destructuring
  // Key: responseLengthRef has a dotted value (e.g., oo.responseLength) in calls,
  // but a simple identifier in destructuring patterns
  const cc2_1_280Pattern =
    /\{[^{}]*responseLengthRef:\w+\.\w+[^{}]*verbose:[^,}]+[^{}]*\}/;

  // CC >=2.1.x (pre-2.1.280) - createElement/jsxs patterns
  const createElementPattern =
    /(?:[$\w]+\.)?(?:createElement|jsxs?)\([$\w]+,\{(?=[^}]*responseLengthRef:)(?=[^}]*spinnerSuffix:)(?=[^}]*thinkingStatus:)(?=[^}]*isCompacting:)[^}]*verbose:[^,}]+[^}]*\}/;
  const legacyCreateElementPattern =
    /(?:createElement|jsxs?)\([$\w]+,\{[^}]+spinnerTip[^}]+overrideMessage[^}]+\}/;

  const createElementMatch =
    oldFile.match(cc2_1_280Pattern) ??
    oldFile.match(createElementPattern) ??
    oldFile.match(legacyCreateElementPattern);

  if (!createElementMatch || createElementMatch.index === undefined) {
    return null;
  }

  const extractedString = createElementMatch[0];

  const verbosePattern = /verbose:[^,}]+/;
  const verboseMatch = extractedString.match(verbosePattern);

  if (!verboseMatch || verboseMatch.index === undefined) {
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
