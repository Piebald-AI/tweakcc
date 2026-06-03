// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getShowMoreItemsInSelectMenusLocation = (
  oldFile: string
): LocationResult[] => {
  const results: LocationResult[] = [];

  // Find all instances of visibleOptionCount:varName=number pattern (destructured props with default values)
  const pattern = /visibleOptionCount:[\w$]+=(\d+)/g;
  let match;

  while ((match = pattern.exec(oldFile)) !== null) {
    // We want to replace just the number part
    const numberStart = match.index + match[0].indexOf('=') + 1;
    results.push({
      startIndex: numberStart,
      endIndex: numberStart + match[1].length,
    });
  }

  return results;
};

/**
 * Patch the help/command menu to use full terminal height instead of half.
 *
 * In CC source (HelpV2.tsx):
 *   const maxHeight = Math.floor(rows / 2);
 *
 * In minified code this appears as:
 *   {rows:VAR,columns:VAR}=_7(),VAR=Math.floor(VAR/2)
 *
 * We replace `Math.floor(VAR/2)` with just `VAR` so the menu uses full height.
 */
const patchHelpMenuHeight = (file: string): string | null => {
  // CC <= 2.1.150: {rows:VAR,columns:VAR}=FUNC(),VAR=Math.floor(VAR/2)
  const halfHeightPattern =
    /\{rows:([\w$]+),columns:[\w$]+\}=[\w$]+\(\),([\w$]+)=Math\.floor\(\1\/2\)/;
  const halfHeightMatch = file.match(halfHeightPattern);

  if (halfHeightMatch && halfHeightMatch.index !== undefined) {
    const assignStart =
      halfHeightMatch.index +
      halfHeightMatch[0].indexOf(halfHeightMatch[2] + '=Math.floor(');
    const assignEnd = halfHeightMatch.index + halfHeightMatch[0].length;
    const replacement = `${halfHeightMatch[2]}=${halfHeightMatch[1]}`;

    const newFile =
      file.slice(0, assignStart) + replacement + file.slice(assignEnd);

    showDiff(file, newFile, replacement, assignStart, assignEnd);
    return newFile;
  }

  // CC >= 2.1.152: function computes Math.max(1,Math.floor((rows-CONST)/modeDivisor)).
  // Keep the small subtraction for prompt chrome, but remove the mode divisor cap.
  const modeDivisorPattern =
    /Math\.max\(1,Math\.floor\(\(([\w$]+)-([\w$]+)\)\/([\w$]+)\)\)/g;
  let modeDivisorMatch: RegExpExecArray | null;

  while ((modeDivisorMatch = modeDivisorPattern.exec(file)) !== null) {
    const nearbyStart = Math.max(0, modeDivisorMatch.index - 250);
    const nearby = file.slice(nearbyStart, modeDivisorMatch.index);
    if (!nearby.includes('"expanded"?3') || !nearby.includes('"compact"?1:2')) {
      continue;
    }

    const startIndex = modeDivisorMatch.index;
    const endIndex = modeDivisorMatch.index + modeDivisorMatch[0].length;
    const replacement = `Math.max(1,${modeDivisorMatch[1]}-${modeDivisorMatch[2]})`;
    const newFile =
      file.slice(0, startIndex) + replacement + file.slice(endIndex);

    showDiff(file, newFile, replacement, startIndex, endIndex);
    return newFile;
  }

  return null;
};

/**
 * Patch Commands.tsx visibleCount formula.
 *
 * Original: Math.max(1,Math.floor((maxHeight-10)/2))
 * Patched:  Math.max(1,maxHeight-3)
 *
 * The original divides by 2 again, severely limiting visible items.
 */
const patchCommandsVisibleCount = (file: string): string | null => {
  const pattern = /Math\.max\(1,Math\.floor\(\(([\w$]+)-10\)\/2\)\)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    return null;
  }

  const maxHeightVar = match[1];
  const replacement = `Math.max(1,${maxHeightVar}-3)`;

  const newFile =
    file.slice(0, match.index) +
    replacement +
    file.slice(match.index + match[0].length);

  showDiff(
    file,
    newFile,
    replacement,
    match.index,
    match.index + match[0].length
  );

  return newFile;
};

/**
 * Patch the slash command autocomplete suggestions cap.
 *
 * Original: Math.min(6, Math.max(1, rows - 3))
 * Patched:  Math.max(1, rows - 3)
 *
 * The Math.min(6,...) hardcaps visible suggestions to 6.
 */
const patchSuggestionsCap = (file: string): string | null => {
  const pattern = /Math\.min\(6,Math\.max\(1,([\w$]+)-3\)\)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    return null;
  }

  const rowsVar = match[1];
  const replacement = `Math.max(1,${rowsVar}-3)`;

  const newFile =
    file.slice(0, match.index) +
    replacement +
    file.slice(match.index + match[0].length);

  showDiff(
    file,
    newFile,
    replacement,
    match.index,
    match.index + match[0].length
  );

  return newFile;
};

export const writeShowMoreItemsInSelectMenus = (
  oldFile: string,
  numberOfItems: number
): string | null => {
  const locations = getShowMoreItemsInSelectMenusLocation(oldFile);
  if (locations.length === 0) {
    console.error(
      'patch: writeShowMoreItemsInSelectMenus: failed to find locations'
    );
    return null;
  }

  // Sort locations by start index in descending order to apply from end to beginning
  const sortedLocations = locations.sort((a, b) => b.startIndex - a.startIndex);

  let newFile = oldFile;
  for (const location of sortedLocations) {
    const newContent = numberOfItems.toString();
    const updatedFile =
      newFile.slice(0, location.startIndex) +
      newContent +
      newFile.slice(location.endIndex);

    showDiff(
      newFile,
      updatedFile,
      newContent,
      location.startIndex,
      location.endIndex
    );
    newFile = updatedFile;
  }

  // Also patch the help/command menu height cap (rows/2 → rows)
  const heightPatched = patchHelpMenuHeight(newFile);
  if (heightPatched) {
    newFile = heightPatched;
  } else {
    console.error(
      'patch: writeShowMoreItemsInSelectMenus: failed to find help menu height pattern'
    );
  }

  // Also patch the visibleCount formula in Commands.tsx
  // Math.max(1,Math.floor((maxHeight-10)/2)) → Math.max(1,maxHeight-3)
  // The /2 halves the already-limited height again unnecessarily
  const visibleCountPatched = patchCommandsVisibleCount(newFile);
  if (visibleCountPatched) {
    newFile = visibleCountPatched;
  } else {
    console.error(
      'patch: writeShowMoreItemsInSelectMenus: failed to find visibleCount pattern'
    );
  }

  // Also patch the slash command autocomplete suggestions cap when present.
  // Math.min(6,Math.max(1,rows-3)) → Math.max(1,rows-3)
  // CC 2.1.138 removed this obsolete non-overlay fallback, so absence is OK.
  const suggestionsPatched = patchSuggestionsCap(newFile);
  if (suggestionsPatched) {
    newFile = suggestionsPatched;
  }

  return newFile;
};
