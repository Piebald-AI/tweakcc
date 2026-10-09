// Please see the note about writing patches in ./index
//
// This patch adds support for the "opusplan[1m]" model alias, which combines:
// - Opus for plan mode (complex reasoning)
// - Sonnet with 1M context for execution mode (reduces "context anxiety")
//
// The trick comes from Cognition's Devin team: using the 1M context model makes
// Claude believe it has plenty of room, reducing shortcuts and incomplete tasks
// that occur when Claude thinks it's near its context limit.
//
// See: https://github.com/Piebald-AI/tweakcc/issues/108
//
// Updated for CC 2.1.280+ module architecture where code is split across chunks.

import { showDiff } from './index';

/**
 * Patch 1: Add "opusplan[1m]" to the GV model aliases array
 *
 * Original:
 *   GV=["sonnet","opus","haiku","fable","best","sonnet[1m]","opus[1m]","fable[1m]","opusplan"]
 *
 * Patched:
 *   GV=["sonnet","opus","haiku","fable","best","sonnet[1m]","opus[1m]","fable[1m]","opusplan","opusplan[1m]"]
 */
const patchModelAliasesList = (oldFile: string): string | null => {
  // Match the end of the GV alias array: a "[1m]" alias followed by "opusplan"]
  const pattern = /"[a-z]+\[1m\]",("opusplan"\])/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Check if already patched
    if (/"[a-z]+\[1m\]","opusplan","opusplan\[1m\]"\]/.test(oldFile))
      return oldFile;
    return null; // This file doesn't have the GV array
  }

  const start = match.index + match[0].length - match[1].length;
  const replacement = '"opusplan","opusplan[1m]"]';
  const newFile =
    oldFile.slice(0, start) +
    replacement +
    oldFile.slice(match.index + match[0].length);

  showDiff(oldFile, newFile, replacement, start, match.index + match[0].length);
  return newFile;
};

/**
 * Patch 2: Add opusplan[1m] case to the ca(e) model switch
 *
 * Original:
 *   case"opusplan":return ga(n);
 *
 * Patched:
 *   case"opusplan":case"opusplan[1m]":return ga(n);
 */
const patchModelSwitchCa = (oldFile: string): string | null => {
  // Match: case"opusplan":return FUNC(VAR);
  // Must NOT be followed by case"opusplan[1m]" (already patched)
  const pattern =
    /case"opusplan":return ([$\w]+)\(([$\w]+)\);(?!case"opusplan\[1m\]")/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Check if already patched
    if (/case"opusplan":case"opusplan\[1m\]":return/.test(oldFile))
      return oldFile;
    return null; // This file doesn't have the ca() switch
  }

  const [fullMatch, funcName, varName] = match;
  const replacement = `case"opusplan":case"opusplan[1m]":return ${funcName}(${varName});`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + fullMatch.length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + fullMatch.length
  );
  return newFile;
};

/**
 * Patch 3: Add opusplan[1m] case to the Dt(e) model resolution switch
 *
 * Original:
 *   case"opusplan":return s?VA(YB(sm())):sm();
 *
 * Patched:
 *   case"opusplan":case"opusplan[1m]":return s?VA(YB(sm())):sm();
 */
const patchModelSwitchDt = (oldFile: string): string | null => {
  // Match: case"opusplan":return VAR?FUNC(FUNC(FUNC())):FUNC();
  const pattern =
    /case"opusplan":return ([$\w]+)\?([$\w]+)\(([$\w]+)\(([$\w]+)\(\)\)\):([$\w]+)\(\);(?!case"opusplan\[1m\]")/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Check if already patched
    if (/case"opusplan":case"opusplan\[1m\]":return [$\w]+\?/.test(oldFile))
      return oldFile;
    return null; // This file doesn't have the Dt() switch
  }

  const [fullMatch, condVar, fn1, fn2, fn3, fn4] = match;
  const replacement = `case"opusplan":case"opusplan[1m]":return ${condVar}?${fn1}(${fn2}(${fn3}())):${fn4}();`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + fullMatch.length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + fullMatch.length
  );
  return newFile;
};

/**
 * Patch 4: Extend the r8(e) description function for opusplan[1m]
 *
 * Original:
 *   if(e==="opusplan")return"Opus in plan mode, else Sonnet";
 *
 * Patched:
 *   if(e==="opusplan")return"Opus in plan mode, else Sonnet";if(e==="opusplan[1m]")return"Opus in plan mode, else Sonnet (1M context)";
 */
