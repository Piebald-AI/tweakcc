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

import { showDiff } from './index';

/**
 * Patch 1: Fix the mode-switching function (bF) to recognize opusplan[1m]
 *
 * The bF function determines which model to use based on mode. Currently it does
 * an exact match: K8A() === "opusplan". We need it to also match "opusplan[1m]".
 *
 * Original:
 *   if (K8A() === "opusplan" && K === "plan" && !Y) return q8A();
 *
 * Patched:
 *   if ((K8A() === "opusplan" || K8A() === "opusplan[1m]") && K === "plan" && !Y) return q8A();
 */
const patchModeSwitchingFunction = (oldFile: string): string | null => {
  // Pattern matches: if (FUNC() === "opusplan" && VAR === "plan" && !VAR) return FUNC();
  // We need to be careful to match the exact structure while allowing for minified variable names
  const pattern =
    /if\s*\(\s*([$\w]+)\(\)\s*===\s*"opusplan"\s*&&\s*([$\w]+)\s*===\s*"plan"\s*&&\s*!([$\w]+)\s*\)\s*return\s*([$\w]+)\(\);/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: opusplan1m: patchModeSwitchingFunction: failed to find mode switching pattern'
    );
    return null;
  }

  const [fullMatch, k8aFunc, modeVar, exceedsVar, opusFunc] = match;

  // Build the replacement with OR condition for opusplan[1m]
  const replacement = `if((${k8aFunc}()==="opusplan"||${k8aFunc}()==="opusplan[1m]")&&${modeVar}==="plan"&&!${exceedsVar})return ${opusFunc}();`;

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
 * Patch 2: Add "opusplan[1m]" to the model aliases list (k0A)
 *
 * Original:
 *   k0A = ["sonnet", "opus", "haiku", "sonnet[1m]", "opusplan"]
 *
 * Patched:
 *   k0A = ["sonnet", "opus", "haiku", "sonnet[1m]", "opusplan", "opusplan[1m]"]
 */
const patchModelAliasesList = (oldFile: string): string | null => {
  // Pattern matches the model aliases array assignment
  // Looking for: ["sonnet", "opus", "haiku", "sonnet[1m]", "opusplan"]
  const pattern =
    /(\[\s*"sonnet"\s*,\s*"opus"\s*,\s*"haiku"\s*,\s*"sonnet\[1m\]"\s*,\s*"opusplan"\s*\])/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: opusplan1m: patchModelAliasesList: failed to find model aliases list'
    );
    return null;
  }

  // Add opusplan[1m] to the list
  const replacement =
    '["sonnet","opus","haiku","sonnet[1m]","opusplan","opusplan[1m]"]';

  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + match[0].length);

  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + match[0].length
  );
  return newFile;
};

/**
 * Patch 3: Fix the description function (Zm3) to handle opusplan[1m]
 *
 * Original:
 *   if (A === "opusplan") return "Opus 4.5 in plan mode, else Sonnet 4.5";
 *
 * Patched:
 *   if (A === "opusplan") return "Opus 4.5 in plan mode, else Sonnet 4.5";
 *   if (A === "opusplan[1m]") return "Opus 4.5 in plan mode, else Sonnet 4.5 (1M context)";
 */
const patchDescriptionFunction = (oldFile: string): string | null => {
  // Pattern matches: if (VAR === "opusplan") return "Opus 4.5 in plan mode, else Sonnet 4.5";
  const pattern =
    /(if\s*\(\s*([$\w]+)\s*===\s*"opusplan"\s*\)\s*return\s*"Opus 4\.5 in plan mode, else Sonnet 4\.5";)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: opusplan1m: patchDescriptionFunction: failed to find description pattern'
    );
    return null;
  }

  const [fullMatch, , varName] = match;

  // Add the opusplan[1m] case right after the opusplan case
  const replacement =
    fullMatch +
    `if(${varName}==="opusplan[1m]")return"Opus 4.5 in plan mode, else Sonnet 4.5 (1M context)";`;

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
 * Patch 4: Fix the label function (Tq4) to handle opusplan[1m]
 *
 * Original:
 *   if (A === "opusplan") return "Opus Plan";
 *
 * Patched:
 *   if (A === "opusplan") return "Opus Plan";
 *   if (A === "opusplan[1m]") return "Opus Plan 1M";
 */
const patchLabelFunction = (oldFile: string): string | null => {
  // Pattern matches: if (VAR === "opusplan") return "Opus Plan";
  const pattern =
    /(if\s*\(\s*([$\w]+)\s*===\s*"opusplan"\s*\)\s*return\s*"Opus Plan";)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: opusplan1m: patchLabelFunction: failed to find label pattern'
    );
    return null;
  }

  const [fullMatch, , varName] = match;

  // Add the opusplan[1m] case right after the opusplan case
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
 * Patch 5: Add opusplan[1m] menu option function (similar to Mm3)
 *
 * We need to add a function that returns the menu option for opusplan[1m],
 * and inject it into the model selector options.
 *
 * The existing Mm3 function:
 *   Mm3 = () => {
 *     return {
 *       value: "opusplan",
 *       label: "Opus Plan Mode",
 *       description: "Use Opus 4.5 in plan mode, Sonnet 4.5 otherwise",
 *     };
 *   };
 *
 * We'll add a similar function for opusplan[1m] and inject it where opusplan options are added.
 */
