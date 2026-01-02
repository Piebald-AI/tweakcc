// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getInputBoxBorderLocation = (oldFile: string): LocationResult | null => {
  // Find the SPECIFIC main input box border pattern
  // Must have alignItems, justifyContent, and borderColor function call - this uniquely identifies the main input
  const bashIndex = oldFile.indexOf('bash:"bashBorder"');
  if (bashIndex === -1) {
    console.error('patch: input border: failed to find bash pattern');
    return null;
  }

  const searchSection = oldFile.slice(bashIndex, bashIndex + 500);
  const borderStylePattern = /borderStyle:"[^"]*"/;
  const borderStyleMatch = searchSection.match(borderStylePattern);

  if (!borderStyleMatch || borderStyleMatch.index === undefined) {
    console.error('patch: input border: failed to find border style pattern');
    return null;
  }

  // Return the location of the entire main input element for comprehensive modification
  return {
    startIndex: bashIndex + borderStyleMatch.index,
    endIndex: bashIndex + borderStyleMatch.index + borderStyleMatch[0].length,
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

  if (removeBorder) {
    const newProp = 'borderColor:undefined';

    const newFile =
      oldFile.slice(0, location.startIndex) +
      newProp +
      oldFile.slice(location.endIndex);

    showDiff(oldFile, newFile, newProp, location.startIndex, location.endIndex);

    return newFile;
  } else {
    return oldFile;
  }
};
