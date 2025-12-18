// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

/**
 * Forces thinking blocks to be visible inline by default, ensuring thinking content
 * always renders as if in transcript mode.
 */

const getThinkingVisibilityLocation = (
  oldFile: string
): LocationResult | null => {
  // In this code:
  // ```
  // case "thinking":
  //  if (!H && !G)
  //    return null;
  //  return b5.createElement(mn2, {addMargin: Q, param: A, isTranscriptMode: H,verbose: G });
  // ```
  // we need to remove the if and the return.
  const visibilityPattern =
    /(case"thinking":)if\(.+?\)return null;(.+?isTranscriptMode:).+?([},])/;
  const visibilityMatch = oldFile.match(visibilityPattern);

  if (!visibilityMatch || visibilityMatch.index === undefined) {
    console.error(
      'patch: thinkingVisibility: failed to find thinking visibility pattern'
    );
    return null;
  }

  const startIndex = visibilityMatch.index;
  const endIndex = startIndex + visibilityMatch[0].length;

  return {
    startIndex,
    endIndex,
    identifiers: [visibilityMatch[1], visibilityMatch[2], visibilityMatch[3]],
  };
};

export const writeThinkingVisibility = (oldFile: string): string | null => {
  // Force thinking visibility in renderer
  const visibilityLocation = getThinkingVisibilityLocation(oldFile);
  if (!visibilityLocation) {
    return null;
  }

  const visibilityReplacement = `${visibilityLocation.identifiers![0]}${visibilityLocation.identifiers![1]}true${visibilityLocation.identifiers![2]}`;
  const newFile =
    oldFile.slice(0, visibilityLocation.startIndex) +
    visibilityReplacement +
    oldFile.slice(visibilityLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    visibilityReplacement,
    visibilityLocation.startIndex,
    visibilityLocation.endIndex
  );

  return newFile;
};
