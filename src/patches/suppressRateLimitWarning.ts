import { debug } from '../utils';
import { showDiff } from './index';

export const writeSuppressRateLimitWarning = (
  oldFile: string
): string | null => {
  const alreadyPatched = /\.severity\s*===\s*"warning"\)\s*return null;/;
  if (alreadyPatched.test(oldFile)) return oldFile;

  const pattern = /\.severity\s*===\s*"warning"\)\s*return ([$\w]+)\.message;/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    debug(
      'patch: suppressRateLimitWarning: failed to find rate limit warning getter pattern'
    );
    return null;
  }

  const original = match[0];
  const replacement = original.replace(
    /return ([$\w]+)\.message;/,
    'return null;'
  );
  const startIndex = match.index;
  const endIndex = startIndex + original.length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};
