import { showDiff } from './index';
import { debug } from '../utils';

export const writeKeybindingCustomization = (
  oldFile: string
): string | null => {
  const alreadyPatched =
    /function [$\w]+\(\)\{return !0;return [$\w]+\("tengu_keybinding_customization_release"/;

  if (alreadyPatched.test(oldFile)) {
    debug('patch: keybindingCustomization: already patched');
    return oldFile;
  }

  const pattern =
    /function [$\w]+\(\)\{return [$\w]+\("tengu_keybinding_customization_release"/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    debug(
      'patch: keybindingCustomization: failed to find keybinding customization gate pattern'
    );
    return null;
  }

  const insertIndex = match.index + match[0].indexOf('{') + 1;
  const insertion = 'return !0;';

  const newFile =
    oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);

  showDiff(oldFile, newFile, insertion, insertIndex, insertIndex);

  return newFile;
};
