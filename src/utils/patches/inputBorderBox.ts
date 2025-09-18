// Please see the note about writing patches in ./index.js.

import { LocationResult } from './index.js';

const getInputBoxBorderLocation = (oldFile: string): LocationResult | null => {
  // Find the SPECIFIC main input box border pattern
  // Must have alignItems, justifyContent, and borderColor function call - this uniquely identifies the main input
  const mainInputPattern =
    /createElement\([$\w]+,\{alignItems:"flex-start",justifyContent:"flex-start",borderColor:[$\w]+\(\),borderDimColor:[$\w]+!=="memory",borderStyle:"round",borderLeft:!1,borderRight:!1,marginTop:1,width:"100%"\}/;
  const mainInputMatch = oldFile.match(mainInputPattern);

  if (!mainInputMatch || mainInputMatch.index === undefined) {
    console.error('patch: input border: failed to find main input pattern');
    return null;
  }

  // Return the location of the entire main input element for comprehensive modification
  return {
    startIndex: mainInputMatch.index,
    endIndex: mainInputMatch.index + mainInputMatch[0].length,
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

  // Get the original main input element
  const originalElement = oldFile.slice(location.startIndex, location.endIndex);

  let newElement;
  if (removeBorder) {
    // Completely remove ALL border-related properties to avoid undefined errors
    // Remove: borderColor, borderDimColor, borderStyle, borderLeft, borderRight
    newElement = originalElement
      .replace(/borderColor:[$\w+]\(\),?/, '') // Remove borderColor function call
      .replace(/borderDimColor:[^,}]+,?/, '') // Remove borderDimColor
      .replace(/borderStyle:"[^"]*",?/, '') // Remove borderStyle
      .replace(/borderLeft:![0-1],?/, '') // Remove borderLeft
      .replace(/borderRight:![0-1],?/, ''); // Remove borderRight

    const newFile =
      oldFile.slice(0, location.startIndex) +
      newElement +
      oldFile.slice(location.endIndex);

    return newFile;
  } else {
    return oldFile;
  }
};
