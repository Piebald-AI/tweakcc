// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Rounds the displayed token count to the nearest multiple of a given base value.
 *
 * This patch modifies the token count display so that instead of showing exact
 * values like "1234 tokens", it shows rounded values like "1200 tokens" (when
 * base is 100).
 *
 * The patch supports two different patterns for different Claude Code versions:
 *
 * Newer versions (CC 2.x+):
 * ```
 * overrideMessage:..., VAR=FUNC(EXPR),...key:"tokens"..., VAR," tokens"
 * ```
 *
 * Older versions (CC 1.x):
 * ```
 * overrideMessage:...,key:"tokens"...FUNC(Math.round(...))
 * ```
 *
 * The token expression is wrapped with: Math.round((EXPR)/base)*base
 */
export const writeTokenCountRounding = (
  oldFile: string,
  roundingBase: number
): string | null => {
  let fullMatch: string;
  let pre: string;
  let partToWrap: string;
  let post: string;
  let startIndex: number;

  // Try multiple patterns for different CC versions

  // Pattern 1 (CC <2.1.83): overrideMessage anchor nearby
  const m1 = oldFile.match(
    /(overrideMessage:.{0,10000},([$\w]+)=[$\w]+\()(.+?)(\),.{0,1000}key:"tokens".{0,200},\2," tokens")/
  );

  if (m1 && m1.index !== undefined) {
    [fullMatch, pre, , partToWrap, post] = m1;
    startIndex = m1.index;
  } else {
    // Pattern 2 (CC >=2.1.83): Direct match on formatter call near key:"tokens"
    // Matches: VAR=FUNC(EXPR),...key:"tokens"...,VAR," tokens"
    const m2 = oldFile.match(
      /(([$\w]+)=([$\w]+)\()(.+?)(\),.{0,2000}key:"tokens".{0,200},\2," tokens")/
    );

    if (m2 && m2.index !== undefined) {
      [fullMatch, pre, , , partToWrap, post] = m2;
      startIndex = m2.index;
    } else {
      // Pattern 3 (CC 1.x): older format
      const m3 = oldFile.match(
        /(overrideMessage:.{0,10000},key:"tokens".{0,200}[$\w]+\()(Math\.round\(.+?\))(\))/
      );

      if (m3 && m3.index !== undefined) {
        [fullMatch, pre, partToWrap, post] = m3;
        startIndex = m3.index;
      } else {
        console.error(
          'patch: tokenCountRounding: cannot find token count pattern in any CC format'
        );
        return null;
      }
    }
  }

  const replacement = `${pre}Math.round((${partToWrap})/${roundingBase})*${roundingBase}${post}`;
  const endIndex = startIndex + fullMatch.length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
