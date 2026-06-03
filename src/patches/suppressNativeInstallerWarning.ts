import { showDiff } from './index';

const WARNING_PATTERNS = [
  /Claude Code has switched from npm to native installer\. Run `claude install` or see https:\/\/docs\.anthropic\.com\/en\/docs\/claude-code\/getting-started for more options\./g,
  /installMethod is native, but directory [^"'`\n;]+/g,
  /installMethod is native, but claude command (?:is missing or invalid|not found) at [^"'`\n;]+/g,
  /Native installation exists but ~\/\.local\/bin is not in your PATH(?:\. Run: echo 'export PATH="\$HOME\/\.local\/bin:\$PATH"' >> [^"'`\n;]+ then open a new terminal or run: source [^"'`\n;]+)?/g,
  /Run: echo 'export PATH="\$HOME\/\.local\/bin:\$PATH"' >> [^"'`\n;]+ then open a new terminal or run: source [^"'`\n;]+/g,
];

export const writeSuppressNativeInstallerWarning = (
  file: string
): string | null => {
  let newFile = file;
  let changed = false;
  let firstStart = -1;
  let firstEnd = -1;

  for (const pattern of WARNING_PATTERNS) {
    newFile = newFile.replace(pattern, (match, offset: number) => {
      if (!changed) {
        firstStart = offset;
        firstEnd = offset + match.length;
      }
      changed = true;
      return '';
    });
  }

  if (!changed) {
    console.warn(
      'patch: suppressNativeInstallerWarning: failed to find pattern'
    );
    return null;
  }

  showDiff(file, newFile, '', firstStart, firstEnd);

  return newFile;
};
