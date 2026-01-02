// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index';

const getThinkerSymbolWidthLocation = (
  oldFile: string
): LocationResult | null => {
  const widthPattern = /\{flexWrap:"wrap",height:1,width:2\}/;
  const match = oldFile.match(widthPattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker symbol width: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
  };
};

export const writeThinkerSymbolWidthLocation = (
  oldFile: string,
  width: number
): string | null => {
  const location = getThinkerSymbolWidthLocation(oldFile);
  if (!location) {
    return null;
  }

  const newCss = `{flexWrap:"wrap",height:1,width:${width}}`;
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCss +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCss, location.startIndex, location.endIndex);
  return newFile;
};
