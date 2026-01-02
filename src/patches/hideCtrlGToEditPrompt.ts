// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getCtrlGToEditPromptLocation = (
  oldFile: string
): LocationResult | null => {
  // Step 1: Find "ctrl-g to edit prompt in "
  const ctrlGPattern = /ctrl-g to edit prompt in /;
  const ctrlGMatch = oldFile.match(ctrlGPattern);

  if (!ctrlGMatch || ctrlGMatch.index === undefined) {
    console.error(
      'patch: hideCtrlGToEditPrompt: failed to find "ctrl-g to edit prompt in "'
    );
    return null;
  }

  // Step 2: Get the 150 chars before that match
  const searchStart = Math.max(0, ctrlGMatch.index - 150);
  const beforeText = oldFile.slice(searchStart, ctrlGMatch.index);

  // Step 3: Find the LAST occurrence of /:[$\w]+&&([$\w]+)\.createElement/
  const createElementPattern = /:[$\w]+&&([$\w]+)\.createElement/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = createElementPattern.exec(beforeText)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    console.error(
      'patch: hideCtrlGToEditPrompt: failed to find createElement pattern before ctrl-g text'
    );
    return null;
  }

  // Step 4: Extract reactVar
  const reactVar = lastMatch[1];

  // Calculate the absolute position
  const absoluteIndex = searchStart + lastMatch.index;

  // The pattern we're replacing is `:someVar&&reactVar.createElement`
  // We need to replace `:someVar&&` with `:false&&`
  const fullPatternLength = lastMatch[0].length;
  const reactCreateElementPart = `${reactVar}.createElement`;
  const prefixLength = fullPatternLength - reactCreateElementPart.length;

  return {
    startIndex: absoluteIndex,
    endIndex: absoluteIndex + prefixLength,
    identifiers: [reactVar],
  };
};

export const writeHideCtrlGToEditPrompt = (oldFile: string): string | null => {
  const location = getCtrlGToEditPromptLocation(oldFile);
  if (!location) {
    return null;
  }

  const reactVar = location.identifiers?.[0];
  if (!reactVar) {
    console.error('patch: hideCtrlGToEditPrompt: reactVar not captured');
    return null;
  }

  // Replace `:someVar&&` with `:false&&`
  const newCode = ':false&&';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCode +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCode, location.startIndex, location.endIndex);
  return newFile;
};
