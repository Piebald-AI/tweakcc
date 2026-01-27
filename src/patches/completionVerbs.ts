// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getCompletionVerbsLocation = (oldFile: string): LocationResult | null => {
  // This finds the past-tense verbs array shown after thinking completes
  // Pattern: z_2=["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Sautéed","Worked"]
  // The verbs end with "ed" (past tense) instead of "ing" (present participle)

  // Performance note: putting boundary at beginning speeds up matching significantly
  const completionVerbsPattern =
    /[,;]([$\w]+)=\[(?:"[^"]+"(?:,"[^"]+")*)?]/;

  const match = oldFile.match(completionVerbsPattern);
  if (match && match.index !== undefined) {
    return {
      // +1 because of the ',' or ';' at the beginning that we matched.
      startIndex: match.index + 1,
      endIndex: match.index + match[0].length,
      identifiers: [match[1]],
    };
  }

  console.error('patch: completion verbs: failed to find completionVerbsMatch');
  return null;
};

export const writeCompletionVerbs = (
  oldFile: string,
  verbs: string[]
): string | null => {
  const location = getCompletionVerbsLocation(oldFile);
  if (!location) {
    return null;
  }

  const varName = location.identifiers?.[0];
  const verbsJson = `${varName}=${JSON.stringify(verbs)}`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    verbsJson +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    verbsJson,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};

