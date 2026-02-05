// Please see the note about writing patches in ./index

import { showDiff } from './index';

export const writeSuppressRateLimitOptions = (
  oldFile: string
): string | null => {
  const pattern =
    /\.createElement.{0,500},showAllInTranscript:[$\w]+,agentDefinitions:[$\w]+,onOpenRateLimitOptions:([$\w]+)/;

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
