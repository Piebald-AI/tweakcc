// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getThinkerVerbsLocation = (oldFile: string): LocationResult | null => {
  // This finds the following patterns:
  // NEW FORMAT (2.0.77+, npm & native):
  //   DE2=["Accomplishing","Actioning",...]  (npm)
  //   jrI=["Accomplishing","Actioning",...]  (native)
  // OLD FORMAT:
  //   kW8 = {words: ["Actualizing", "Baking", ...]}
  //
  // To write, we just do `{varname} = {JSON.stringify(verbs)}`.

  // Performance note: putting boundary at beginning speeds it up
  // from ~1.5s to ~80ms.  Explicit ',' or ';' brings it down to ~30ms.

  // Try new format first (plain array) - works for both npm & native
  const newVerbsPattern =
    /[,;]([$\w]+)=\[(?:"[^"{}()]+ing",)+"[^"{}()]+ing"\]/s;

  const newVerbsMatch = oldFile.match(newVerbsPattern);
  if (newVerbsMatch && newVerbsMatch.index != undefined) {
    return {
      // +1 because of the ',' or ';' at the beginning that we matched.
      startIndex: newVerbsMatch.index + 1,
      endIndex: newVerbsMatch.index + newVerbsMatch[0].length,
      identifiers: [newVerbsMatch[1]],
    };
  }

  // Fall back to old format (object with words property)
  const oldVerbsPattern =
    /[, ]([$\w]+)=\{words:\[(?:"[^"{}()]+ing",)+"[^"{}()]+ing"\]\}/s;

  const oldVerbsMatch = oldFile.match(oldVerbsPattern);
  if (oldVerbsMatch && oldVerbsMatch.index != undefined) {
    return {
      // +1 because of the ',' or ' ' at the beginning that we matched.
      startIndex: oldVerbsMatch.index + 1,
      endIndex: oldVerbsMatch.index + oldVerbsMatch[0].length,
      identifiers: [oldVerbsMatch[1], 'old_format'],
    };
  }

  console.error('patch: thinker verbs: failed to find verbsMatch');
  return null;
};

const getThinkerVerbsUseLocation = (oldFile: string): LocationResult | null => {
  // This is brittle but it's easy.
  // It's a function that returns either new verbs from Statsig (a/b testing) or the default verbs.
  // When we write the file we'll just write a new function.
  const pattern =
    /function ([$\w]+)\(\)\{return [$\w]+\("tengu_spinner_words",[$\w]+\)\.words\}/;
  const match = oldFile.match(pattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker verbs: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1]],
  };
};

export const writeThinkerVerbs = (
  oldFile: string,
  verbs: string[]
): string | null => {
  const location1 = getThinkerVerbsLocation(oldFile);
  if (!location1) {
    return null;
  }
  const verbsLocation = location1;
  const varName = verbsLocation.identifiers?.[0];
  const isOldFormat = verbsLocation.identifiers?.[1] === 'old_format';

  // For new format: just a plain array; for old format: object with words property
  const verbsJson = isOldFormat
    ? `${varName}=${JSON.stringify({ words: verbs })}`
    : `${varName}=${JSON.stringify(verbs)}`;

  const newFile1 =
    oldFile.slice(0, verbsLocation.startIndex) +
    verbsJson +
    oldFile.slice(verbsLocation.endIndex);

  showDiff(
    oldFile,
    newFile1,
    verbsJson,
    verbsLocation.startIndex,
    verbsLocation.endIndex
  );

  // Update the function that returns the spinner verbs to always return the hard-coded verbs
  // and not use any Statsig ones. That also prevents `undefined...` from showing up in the UI.
  // Note: This step is only needed for old format; new format uses the array directly.
  if (isOldFormat) {
    const location2 = getThinkerVerbsUseLocation(newFile1);
    if (!location2) {
      return null;
    }
    const useLocation = location2;
    const funcName = useLocation.identifiers?.[0];

    const newFn = `function ${funcName}(){return ${varName}.words}`;
    const newFile2 =
      newFile1.slice(0, useLocation.startIndex) +
      newFn +
      newFile1.slice(useLocation.endIndex);

    showDiff(
      newFile1,
      newFile2,
      newFn,
      useLocation.startIndex,
      useLocation.endIndex
    );

    return newFile2;
  }

  return newFile1;
};
