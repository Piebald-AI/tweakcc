// Please see the note about writing patches in ./index
//
// Fix keybinding dispatch for immediate/local-jsx commands
//
// When a keybinding triggers a `command:` action (e.g., `command:copy`),
// the submit callback gates the fast path behind `queryGuard.isActive`,
// which is only true during an active model query. At idle, the command
// falls through to the full query pipeline ("Sprouting..." delay).
//
// Before (minified):
//   Ez = y4.isActive && (M7?.immediate || b6?.fromKeybinding);
//
// After:
//   Ez = M7?.immediate || b6?.fromKeybinding;

import { showDiff } from './index';
import { debug } from '../utils';

export const writeKeybindingImmediateCommands = (
  oldFile: string
): string | null => {
  const pattern =
    /([$\w]+)=([$\w]+)\.isActive&&\(([$\w]+)\?\.immediate\|\|([$\w]+)\?\.fromKeybinding\)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    debug(
      'patch: keybindingImmediateCommands: failed to find queryGuard.isActive && immediate/fromKeybinding pattern'
    );
    return null;
  }

  const [fullMatch, resultVar, , commandVar, optionsVar] = match;

  const patchedPattern =
    /[$\w]+=[$\w]+\?\.immediate\|\|[$\w]+\?\.fromKeybinding/;
  const alreadyPatched = oldFile.match(patchedPattern);
  if (alreadyPatched && !alreadyPatched[0].includes('.isActive')) {
    return oldFile;
  }

  const replacement = `${resultVar}=${commandVar}?.immediate||${optionsVar}?.fromKeybinding`;

  const startIndex = match.index;
  const endIndex = startIndex + fullMatch.length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
