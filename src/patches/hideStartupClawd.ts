// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Find the Clawd wrapper component function body start index.
 *
 * The Clawd rendering has two layers:
 * - Inner component (e.g., MKz): renders Apple_Terminal Clawd
 * - Wrapper component (e.g., cE6): renders MKz on Apple or ASCII art otherwise
 *
 * We target the WRAPPER to avoid layout issues from nulling just the inner.
 *
 * Steps:
 * 1. Find the inner component by looking for '▛███▜' (Clawd ASCII art)
 * 2. Trace back to find the inner function name
 * 3. Find the wrapper function that createElement's the inner component
 * 4. Return the wrapper function body start index
 */
const findStartupClawdComponents = (oldFile: string): number[] => {
  const indices: number[] = [];

  const clawdPattern = /▛███▜|\\u259B\\u2588\\u2588\\u2588\\u259C/gi;

  // Find the inner component function name
  const clawdMatch = clawdPattern.exec(oldFile);
  if (!clawdMatch) return indices;

  const clawdIndex = clawdMatch.index;
  const lookbackStart = Math.max(0, clawdIndex - 2000);
  const beforeText = oldFile.slice(lookbackStart, clawdIndex);

  const functionPattern = /function ([$\w]+)\([^)]*\)\{/g;
  let lastFunctionMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = functionPattern.exec(beforeText)) !== null) {
    lastFunctionMatch = match;
  }

  if (!lastFunctionMatch) {
    console.error(
      `patch: hideStartupClawd: failed to find inner Clawd function`
    );
    return indices;
  }

  const innerFuncName = lastFunctionMatch[1];

  // Find the wrapper function that directly createElement's the inner component.
  // Iterate all functions and find one where createElement(INNER,) appears
  // before any nested function definition.
  const wrapperFuncPattern = /function ([$\w]+)\([^)]*\)\{/g;
  let wrapperExec: RegExpExecArray | null;
  let wrapperMatch: { index: number; length: number } | null = null;
  while ((wrapperExec = wrapperFuncPattern.exec(oldFile)) !== null) {
    const bodyStart = wrapperExec.index + wrapperExec[0].length;
    const body = oldFile.slice(bodyStart, bodyStart + 500);
    const elemIdx = body.indexOf(`createElement(${innerFuncName},`);
    if (elemIdx === -1) continue;
    const nextFuncIdx = body.indexOf('function ');
    if (nextFuncIdx !== -1 && nextFuncIdx < elemIdx) continue;
    wrapperMatch = { index: wrapperExec.index, length: wrapperExec[0].length };
    break;
  }

  if (wrapperMatch) {
    const absoluteIndex = wrapperMatch.index + wrapperMatch.length;
    indices.push(absoluteIndex);
  } else {
    // Fallback: target the inner function directly (old behavior)
    const absoluteIndex =
      lookbackStart + lastFunctionMatch.index + lastFunctionMatch[0].length;
    indices.push(absoluteIndex);
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
