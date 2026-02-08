// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

export const writeThinkerSymbolChars = (
  oldFile: string,
  symbols: string[]
): string | null => {
  const locations: LocationResult[] = [];
  const arrayPattern =
    /\["(?:[·✢*✳✶✻✽]|\\u00b7|\\xb7|\\u2722|\\x2a|\\u002a|\\u2733|\\u2736|\\u273b|\\u273d)",\s*(?:"(?:[·✢*✳✶✻✽]|\\u00b7|\\xb7|\\u2722|\\x2a|\\u002a|\\u2733|\\u2736|\\u273b|\\u273d)",?\s*)+\]/gi;

  let match;
  while ((match = arrayPattern.exec(oldFile)) !== null) {
    locations.push({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  if (locations.length === 0) {
    console.error(
      'patch: thinkerSymbolChars: could not find any thinker symbol char arrays'
    );
    return null;
  }

  const symbolsJson = JSON.stringify(symbols);

  // Sort locations by start index in descending order to apply from end to beginning.
  const sortedLocations = locations.sort((a, b) => b.startIndex - a.startIndex);

  let newFile = oldFile;
  for (let i = 0; i < sortedLocations.length; i++) {
    const updatedFile =
      newFile.slice(0, sortedLocations[i].startIndex) +
      symbolsJson +
      newFile.slice(sortedLocations[i].endIndex);

    showDiff(
      newFile,
      updatedFile,
      symbolsJson,
      sortedLocations[i].startIndex,
      sortedLocations[i].endIndex
    );
    newFile = updatedFile;
  }

  return newFile;
};
