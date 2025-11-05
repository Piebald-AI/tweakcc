// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

/**
 * Forces thinking blocks to be visible inline by default, removing the collapsed
 * "Thought for Xs (ctrl+o to show thinking)" banner and ensuring thinking content
 * always renders as if in transcript mode.
 */

const getBannerFunctionLocation = (oldFile: string): LocationResult | null => {
  // Matches: function X({streamMode:Y}){
  // Replace with: function X({streamMode:Y}){return null;
  const bannerPattern =
    /function ([$\w]+)\(\{\s*streamMode:\s*([$\w]+)\s*\}\)\s*\{/;
  const bannerMatch = oldFile.match(bannerPattern);

  if (!bannerMatch || bannerMatch.index === undefined) {
    console.error(
      'patch: thinkingVisibility: failed to find banner function pattern'
    );
    return null;
  }

  const [fullMatch] = bannerMatch;
  const startIndex = bannerMatch.index;
  const endIndex = startIndex + fullMatch.length;

  return {
    startIndex,
    endIndex,
    identifiers: [bannerMatch[1], bannerMatch[2]],
  };
};

const getThinkingVisibilityLocation = (
  oldFile: string
): LocationResult | null => {
  // In this code:
  // ```
  // case "thinking":
  //   if (!V)
  //     return null;
  //   return C3.createElement(UTQ, { addMargin: B, param: A, isTranscriptMode: V });`
  // ```
  // we need to remove the early return.
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
    identifiers: [visibilityMatch[1], visibilityMatch[2], visibilityMatch[3]]
  };
};

export const writeThinkingVisibility = (oldFile: string): string | null => {
  // Patch 1: Remove the banner function
  const bannerLocation = getBannerFunctionLocation(oldFile);
  if (!bannerLocation) {
    return null;
  }

  const newCode = 'return null;';
  let newFile =
    oldFile.slice(0, bannerLocation.endIndex) +
    newCode +
    oldFile.slice(bannerLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    newCode,
    bannerLocation.endIndex,
    bannerLocation.endIndex
  );

  // Patch 2: Force thinking visibility in renderer
  const visibilityLocation = getThinkingVisibilityLocation(newFile);
  if (!visibilityLocation) {
    return null;
  }

  const visibilityReplacement = `${visibilityLocation.identifiers![0]}${visibilityLocation.identifiers![1]}true${visibilityLocation.identifiers![2]}`;
  newFile =
    newFile.slice(0, visibilityLocation.startIndex) +
    visibilityReplacement +
    newFile.slice(visibilityLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    visibilityReplacement,
    visibilityLocation.startIndex,
    visibilityLocation.endIndex
  );

  return newFile;
};
