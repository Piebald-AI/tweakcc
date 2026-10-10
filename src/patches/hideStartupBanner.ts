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

/**
 * CC >=2.1.282: the zero-arg wrapper that renders the startup card and the
 * release-notes summary:
 *   function sa(){let f=w(16),{storageV5:l}=Ce(),…L=e(na,{oneShotsAllowed:A}),…
 */
export const findStartupBannerWrapper = (
  oldFile: string
): { name: string; bodyIndex: number } | null => {
  const match = oldFile.match(
    /(function ([$\w]+)\(\)\{)(?=(?:(?!function )[^]){0,1000}?\([$\w]+,\{oneShotsAllowed:[$\w]+\}\))/
  );
  if (!match || match.index === undefined) return null;
  return { name: match[2], bodyIndex: match.index + match[1].length };
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

  // CC >=2.1.282: the card is rendered by a wrapper that also prints the
  // "Updated to latest. Got N features…" release-notes summary below it.
  // Disable the wrapper so both are hidden.
  const wrapper = findStartupBannerWrapper(oldFile);
  if (wrapper) {
    const insertIndex = wrapper.bodyIndex;
    const insertion = 'return null;';
    const newFile =
      oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);
    showDiff(oldFile, newFile, insertion, insertIndex, insertIndex);
    return newFile;
  }

  // CC >=2.1.156: the startup card component contains both the full-logo
  // branch and the compact/horizontal card branch. Disable the whole component.
  const modernCardPatterns = [
    /(function [$\w]+\(\)\{)(?=let [$\w]+=[\w$]+\.c\(\d+\),[$\w]+=[\w$]+\(\)\.oauthAccount\?\.displayName\?\?""|let [$\w]+=[\w$]+\(\),[$\w]+=[\w$]+\?\.displayName\?\?"")/,
    /(function [$\w]+\(\)\{)(?=let [$\w]+=[\w$]+\.c\(\d+\),[$\w]+=[\w$]+\(\),[$\w]+=[\w$]+\?\.displayName\?\?"")/,
    // CC 2.1.2xx: the card takes an options arg and reads its header data
    // through one helper: function Is(o){…,{version:C,cwd:L,billingType:V,agentName:F}=KYe(),…
    /(function [$\w]+\([$\w]*\)\{)(?=let [$\w]+=[$\w]+\(\d+\)[^]{0,400}?\{version:[$\w]+,cwd:[$\w]+,billingType:[$\w]+(?:,agentName:[$\w]+)?\}=[$\w]+\(\))/,
  ];

  for (const modernCardPattern of modernCardPatterns) {
    const modernCardMatch = oldFile.match(modernCardPattern);
    if (modernCardMatch && modernCardMatch.index !== undefined) {
      const insertIndex = modernCardMatch.index + modernCardMatch[1].length;
      const insertion = 'return null;';
      const newFile =
        oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);

      showDiff(oldFile, newFile, insertion, insertIndex, insertIndex);
      return newFile;
    }
  }

  // CC >=2.1.83: The startup banner is a standalone zero-arg component function.
  // It contains both "Apple_Terminal" (for theme branching) and "Welcome to Claude Code".
  // Insert `return null;` at the start of its body.
  const funcPattern = /(function ([$\w]+)\(\)\{)(?=[^}]{0,500}Apple_Terminal)/g;

  let funcMatch: RegExpExecArray | null;
  while ((funcMatch = funcPattern.exec(oldFile)) !== null) {
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
