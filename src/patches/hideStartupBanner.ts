// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getStartupBannerLocation = (oldFile: string): LocationResult | null => {
  // Try old pattern first: createElement with isBeforeFirstMessage:!1
  const oldPattern =
    /,[$\w]+\.createElement\([$\w]+,\{isBeforeFirstMessage:!1\}\),/;
  const oldMatch = oldFile.match(oldPattern);

  if (oldMatch && oldMatch.index !== undefined) {
    return {
      startIndex: oldMatch.index,
      endIndex: oldMatch.index + oldMatch[0].length,
    };
  }

  // CC ≥2.1.97: startup redesigned to IDE onboarding screen
  // Function: function YI4(){let q=j8(),K=_y.terminal||"unknown";return q.hasIdeOnboardingBeenShown?.[K]===!0}
  const newPattern =
    /function ([$\w]+)\(\)\{let [$\w]+=[$\w]+\(\),[$\w]+=[$\w]+\.terminal\|\|"unknown";return [$\w]+\.hasIdeOnboardingBeenShown\?\.\[[$\w]+\]===!0\}/;
  const newMatch = oldFile.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    return {
      startIndex: newMatch.index,
      endIndex: newMatch.index + newMatch[0].length,
    };
  }

  console.error(
    'patch: hideStartupBanner: failed to find startup banner pattern'
  );
  return null;
};

export const writeHideStartupBanner = (oldFile: string): string | null => {
  const location = getStartupBannerLocation(oldFile);
  if (!location) {
    return null;
  }

  const originalText = oldFile.slice(location.startIndex, location.endIndex);

  let replacement: string;

  if (originalText.startsWith(',')) {
    // Old pattern: remove the element by replacing with just a comma
    replacement = ',';
  } else {
    // New pattern (CC ≥2.1.97): force YI4() to always return true (skip onboarding)
    // Insert return !0; right after the opening brace
    replacement = originalText.replace(/\{let/, '{return !0;let');
  }

  const newFile =
    oldFile.slice(0, location.startIndex) +
    replacement +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    replacement,
    location.startIndex,
    location.endIndex
  );
  return newFile;
};
