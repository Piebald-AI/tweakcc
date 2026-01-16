// Please see the note about writing patches in ./index

import {
  LocationResult,
  findBoxComponent,
  findTextComponent,
  getReactVar,
  showDiff,
} from './index';

/**
 * Finds the location of the "∴ Thinking…" createElement call to style it.
 *
 * Steps:
 * 1. Find "∴ Thinking…" string
 * 2. Within 200 chars, find createElement(X,null,Y) pattern
 */
const findThinkingLabelLocation = (oldFile: string): LocationResult | null => {
  // Step 1: Find the "∴ Thinking…" anchor string
  const thinkingAnchor = '∴ Thinking…';
  const anchorIndex = oldFile.indexOf(thinkingAnchor);

  if (anchorIndex === -1) {
    console.error('patch: thinkingLabel: failed to find "∴ Thinking…" anchor');
    return null;
  }

  // Step 2: Search within 200 characters after the anchor
  const searchStart = anchorIndex;
  const searchEnd = Math.min(anchorIndex + 200, oldFile.length);
  const searchSection = oldFile.slice(searchStart, searchEnd);

  // Pattern: (reactVar).createElement(X,null,(thinkingTextVar))
  // We need to capture the whole expression and the react var + thinking text var
  const createElementPattern =
    /([$\w]+(?:\.default)?)\.createElement\(([$\w]+),null,([$\w]+)\)/;
  const match = searchSection.match(createElementPattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: thinkingLabel: failed to find createElement pattern within 200 chars of anchor'
    );
    return null;
  }

  return {
    startIndex: searchStart + match.index,
    endIndex: searchStart + match.index + match[0].length,
    identifiers: [match[1], match[2], match[3]], // [reactVar, component, thinkingTextVar]
  };
};

/**
 * Wraps the thinking label in styled Text component with italic and dimColor.
 */
export const writeThinkingLabel = (oldFile: string): string | null => {
  const location = findThinkingLabelLocation(oldFile);
  if (!location) {
    return null;
  }

  // Get Box and Text components from utilities
  const boxVar = findBoxComponent(oldFile);
  if (!boxVar) {
    console.error('patch: thinkingLabel: failed to find Box component');
    return null;
  }

  const textVar = findTextComponent(oldFile);
  if (!textVar) {
    console.error('patch: thinkingLabel: failed to find Text component');
    return null;
  }

  const reactVar = getReactVar(oldFile);
  if (!reactVar) {
    console.error('patch: thinkingLabel: failed to find React variable');
    return null;
  }

  const thinkingTextVar = location.identifiers![2];

  // Build the replacement:
  // ${reactVar}.createElement(${boxVar}, null, ${reactVar}.createElement(${textVar}, {italic:true,dimColor:true}, ${thinkingTextVar}))
  const replacement = `${reactVar}.createElement(${boxVar},null,${reactVar}.createElement(${textVar},{italic:true,dimColor:true},${thinkingTextVar}))`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    replacement +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    replacement,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};
