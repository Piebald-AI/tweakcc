// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getStartupBannerLocation = (oldFile: string): LocationResult | null => {
  // CC <2.1.83: Find the createElement with isBeforeFirstMessage:!1
  const pattern =
    /,[$\w]+\.createElement\([$\w]+,\{isBeforeFirstMessage:!1\}\),/;
  const match = oldFile.match(pattern);

  if (match && match.index !== undefined) {
    return {
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    };
  }

  return null;
};

export const writeHideStartupBanner = (oldFile: string): string | null => {
  const location = getStartupBannerLocation(oldFile);
  if (location) {
    const newFile =
      oldFile.slice(0, location.startIndex) +
      ',' +
      oldFile.slice(location.endIndex);
    showDiff(oldFile, newFile, ',', location.startIndex, location.endIndex);
    return newFile;
  }

  // CC >=2.1.83: The startup banner is a standalone zero-arg component function.
  // It contains both "Apple_Terminal" (for theme branching) and "Welcome to Claude Code".
  // Insert `return null;` at the start of its body.
  const funcPattern = /(function ([$\w]+)\(\)\{)(?=[^}]{0,500}Apple_Terminal)/g;

  let funcMatch: RegExpExecArray | null;
  while ((funcMatch = funcPattern.exec(oldFile)) !== null) {
    // Verify this function also contains "Welcome to Claude Code"
    const bodyStart = funcMatch.index + funcMatch[0].length;
    const bodyPreview = oldFile.slice(bodyStart, bodyStart + 5000);
    if (bodyPreview.includes('Welcome to Claude Code')) {
      const insertIndex = bodyStart;
      const insertion = 'return null;';

      const newFile =
        oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);

      showDiff(oldFile, newFile, insertion, insertIndex, insertIndex);
      return newFile;
    }
  }

  console.error(
    'patch: hideStartupBanner: failed to find startup banner component'
  );
  return null;
};
