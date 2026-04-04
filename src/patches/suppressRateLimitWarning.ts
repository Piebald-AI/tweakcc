import { debug } from '../utils';
import { showDiff } from './index';

export const writeSuppressRateLimitWarning = (
  oldFile: string
): string | null => {
  const alreadyPatched =
    /[,;{}]if\(([$\w]+)&&\1\.severity==="warning"\)return null;/;
  if (alreadyPatched.test(oldFile)) return oldFile;

  const pattern =
    /[,;{}]if\(([$\w]+)&&\1\.severity==="warning"\)return \1\.message;/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    debug(
      'patch: suppressRateLimitWarning: failed to find rate limit warning getter pattern'
    );
    return null;
  }

  const varName = match[1];
  const original = match[0];
  const delimiter = original[0];
  const replacement = `${delimiter}if(${varName}&&${varName}.severity==="warning")return null;`;
  const startIndex = match.index;
  const endIndex = startIndex + original.length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};
