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
const patchPresentTenseVerbs = (
  file: string,
  verbs: string[]
): string | null => {
  // Special ones:
  // - Beboppin'
  // - Dilly-dallying
  // - Flambéing
  // Character class includes a-z, apostrophe, hyphens, and \xNN escape sequences
  // (e.g., Flambéing stored as Flamb\xE9ing in minified source)
  const pattern = /\[("[A-Z][a-z'é\-\\xA-F0-9]+in[g']",?){50,}\]/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: thinkingVerbs: failed to find present tense verbs pattern'
    );
    return null;
  }

  const replacement = JSON.stringify(verbs);

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

const patchPastTenseVerbs = (file: string, verbs: string[]): string | null => {
  const pattern = /\[("[A-Z][a-z'é\-\\xA-F0-9]+ed",?){5,}\]/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: thinkingVerbs: failed to find past tense verbs pattern'
    );
    return null;
  }

  // Convert verbs from "ing" to "ed"
  const pastTenseVerbs = verbs.map(verb => verb.replace(/ing$/, 'ed'));
  const replacement = JSON.stringify(pastTenseVerbs);

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

export const writeThinkingVerbs = (
  oldFile: string,
  verbs: string[]
): string | null => {
  const afterPresentTense = patchPresentTenseVerbs(oldFile, verbs);
  if (afterPresentTense === null) {
    return null;
  }

  const afterPastTense = patchPastTenseVerbs(afterPresentTense, verbs);
  if (afterPastTense === null) {
    return null;
  }

  return afterPastTense;
};