const patchModelSelectorOptions = (oldFile: string): string | null => {
  // Find where opusplan is added to the model list: [...A, Mm3()]
  // Pattern: if (K === "opusplan") return [...A, Mm3()];
  // We need to add a similar case for opusplan[1m]
  // Capture groups: 1=fullMatch, 2=conditionVar (K), 3=listVar (A), 4=funcName (Mm3)
  const pattern =
    /(if\s*\(\s*([$\w]+)\s*===\s*"opusplan"\s*\)\s*return\s*\[\s*\.\.\.([$\w]+)\s*,\s*([$\w]+)\(\)\s*\];)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: opusplan1m: patchModelSelectorOptions: failed to find model selector pattern'
    );
    return null;
  }

  const [fullMatch, , varName, listVar] = match;

  // Add the opusplan[1m] case right after. We create an inline object instead of a function
  // since we don't want to modify the function definitions area
  const replacement =
    fullMatch +
    `if(${varName}==="opusplan[1m]")return[...${listVar},{value:"opusplan[1m]",label:"Opus Plan Mode 1M",description:"Use Opus 4.5 in plan mode, Sonnet 4.5 (1M context) otherwise"}];`;

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
 * Patch 6: Add opusplan[1m] to the model selector list so it's ALWAYS visible
 *
 * This injects push statements to add opusplan and opusplan[1m] to the model list
 * so they always appear in the /model menu, not just when selected.
 *
 * We find the point right after the conditional check `if(K===null||A.some(...))`
 * and inject before the opusplan conditional return.
 */
const patchAlwaysShowInModelSelector = (oldFile: string): string | null => {
  // Find the pattern: if(K===null||A.some((VAR)=>VAR.value===K))return A;
  // This is right before the opusplan conditional, and we want to inject pushes before this
  const pattern =
    /(if\s*\(\s*[$\w]+\s*===\s*null\s*\|\|\s*([$\w]+)\.some\s*\(\s*\(\s*[$\w]+\s*\)\s*=>\s*[$\w]+\.value\s*===\s*[$\w]+\s*\)\s*\)\s*return\s*[$\w]+\s*;)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: opusplan1m: patchAlwaysShowInModelSelector: failed to find model list check pattern'
    );
    return null;
  }

  const [, , listVar] = match;

  // Inject pushes BEFORE the conditional return
  // This ensures opusplan and opusplan[1m] are always in the list
  const inject =
    `${listVar}.push({value:"opusplan",label:"Opus Plan Mode",description:"Use Opus 4.5 in plan mode, Sonnet 4.5 otherwise"});` +
    `${listVar}.push({value:"opusplan[1m]",label:"Opus Plan Mode 1M",description:"Use Opus 4.5 in plan mode, Sonnet 4.5 (1M context) otherwise"});`;

  const newFile =
    oldFile.slice(0, match.index) + inject + oldFile.slice(match.index);

  showDiff(oldFile, newFile, inject, match.index, match.index);
  return newFile;
};

/**
 * Main entry point: Apply all opusplan[1m] patches
 */
export const writeOpusplan1m = (oldFile: string): string | null => {
  let newFile = oldFile;
  let applied = false;

  // Patch 1: Mode switching function
  const result1 = patchModeSwitchingFunction(newFile);
  if (result1) {
    newFile = result1;
    applied = true;
  } else {
    console.error('patch: opusplan1m: failed to apply mode switching patch');
  }

  // Patch 2: Model aliases list
  const result2 = patchModelAliasesList(newFile);
  if (result2) {
    newFile = result2;
    applied = true;
  } else {
    console.error(
      'patch: opusplan1m: failed to apply model aliases list patch'
    );
  }

  // Patch 3: Description function
  const result3 = patchDescriptionFunction(newFile);
  if (result3) {
    newFile = result3;
    applied = true;
  } else {
    console.error(
      'patch: opusplan1m: failed to apply description function patch'
    );
  }

  // Patch 4: Label function
  const result4 = patchLabelFunction(newFile);
  if (result4) {
    newFile = result4;
    applied = true;
  } else {
    console.error('patch: opusplan1m: failed to apply label function patch');
  }

  // Patch 5: Model selector options (conditional show when selected)
  const result5 = patchModelSelectorOptions(newFile);
  if (result5) {
    newFile = result5;
    applied = true;
  } else {
    console.error(
      'patch: opusplan1m: failed to apply model selector options patch'
    );
  }

  // Patch 6: Always show in model selector (push to list)
  const result6 = patchAlwaysShowInModelSelector(newFile);
  if (result6) {
    newFile = result6;
    applied = true;
  } else {
    console.error(
      'patch: opusplan1m: failed to apply always-show-in-selector patch'
    );
  }

  return applied ? newFile : null;
};
