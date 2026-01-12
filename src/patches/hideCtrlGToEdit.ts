// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getCtrlGToEditLocation = (oldFile: string): LocationResult | null => {
  // Find: if(X&&Y)p("tengu_external_editor_hint_shown",
  // Replace the condition (X&&Y) with just "false"
  const pattern =
    /if\(([$\w]+&&[$\w]+)\)p\("tengu_external_editor_hint_shown",/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: hideCtrlGToEdit: failed to find tengu_external_editor_hint_shown pattern'
    );
    return null;
  }

  // We captured the condition (e.g., "v&&P") in group 1
  // We want to replace just that condition with "false"
  const condition = match[1];
  const ifOpenParen = match.index + 3; // skip "if("

  return {
    startIndex: ifOpenParen,
    endIndex: ifOpenParen + condition.length,
    identifiers: [],
  };
};

export const writeHideCtrlGToEdit = (oldFile: string): string | null => {
  const location = getCtrlGToEditLocation(oldFile);
  if (!location) {
    return null;
  }

  // Replace the condition with "false"
  const newCode = 'false';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCode +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCode, location.startIndex, location.endIndex);
  return newFile;
};
