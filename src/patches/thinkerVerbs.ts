// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getThinkerVerbsLocation = (oldFile: string): LocationResult | null => {
  // v2.1.2+ format: varName=["Accomplishing","Actioning","Actualizing",...]
  // Direct array assignment without {words:...} wrapper
  const newVerbsPattern =
    /[;{]([$\w]+)=\["Accomplishing","Actioning","Actualizing"[^\]]*\]/;

  const newVerbsMatch = oldFile.match(newVerbsPattern);
  if (newVerbsMatch && newVerbsMatch.index !== undefined) {
    return {
      startIndex: newVerbsMatch.index + 1, // +1 to skip the ; or {
      endIndex: newVerbsMatch.index + newVerbsMatch[0].length,
      identifiers: [newVerbsMatch[1], 'new'], // 'new' marks the new format
    };
  }

  // Legacy format: varName={words:["Actualizing","Baking",...]}
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
    identifiers: [verbsMatch[1], 'legacy'],
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
  const formatType = verbsLocation.identifiers?.[1]; // 'new' or 'legacy'

  // For new format (v2.1.2+), write direct array
  // For legacy format, write {words: [...]}
  const verbsJson =
    formatType === 'new'
      ? `${varName}=${JSON.stringify(verbs)}`
      : `${varName}=${JSON.stringify({ words: verbs })}`;

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

  // For new format (v2.1.2+), the statsig function doesn't exist, so we're done
  if (formatType === 'new') {
    return newFile1;
  }

  // For legacy format: Update the function that returns the spinner verbs
  // to always return the hard-coded verbs and not use any Statsig ones.
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
