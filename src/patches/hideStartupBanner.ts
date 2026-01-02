// Please see the note about writing patches in ./index.

import { LocationResult, showDiff } from './index';

const getStartupBannerLocation = (oldFile: string): LocationResult | null => {
  // Find the createElement with isBeforeFirstMessage:!1
  const pattern =
    /,[$\w]+\.createElement\([$\w]+,\{isBeforeFirstMessage:!1\}\),/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: hideStartupBanner: failed to find startup banner createElement'
    );
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
  };
};

export const writeHideStartupBanner = (oldFile: string): string | null => {
  const location = getStartupBannerLocation(oldFile);
  if (!location) {
    return null;
  }

  // Remove the element by slicing it out (replace with just a comma to maintain syntax)
  const newFile =
    oldFile.slice(0, location.startIndex) +
    ',' +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, ',', location.startIndex, location.endIndex);
  return newFile;
};
