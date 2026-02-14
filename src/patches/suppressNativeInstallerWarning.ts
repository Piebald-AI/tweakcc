import { showDiff } from './index';
import { warn } from '../utils';

export const writeSuppressNativeInstallerWarning = (
  file: string
): string | null => {
  const pattern =
    /Claude Code has switched from npm to native installer\. Run `claude install` or see https:\/\/docs\.anthropic\.com\/en\/docs\/claude-code\/getting-started for more options\./;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    warn('patch: suppressNativeInstallerWarning: failed to find pattern');
    return null;
  }

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile = file.slice(0, startIndex) + file.slice(endIndex);

  showDiff(file, newFile, '', startIndex, endIndex);

  return newFile;
};
