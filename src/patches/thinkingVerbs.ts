// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Replaces the thinker verbs array (e.g., ["Accomplishing","Actioning",...])
 * with the provided list of verbs.
 *
 * CC 1.0.24:
 * ```diff
 *  uz1 = [...ZP2, ...[...ZP2].reverse()],
 * -pz5 = ["Accomplishing", "Actioning", .., "Zigzagging"];
 * +pz5 = ["Custom", "verbs"];
 *  function My({
 *    mode: A,
 * ```
 *
 * CC 2.1.20:
 * ```diff
 *  var Za7 = C(() => {
 * -  _a7 = ["Accomplishing", "Actioning", ..., "Zigzagging"]
 * +  _a7 = ["Custom", "verbs"]
 *  });
 *  function rs(A){
 * ```
 */
export const writeThinkingVerbs = (
  oldFile: string,
  verbs: string[]
): string | null => {
  // Special ones:
  // - Beboppin'
  // - Dilly-dallying
  // - Flambéing
  const pattern = /\[("[A-Z][a-z'é-]+in[g']",?){50,}\]/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: thinkingVerbs: failed to find thinker verbs pattern');
    return null;
  }

  const replacement = JSON.stringify(verbs);

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
