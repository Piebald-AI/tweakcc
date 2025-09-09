// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

export function getWelcomeMessageLocation(
  oldFile: string
): LocationResult | null {
  // Pattern: " Welcome to ",q9.createElement(T,{bold:!0},"Claude Code"),"!"
  const pattern =
    /" Welcome to ",[$\w]+\.createElement\([^,]+,\{bold:!0\},"Claude Code"\),"!"/;
  const match = oldFile.match(pattern);

  if (match && match.index !== undefined) {
    const claudeCodeIndex = match[0].indexOf('"Claude Code"');
    if (claudeCodeIndex !== -1) {
      return {
        startIndex: match.index + claudeCodeIndex,
        endIndex: match.index + claudeCodeIndex + '"Claude Code"'.length,
      };
    }
  }

  return null;
}

export function writeWelcomeMessage(
  oldFile: string,
  customText: string
): string | null {
  const location = getWelcomeMessageLocation(oldFile);
  if (!location) {
    console.error('patch: welcome message: failed to find location');
    return null;
  }

  // Simple replacement with the custom text
  const newContent = `"${customText}"`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newContent +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    newContent,
    location.startIndex,
    location.endIndex
  );

  return newFile;
}
