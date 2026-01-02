// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index';

const getThinkerSymbolCharsLocation = (oldFile: string): LocationResult[] => {
  const results = [];

  // Find all arrays that look like symbol arrays with the dot character
  const arrayPattern = /\["[·✢*✳✶✻✽]",\s*(?:"[·✢*✳✶✻✽]",?\s*)+\]/g;
  let match;
  while ((match = arrayPattern.exec(oldFile)) !== null) {
    results.push({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return results;
};

export const writeThinkerSymbolChars = (
  oldFile: string,
  symbols: string[]
): string | null => {
  const locations = getThinkerSymbolCharsLocation(oldFile);
  if (locations.length === 0) {
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
