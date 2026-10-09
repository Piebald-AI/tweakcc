// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patch the sudo permissions check to allow bypassing permissions with
 * --dangerously-skip-permissions, even when running with root/sudo privileges.
 *
 * CC 2.1.2xx refuses root in two places, in different modules:
 *
 * 1. the flag validator
 *    `if(Dw.isRootOutsideDeliberateSandbox())console.error("…"),process.exit(1)`
 * 2. session setup, which also records why it exited
 *    `if(…getuid()===0…)console.error("…"),await Az({…,reason:"bypass_root"}),process.exit(1)`
 *
 * Both are replaced with an empty block. Missing the second one leaves the
 * patch looking applied while root is still refused at startup.
 */
const MESSAGE =
  '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons';

const pattern =
  /console\.error\("--dangerously-skip-permissions cannot be used with root\/sudo privileges for security reasons"\)(?:,await [$\w]+\(\{[^{}]*\}\))?,process\.exit\(1\)/g;

export const writeAllowBypassPermsInSudo = (file: string): string | null => {
  const matches = [...file.matchAll(pattern)];

  if (matches.length === 0) {
    if (!file.includes('root/sudo privileges')) {
      return file;
    }
    console.error('patch: allowBypassPermsInSudo: failed to find pattern');
    return null;
  }

  let newFile = file;
  for (const match of matches.reverse()) {
    const startIndex = match.index!;
    const endIndex = startIndex + match[0].length;
    newFile = newFile.slice(0, startIndex) + '{}' + newFile.slice(endIndex);
    showDiff(file, newFile, `{}`, startIndex, endIndex);
  }

  // Any remaining refusal is a form this patch does not know yet.
  if (newFile.includes(`console.error("${MESSAGE}")`)) {
    console.error(
      'patch: allowBypassPermsInSudo: an unrecognised root refusal remains'
    );
    return null;
  }

  return newFile;
};
