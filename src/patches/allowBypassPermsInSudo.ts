// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patch the sudo permissions check to allow bypassing permissions with --dangerously-skip-permissions, even when running with root/sudo privileges.
 */
export const writeAllowBypassPermsInSudo = (file: string): string | null => {
  // Find pattern in minified code
  const pattern =
    /console\.error\("--dangerously-skip-permissions cannot be used with root\/sudo privileges for security reasons"\),process\.exit\(1\)/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: allowBypassPermsInSudo: failed to find pattern'
    );
    return null;
  }

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  // Replace the matched code with an empty block to fix syntax errors
  const newFile = file.slice(0, startIndex) + '{}' + file.slice(endIndex);

  showDiff(file, newFile, `{}`, startIndex, endIndex);

  return newFile;
};
