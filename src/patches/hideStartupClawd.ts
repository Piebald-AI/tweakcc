// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Find all Clawd component function body start indices.
 *
 * Steps:
 * 1. Find ALL occurrences of '▛███▜' (the Clawd ASCII art header)
 * 2. For each occurrence:
 *    a. Get 2000 chars previous
 *    b. Find the LAST /function [$\w]+\(\)\{/ in that subsection
 *    c. Get the index after the `{`
 *    d. Add that to a list of indices
 * 3. Return all gotten indices
 */
const findStartupClawdComponents = (oldFile: string): number[] => {
  const indices: number[] = [];

  // The Clawd ASCII art header - these are special unicode characters
  const clawdPattern = '▛███▜';

  let searchPos = 0;
  while (true) {
    const clawdIndex = oldFile.indexOf(clawdPattern, searchPos);
    if (clawdIndex === -1) {
      break;
    }

    // Get 2000 chars before this occurrence
    const lookbackStart = Math.max(0, clawdIndex - 2000);
    const beforeText = oldFile.slice(lookbackStart, clawdIndex);

    // Find the LAST occurrence of /function [$\w]+\(\)\{/ in that subsection
    const functionPattern = /function [$\w]+\(\)\{/g;
    let lastFunctionMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;

    while ((match = functionPattern.exec(beforeText)) !== null) {
      lastFunctionMatch = match;
    }

    if (lastFunctionMatch) {
      // Calculate the absolute index after the `{`
      const absoluteIndex =
        lookbackStart + lastFunctionMatch.index + lastFunctionMatch[0].length;
      indices.push(absoluteIndex);
    } else {
      console.error(
        `patch: hideStartupClawd: failed to find function pattern before Clawd at position ${clawdIndex}`
      );
    }

    // Move to search after this occurrence
    searchPos = clawdIndex + clawdPattern.length;
  }

  return indices;
};

export const writeHideStartupClawd = (oldFile: string): string | null => {
  const indices = findStartupClawdComponents(oldFile);

  if (indices.length === 0) {
    console.error('patch: hideStartupClawd: no Clawd components found');
    return null;
  }

  // Sort indices in REVERSE order so we can insert without affecting earlier positions
  const sortedIndices = [...indices].sort((a, b) => b - a);

  const insertCode = 'return null;';
  let newFile = oldFile;

  // Loop over indices in reverse order and insert `return null;` at each
  for (const index of sortedIndices) {
    newFile = newFile.slice(0, index) + insertCode + newFile.slice(index);
  }

  // Show diff for the first insertion (for debugging)
  if (sortedIndices.length > 0) {
    const lastIndex = sortedIndices[sortedIndices.length - 1]; // First in original order
    showDiff(oldFile, newFile, insertCode, lastIndex, lastIndex);
  }

  return newFile;
};
