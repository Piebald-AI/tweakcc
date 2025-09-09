import { LocationResult } from '../patching.js';
import { showDiff } from '../misc.js';

const getShowMoreItemsInSelectMenusLocation = (
  oldFile: string
): LocationResult[] => {
  const results: LocationResult[] = [];

  // Find all instances of visibleOptionCount:varName=number pattern (destructured props with default values)
  const pattern = /visibleOptionCount:[\w$]+=(\d+)/g;
  let match;

  while ((match = pattern.exec(oldFile)) !== null) {
    // We want to replace just the number part
    const numberStart = match.index + match[0].indexOf('=') + 1;
    results.push({
      startIndex: numberStart,
      endIndex: numberStart + match[1].length,
    });
  }

  return results;
};

export const writeShowMoreItemsInSelectMenus = (
  oldFile: string,
  numberOfItems: number
): string | null => {
  const locations = getShowMoreItemsInSelectMenusLocation(oldFile);
  if (locations.length === 0) {
    return null;
  }

  // Sort locations by start index in descending order to apply from end to beginning
  const sortedLocations = locations.sort((a, b) => b.startIndex - a.startIndex);

  let newFile = oldFile;
  for (const location of sortedLocations) {
    const newContent = numberOfItems.toString();
    const updatedFile =
      newFile.slice(0, location.startIndex) +
      newContent +
      newFile.slice(location.endIndex);

    showDiff(
      newFile,
      updatedFile,
      newContent,
      location.startIndex,
      location.endIndex
    );
    newFile = updatedFile;
  }

  return newFile;
};
