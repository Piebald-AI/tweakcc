// Please see the note about writing patches in ./index

import { showDiff } from './index';

export const writeSuppressRateLimitOptions = (
  oldFile: string
): string | null => {
  const patterns = [
    /showAllInTranscript:[$\w]+,(?:agentDefinitions:[$\w]+,)?onOpenRateLimitOptions:([$\w]+)/g,
    // CC 2.1.2xx: the message list reads the opener from a context object:
    //   onOpenRateLimitOptions:R?.openRateLimitOptions
    /onOpenRateLimitOptions:([$\w]+\??\.openRateLimitOptions)(?=[,}])/g,
  ];

  let newFile = oldFile;
  let replacements = 0;

  for (const pattern of patterns) {
    const matches = [...newFile.matchAll(pattern)];
    for (const match of matches.reverse()) {
      if (match.index === undefined) continue;

      const callbackVar = match[1];
      const callbackStart = match.index + match[0].length - callbackVar.length;
      const callbackEnd = callbackStart + callbackVar.length;
      const newCode = '()=>{}';

      const updatedFile =
        newFile.slice(0, callbackStart) + newCode + newFile.slice(callbackEnd);

      showDiff(newFile, updatedFile, newCode, callbackStart, callbackEnd);
      newFile = updatedFile;
      replacements++;
    }
  }

  if (replacements === 0) {
    console.error(
      'patch: suppressRateLimitOptions: failed to find onOpenRateLimitOptions pattern'
    );
    return null;
  }

  return newFile;
};
