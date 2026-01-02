// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index';

const getThinkerVerbsLocation = (oldFile: string): LocationResult | null => {
  // This finds the folowing pattern:
  // ```js
  // kW8 = {
  //   words: [
  //     "Actualizing",
  //     "Baking"
  //   ]
  // }
  // ```
  // To write, we just do `{varname} = {JSON.stringify({words: verbs})}`.

  // Performance note: putting \b at the beginning, before the variable name speeds it up
  // from ~1.5s to ~80ms.  Explicitly search for ',' or ' ' brings it down to ~30ms.
  const verbsPattern =
    /[, ]([$\w]+)=\{words:\[(?:"[^"{}()]+ing",)+"[^"{}()]+ing"\]\}/s;

  const verbsMatch = oldFile.match(verbsPattern);
  if (!verbsMatch || verbsMatch.index == undefined) {
    console.error('patch: thinker verbs: failed to find verbsMatch');
    return null;
  }

  return {
    // +1 because of the ',' or ' ' at the beginning that we matched.
    startIndex: verbsMatch.index + 1,
    endIndex: verbsMatch.index + verbsMatch[0].length,
    identifiers: [verbsMatch[1]],
  };
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

  const verbsJson = `${varName}=${JSON.stringify({ words: verbs })}`;
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

  // Update the the function that returns the spinner verbs to always return the hard-coded verbs
  // and not use any Statsig ones.  That also prevents `undefined...` from showing up in the UI.
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
};
