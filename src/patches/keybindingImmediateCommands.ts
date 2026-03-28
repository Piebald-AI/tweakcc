import { showDiff } from './index';
import { debug } from '../utils';

export const writeKeybindingImmediateCommands = (
  oldFile: string
): string | null => {
  const pattern =
    /([,;{}])([$\w]+)=([$\w]+)\.isActive&&\(([$\w]+)\?\.immediate\|\|([$\w]+)\?\.fromKeybinding\)/;

  const alreadyPatchedPattern =
    /[,;{}][$\w]+=[$\w]+\?\.immediate\|\|[$\w]+\?\.fromKeybinding/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    if (alreadyPatchedPattern.test(oldFile)) {
      return oldFile;
    }
    debug(
      'patch: keybindingImmediateCommands: failed to find queryGuard.isActive && immediate/fromKeybinding pattern'
    );
    return null;
  }

  const [fullMatch, delimiter, resultVar, , commandVar, optionsVar] = match;

  const replacement = `${delimiter}${resultVar}=${commandVar}?.immediate||${optionsVar}?.fromKeybinding`;

  const startIndex = match.index;
  const endIndex = startIndex + fullMatch.length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
