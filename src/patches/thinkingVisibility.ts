// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * CC v2.0.50
 * ```diff
 *  case "thinking":
 * -  if (!V && !I) return null;
 *    return w3.createElement(Q$Q, {
 *      addMargin: B,
 *      param: A,
 * -    isTranscriptMode: V,
 * +    isTranscriptMode: true,
 *      verbose: I,
 *    });
 * ```
 *
 * CC v2.1.18
 * ```diff
 *  case "thinking": {
 * -  if (!D && !H) return null;
 *    let T = D && !(!P || f === P),
 *      k;
 *    if (K[22] !== Y || K[23] !== D || K[24] !== q || K[25] !== T || K[26] !== H)
 *      k = Y9.createElement(YW1, {
 *        addMargin: Y,
 *        param: q,
 * -      isTranscriptMode: D,
 * +      isTranscriptMode: true,
 *        verbose: H,
 *        hideInTranscript: T,
 *      });
 *  }
 * ```
 */

export const writeThinkingVisibility = (oldFile: string): string | null => {
  // Unified pattern that matches both formats:
  // - Group 1: `case"thinking":` (+/- `{`)
  // - Group 2: `if(...) return null;` (the early return we want to remove)
  // - Group 3: Everything from `{` or return up to `isTranscriptMode:`
  // - Then the variable name followed by comma (replaced with `true,`)
  const pattern =
    /(case"thinking":\{?)(if\(.+?\)return null;)(.{0,400}isTranscriptMode:).+?,/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: thinkingVisibility: failed to find thinking visibility pattern'
    );
    return null;
  }

  // Replacement: skip match[2] (removes the if-return-null), set isTranscriptMode to true
  const replacement = match[1] + match[3] + 'true,';

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
