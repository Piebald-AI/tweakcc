// Please see the note about writing patches in ./index

import { globalReplace } from './index';

/**
 * Removes the input box border in Claude Code's PromptInput component.
 *
 * The main prompt box and the external-editor box ("Save and close editor")
 * both spread a single hoisted props object that carries the input border:
 *   vie=hO?{}:{borderColor:(()=>{...})(),borderStyle:"round",borderLeft:!1,borderRight:!1,borderBottom:!0}
 * and each box renders as Jsx(Box,{...,...vie,width:"100%",...}).
 *
 * We disable the border on that shared object by turning its borderStyle:"round"
 * into borderStyle:undefined. The borderLeft:!1,borderRight:!1,borderBottom:!0
 * trailing makes the anchor unique (the top-only input border), so a global
 * replace is safe; it also covers older CC where the main and editor boxes each
 * carried this combo inline.
 */
export const writeInputBoxBorder = (
  oldFile: string,
  removeBorder: boolean
): string | null => {
  if (!removeBorder) return oldFile;

  const newFile = globalReplace(
    oldFile,
    /borderStyle:"round"(,borderLeft:!1,borderRight:!1,borderBottom:!0)/g,
    (_m, trailing) => `borderStyle:undefined${trailing}`
  );

  if (newFile === oldFile) {
    console.error('patch: input border: failed to find input border pattern');
    return null;
  }

  return newFile;
};
