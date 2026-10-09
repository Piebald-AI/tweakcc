import { showDiff } from './index';

// CC's WebFetch tool (and the `getWebFetchUserAgent` export) builds its
// User-Agent in one place:
//   function Fyo(){return`Claude-User (${zo()}; +https://support.anthropic.com/)`}
const WEBFETCH_UA_PATTERN =
  /(function [$\w]+\(\)\{return)`Claude-User \(\$\{[$\w]+\(\)\}; \+https:\/\/support\.anthropic\.com\/\)`\}/;

export const writeWebFetchUserAgent = (
  oldFile: string,
  userAgent: string
): string | null => {
  const match = oldFile.match(WEBFETCH_UA_PATTERN);
  if (!match || match.index === undefined) {
    console.error('patch: webFetchUserAgent: failed to find WebFetch UA');
    return null;
  }

  const replacement = `${match[1]} ${JSON.stringify(userAgent)}}`;
  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};
