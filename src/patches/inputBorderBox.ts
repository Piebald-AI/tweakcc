// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Removes the input box border in Claude Code's PromptInput component.
 *
 * The PromptInput renders the input area in a ternary:
 *   swarmBanner ? (Fragment with ─.repeat lines using .bgColor) : (Box with borderStyle:"round" and borderText:)
 *
 * There's also an isExternalEditorActive path with borderStyle:"round" and "Save and close editor".
 *
 * We patch:
 * 1. The bgColor ─.repeat top and bottom lines → empty strings
 * 2. The main input Box's borderStyle:"round" → borderStyle:undefined (identified by borderText:)
 * 3. The external editor Box's borderStyle:"round" → borderStyle:undefined (identified by "Save and close editor")
 */
export const writeInputBoxBorder = (
  oldFile: string,
  removeBorder: boolean
): string | null => {
  if (!removeBorder) return oldFile;

  let content = oldFile;
  let patched = false;

  // --- Path 1: swarmBanner branch (─.repeat lines with .bgColor) ---
  // Bottom border: createElement(Text,{color:VAR.bgColor},"─".repeat(VAR))
  const bottomBorderPattern =
    /createElement\(([$\w]+),\{color:([$\w]+)\.bgColor\},"─"\.repeat\(([$\w]+)\)\)/;
  const bottomMatch = content.match(bottomBorderPattern);
  if (bottomMatch) {
    const textComp = bottomMatch[1];
    content = content.replace(
      bottomMatch[0],
      `createElement(${textComp},null,"")`
    );

    // Top border: createElement(Text,{color:VAR.bgColor},VAR.text?...Fragment..."─".repeat(...)..."──"):"─".repeat(VAR))
    const topBorderPattern = new RegExp(
      `createElement\\(${textComp},\\{color:${bottomMatch[2]}\\.bgColor\\},${bottomMatch[2]}\\.text\\?.+?"─"\\.repeat\\(${bottomMatch[3]}\\)\\)`
    );
    const topMatch = content.match(topBorderPattern);
    if (topMatch) {
      content = content.replace(
        topMatch[0],
        `createElement(${textComp},null,"")`
      );
    }
    patched = true;
  }

  // --- Path 2: Main input Box (else-branch with borderText:) ---
  // Unique identifier: borderColor:VAR(),borderStyle:"round",...,borderText:VAR(...)
  // The borderColor uses a function call like YB() and borderText uses a function call.
  const mainInputPattern =
    /(borderColor:[$\w]+\(\),)borderStyle:"round"(,borderLeft:!1,borderRight:!1,borderBottom:!0,width:"100%",borderText:)/;
  const mainInputMatch = content.match(mainInputPattern);
  if (mainInputMatch) {
    content = content.replace(
      mainInputMatch[0],
      `${mainInputMatch[1]}borderStyle:undefined${mainInputMatch[2]}`
    );
    patched = true;
  }

  // --- Path 3: External editor Box ---
  // Unique identifier: borderStyle:"round" near "Save and close editor"
  // Pattern: borderStyle:"round",borderLeft:!1,borderRight:!1,borderBottom:!0,width:"100%"},...,"Save and close editor
  const editorPattern =
    /borderStyle:"round"(,borderLeft:!1,borderRight:!1,borderBottom:!0,width:"100%"\}.+?Save and close editor)/;
  const editorMatch = content.match(editorPattern);
  if (editorMatch) {
    content = content.replace(
      editorMatch[0],
      `borderStyle:undefined${editorMatch[1]}`
    );
    patched = true;
  }

  if (patched) {
    showDiff(oldFile, content, '(input border removed)', 0, 0);
    return content;
  }

  console.error('patch: input border: failed to find input border pattern');
  return null;
};
