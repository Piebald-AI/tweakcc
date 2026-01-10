// Please see the note about writing patches in ./index

import { showDiff } from './index';

export const writeSuppressRateLimitOptions = (
  oldFile: string
): string | null => {
  // Find all occurrences of: agentDefinitions:someVar,onOpenRateLimitOptions:someVar
  const pattern = /agentDefinitions:[$\w]+,onOpenRateLimitOptions:([$\w]+)/g;

  let content = oldFile;
  let match;

  // Reset regex state
  pattern.lastIndex = 0;

  // Find all matches first
  const matches: { index: number; fullMatch: string; callbackVar: string }[] =
    [];
  while ((match = pattern.exec(oldFile)) !== null) {
    matches.push({
      index: match.index,
      fullMatch: match[0],
      callbackVar: match[1],
    });
  }

  if (matches.length === 0) {
    console.error(
      'patch: suppressRateLimitOptions: failed to find onOpenRateLimitOptions pattern'
    );
    return null;
  }

  // Apply replacements in reverse order to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const callbackStart = m.index + m.fullMatch.length - m.callbackVar.length;
    const callbackEnd = callbackStart + m.callbackVar.length;

    const newCode = '()=>{}';
    const newContent =
      content.slice(0, callbackStart) + newCode + content.slice(callbackEnd);

    showDiff(content, newContent, newCode, callbackStart, callbackEnd);
    content = newContent;
  }

  return content;
};
