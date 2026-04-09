// Please see the note about writing patches in ./index

import { showDiff } from './index';

export const writeSuppressRateLimitOptions = (
  oldFile: string
): string | null => {
  // CC ≥2.1.97: shorter prefix to avoid match failure from wide .createElement prefix
  const pattern =
    /showAllInTranscript:[$\w]+,agentDefinitions:[$\w]+,onOpenRateLimitOptions:([$\w]+)/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: suppressRateLimitOptions: failed to find onOpenRateLimitOptions pattern'
    );
    return null;
  }

  const callbackVar = match[1];
  const callbackStart = match.index + match[0].length - callbackVar.length;
  const callbackEnd = callbackStart + callbackVar.length;

  const newCode = '()=>{}';
  const newFile =
    oldFile.slice(0, callbackStart) + newCode + oldFile.slice(callbackEnd);

  showDiff(oldFile, newFile, newCode, callbackStart, callbackEnd);
  return newFile;
};
