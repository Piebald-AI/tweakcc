// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

const getThinkerSymbolSpeedLocation = (
  oldFile: string
): LocationResult | null => {
  // Use the original full regex to find the exact pattern
  const speedPattern =
    /[, ][$\w]+\(\(\)=>\{if\(![$\w]+\)\{[$\w]+\(\d+\);return\}[$\w]+\(\([^)]+\)=>[^)]+\+1\)\},(\d+)\)/;
  const match = oldFile.match(speedPattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker symbol speed: failed to find match');
    return null;
  }

  // Find where the captured number starts and ends within the full match
  const fullMatchText = match[0];
  const capturedNumber = match[1];

  // Find the number within the full match
  const numberIndex = fullMatchText.lastIndexOf(capturedNumber);
  const startIndex = match.index + numberIndex;
  const endIndex = startIndex + capturedNumber.length;

  return {
    startIndex: startIndex,
    endIndex: endIndex,
  };
};

export const writeThinkerSymbolSpeed = (
  oldFile: string,
  speed: number
): string | null => {
  const location = getThinkerSymbolSpeedLocation(oldFile);
  if (!location) {
    return null;
  }

  const speedStr = JSON.stringify(speed);

  const newContent =
    oldFile.slice(0, location.startIndex) +
    speedStr +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newContent,
    speedStr,
    location.startIndex,
    location.endIndex
  );
  return newContent;
};
