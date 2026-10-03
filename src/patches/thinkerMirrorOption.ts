// Please see the note about writing patches in ./index

import { showDiff } from './index';

// `=[...X,...[...X].reverse()]` (older) or `=[...X,...X.toReversed()]`
// (CC 2.1.2xx, which also keeps one mirrored copy per terminal-specific
// frame set, e.g. a Ghostty variant and a default variant).
const mirrorPattern =
  /=\s*\[\.\.\.([$\w]+),\s*\.\.\.?(?:\[\.\.\.\1\]\.reverse\(\)|\1\.toReversed\(\))\]/g;

export const writeThinkerSymbolMirrorOption = (
  oldFile: string,
  enableMirror: boolean
): string | null => {
  const matches = [...oldFile.matchAll(mirrorPattern)];
  if (matches.length === 0) {
    console.error('patch: thinker symbol mirror option: failed to find match');
    return null;
  }

  let newFile = oldFile;
  for (const match of matches.reverse()) {
    const varName = match[1];
    const newArray = enableMirror
      ? `=[...${varName},...[...${varName}].reverse()]`
      : `=[...${varName}]`;
    const start = match.index!;
    const end = start + match[0].length;
    const before = newFile;
    newFile = newFile.slice(0, start) + newArray + newFile.slice(end);
    showDiff(before, newFile, newArray, start, end);
  }
  return newFile;
};
