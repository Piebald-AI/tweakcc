// Please see the note about writing patches in ./index

import { showDiff } from './index';

// This patch works with Claude Code versions at least as early as 1.0.24 and at least as late as 2.1.15.
// This patch is skipped for CC version 2.1.27 and newer (the issue was fixed upstream).

/**
 * Fixes an issue where the spinner freezes if the CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
 * environment variable is set.  See https://github.com/Piebald-AI/tweakcc/issues/46.
 *
 * CC 1.0.24
 * ```diff
 *  WV(() => {
 *    if (!J) {
 *      Z(4);
 *      return
 *    }
 *    Z((q) => q + 1)
 * -}, 120),
 * +}, 123456),
 * ```
 *
 * CC 2.1.15 - after they started using React Compiler:
 * ```diff
 *  let CA;
 *  if (K[17] !== V)
 *    ((CA = () => {
 * -    if (!V) {
 * -      D(4);
 * -      return;
 * -    }
 *      D(EcY);
 *    }),
 *      (K[17] = V),
 *      (K[18] = CA));
 *  else CA = K[18];
 * -l2(CA, 120);
 * +l2(CA, 123456);
 * ```
 */

export const writeThinkerSymbolSpeed = (
  oldFile: string,
  speed: number
): string | null => {
  const pattern = /(if\(![$\w]+\)\{[$\w]+\(4\);return\})(.{0,200})120\)/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: thinkerSymbolSpeed: failed to find thinker symbol speed pattern'
    );
    return null;
  }

  // Skip match[1] (removes the if-return block), keep match[2], replace 120 with speed
  const replacement = match[2] + speed + ')';

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
