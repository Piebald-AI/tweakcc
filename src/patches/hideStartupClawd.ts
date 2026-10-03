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
 * 3. Find the wrapper function that renders the inner component
 * 4. Return the wrapper function body start index
 */
const findStartupClawdComponents = (oldFile: string): number[] => {
  const indices: number[] = [];

  // CC 2.1.2xx: Clawd is one pose-aware component that already returns null
  // in some modes (so nulling it is layout-safe) and picks the Apple Terminal
  // variant itself:
  //   function Qee(g){…let{pose:b}=d,…;if($t()){return null}if(a.terminal==="Apple_Terminal"){…}
  // CC 2.1.285 destructures more props and moved the terminal check into a
  // helper defined before the component:
  //   function wpe(o){…let{pose:c,color:l,paint:m}=t,…;if(St()){return null}if(Uqt(p)){…
  // The window must not cross into another function, or a small helper that
  // precedes the component (e.g. `function Uqt(o){…}`) would be matched.
  const poseComponentPattern =
    /function [$\w]+\([$\w]+\)\{(?=(?:(?!function )[^]){0,400}?\{pose:[$\w]+(?:,[$\w]+:[$\w]+)*\}=[$\w]+(?:(?!function )[^]){0,300}?(?:==="Apple_Terminal"|\{return null\}))(?=[^]{0,2200}?"clawd_body")/;
  const poseMatch = oldFile.match(poseComponentPattern);
  if (poseMatch && poseMatch.index !== undefined) {
    indices.push(poseMatch.index + poseMatch[0].length);
    return indices;
  }

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

  // Find the wrapper function that directly renders the inner component.
  // Iterate all functions and find one where the inner component is rendered
  // before any nested function definition. CC 2.1.195+ renders it via the JSX
  // automatic runtime (`X.jsx(INNER,…)`) rather than `createElement(INNER,…)`,
  // so accept either shape (innerFuncName may contain `$`, so escape it).
  const wrapperFuncPattern = /function ([$\w]+)\([^)]*\)\{/g;
  const innerCallPattern = new RegExp(
    `(?:createElement|jsxs?)\\(${innerFuncName.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )},`
  );
  let wrapperExec: RegExpExecArray | null;
  let wrapperMatch: { index: number; length: number } | null = null;
  while ((wrapperExec = wrapperFuncPattern.exec(oldFile)) !== null) {
    const bodyStart = wrapperExec.index + wrapperExec[0].length;
    const body = oldFile.slice(bodyStart, bodyStart + 500);
    const innerCallMatch = innerCallPattern.exec(body);
    if (!innerCallMatch) continue;
    const elemIdx = innerCallMatch.index;
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
