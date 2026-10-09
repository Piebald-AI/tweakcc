// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * CC >= 2.1.27 no longer steps the spinner on a fixed timer. It "breathes":
 * the frame index follows a cosine over a fixed period, going up the frame
 * list and back down once per period (2.1.283):
 *
 *   function Bo(l){let t=X2t(l,xo);return Math.round(t*(K2t().length-1))}
 *
 * with `xo=2000`. The setting is milliseconds per frame, and one period
 * visits 2*(frames-1) frames, so the period becomes speed*2*(frames-1).
 */
const writeBreathingSpinnerSpeed = (
  oldFile: string,
  speed: number,
  frameCount: number
): string | null => {
  const pattern =
    /(function [$\w]+\(([$\w]+)\)\{let ([$\w]+)=[$\w]+\(\2,)([$\w]+|\d+)(\);return Math\.round\(\3\*\([$\w]+\(\)\.length-1\)\)\})/;
  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) return null;
  const period = Math.max(
    1,
    Math.round(speed * 2 * Math.max(1, frameCount - 1))
  );
  const replacement = match[1] + period + match[5];
  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);
  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};

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
  speed: number,
  frameCount = 6
): string | null => {
  const pattern = /(if\(![$\w]+\)\{[$\w]+\(4\);return\})(.{0,200})120\)/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    const breathing = writeBreathingSpinnerSpeed(oldFile, speed, frameCount);
    if (breathing !== null) return breathing;
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
