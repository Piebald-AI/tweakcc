// Please see the note about writing patches in ./index.

import { LocationResult, showDiff } from './index';

const getThinkerSymbolMirrorOptionLocation = (
  oldFile: string
): LocationResult | null => {
  const mirrorPattern =
    /=\s*\[\.\.\.([$\w]+),\s*\.\.\.?\[\.\.\.\1\]\.reverse\(\)\]/;
  const match = oldFile.match(mirrorPattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker symbol mirror option: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1]],
  };
};

export const writeThinkerSymbolMirrorOption = (
  oldFile: string,
  enableMirror: boolean
): string | null => {
  const location = getThinkerSymbolMirrorOptionLocation(oldFile);
  if (!location) {
    return null;
  }

  const varName = location.identifiers?.[0];
  const newArray = enableMirror
    ? `=[...${varName},...[...${varName}].reverse()]`
    : `=[...${varName}]`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newArray +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newArray, location.startIndex, location.endIndex);
  return newFile;
};