const patchDescriptionFunction = (oldFile: string): string | null => {
  // Match: if(VAR==="opusplan")return"...Opus...plan mode...Sonnet...";
  const pattern =
    /(if\(([$\w]+)==="opusplan"\)return"([^"]*Opus[^"]*plan mode[^"]*Sonnet[^"]*)";)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Check if already patched
    if (/if\([^)]*==="opusplan\[1m\]"\)return"[^"]*1M context/.test(oldFile))
      return oldFile;
    return null; // This file doesn't have the r8() function
  }

  const [fullMatch, , varName, description] = match;
  const replacement =
    fullMatch +
    `if(${varName}==="opusplan[1m]")return"${description} (1M context)";`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + fullMatch.length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + fullMatch.length
  );
  return newFile;
};

/**
 * Patch 5: Extend the iY(e) label function for opusplan[1m]
 *
 * Original:
 *   if(e==="opusplan")return"Opus Plan";
 *
 * Patched:
 *   if(e==="opusplan")return"Opus Plan";if(e==="opusplan[1m]")return"Opus Plan 1M";
 */
const patchLabelFunction = (oldFile: string): string | null => {
  // Match: if(VAR==="opusplan")return"Opus Plan";
  const pattern = /(if\(([$\w]+)==="opusplan"\)return"Opus Plan";)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Check if already patched
    if (/if\([^)]*==="opusplan\[1m\]"\)return"Opus Plan 1M"/.test(oldFile))
      return oldFile;
    return null; // This file doesn't have the iY() function
  }

  const [fullMatch, , varName] = match;
  const replacement =
    fullMatch + `if(${varName}==="opusplan[1m]")return"Opus Plan 1M";`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + fullMatch.length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + fullMatch.length
  );
  return newFile;
};

/**
 * Patch 6: Extend the JL(e) plan mode check for opusplan[1m]
 *
 * Original:
 *   return e==="opusplan"||e==="haiku";
 *
 * Patched:
 *   return e==="opusplan"||e==="opusplan[1m]"||e==="haiku";
 */
const patchPlanModeCheck = (oldFile: string): string | null => {
  // Match: return VAR==="opusplan"||VAR==="haiku";
  const pattern = /(return )([$\w]+)==="opusplan"\|\|([$\w]+)==="haiku"(;)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Check if already patched
    if (/==="opusplan"\|\|[$\w]+==="opusplan\[1m\]"\|\|/.test(oldFile))
      return oldFile;
    return null; // This file doesn't have the JL() function
  }

  const [fullMatch, ret, var1, var2, semi] = match;
  // Insert opusplan[1m] check
  const replacement = `${ret}${var1}==="opusplan"||${var1}==="opusplan[1m]"||${var2}==="haiku"${semi}`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + fullMatch.length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + fullMatch.length
  );
  return newFile;
};

/**
 * Main entry point: Apply all opusplan[1m] patches
 * Note: Different patches apply to different module files:
 * - Model aliases array (GV) is in a separate module (e.g., chunk-fg6ja6wn.js)
 * - Most functions are in the main model handling module (e.g., chunk-sn362cnh.js)
 *
 * Returns the patched file if any patches applied, or null if no patterns matched.
 * This allows the patch framework to try other modules.
 */
export const writeOpusplan1m = (oldFile: string): string | null => {
  let newFile = oldFile;
  let anyPatched = false;

  // Try all patches - they may be in different files, so we track if any succeeded

  // Patch 1: Model aliases list (may be in a different module)
  let result = patchModelAliasesList(newFile);
  if (result !== null) {
    if (result !== newFile) {
      newFile = result;
      anyPatched = true;
    }
  }

  // Patch 2: ca() model switch
  result = patchModelSwitchCa(newFile);
  if (result !== null) {
    if (result !== newFile) {
      newFile = result;
      anyPatched = true;
    }
  }

  // Patch 3: Dt() model resolution switch
  result = patchModelSwitchDt(newFile);
  if (result !== null) {
    if (result !== newFile) {
      newFile = result;
      anyPatched = true;
    }
  }

  // Patch 4: Description function
  result = patchDescriptionFunction(newFile);
  if (result !== null) {
    if (result !== newFile) {
      newFile = result;
      anyPatched = true;
    }
  }

  // Patch 5: Label function
  result = patchLabelFunction(newFile);
  if (result !== null) {
    if (result !== newFile) {
      newFile = result;
      anyPatched = true;
    }
  }

  // Patch 6: Plan mode check
  result = patchPlanModeCheck(newFile);
  if (result !== null) {
    if (result !== newFile) {
      newFile = result;
      anyPatched = true;
    }
  }

  // Return the patched file if any sub-patch applied, otherwise null
  // This allows the patch framework to try other modules
  return anyPatched ? newFile : null;
};
