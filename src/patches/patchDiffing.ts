import { diffWordsWithSpace } from 'diff';
import chalk from 'chalk';
import { isVerbose, isShowUnchanged, verbose } from '../utils';

/**
 * Converts Unicode escape sequences (e.g., \u2014) back to their actual characters.
 * This normalizes strings before diffing so that automatic Unicode escaping doesn't
 * show up as changes.
 */
const unescapeUnicode = (str: string): string => {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
};

/**
 * Debug function for showing diffs between old and new file contents.
 *
 * Uses the `diff` library to compute character-level differences and displays them with
 * chalk-styled colors: green background for additions, red background for removals, and
 * dim text for unchanged portions. Only outputs when --verbose flag is set.
 *
 * @param oldFileContents - The original file content before modification
 * @param newFileContents - The modified file content after patching
 * @param injectedText - The text that was injected (used to calculate context window)
 * @param startIndex - The start index where the modification occurred
 * @param endIndex - The end index of the original content that was replaced
 *
 * @example
 * ```ts
 * showDiff(originalCode, patchedCode, 'console.log("patched")', 100, 120);
 * // Outputs:
 * // --- Diff ---
 * // ...context...REMOVED_TEXTadded_text...context...
 * // --- End Diff ---
 * ```
 */
export const showDiff = (
  oldFileContents: string,
  newFileContents: string,
  injectedText: string,
  startIndex: number,
  endIndex: number
): void => {
  if (!isVerbose()) {
    return;
  }

  const numContextChars = 40;

  // Extract the relevant portions with context
  const contextStart = Math.max(0, startIndex - numContextChars);
  const contextEndOld = Math.min(
    oldFileContents.length,
    endIndex + numContextChars
  );
  const contextEndNew = Math.min(
    newFileContents.length,
    startIndex + injectedText.length + numContextChars
  );

  const oldSnippet = oldFileContents.slice(contextStart, contextEndOld);
  const newSnippet = newFileContents.slice(contextStart, contextEndNew);

  // Normalize Unicode escapes before comparing so automatic escaping doesn't show as changes
  const oldSnippetNormalized = unescapeUnicode(oldSnippet);
  const newSnippetNormalized = unescapeUnicode(newSnippet);

  // Check if the snippets are identical (after normalization)
  if (oldSnippetNormalized === newSnippetNormalized) {
    if (isShowUnchanged()) {
      verbose('\n--- Diff ---');
      verbose(chalk.blue('UNCHANGED: ') + chalk.dim(oldSnippetNormalized));
      verbose('--- End Diff ---\n');
    }
    return;
  }

  // Compute word-level diff (includes whitespace as separate tokens)
  const changes = diffWordsWithSpace(
    oldSnippetNormalized,
    newSnippetNormalized
  );

  // Find the index range of actual changes in both old and new
  // We track positions where changes START (after leading unchanged content)
  // and where changes END (before trailing unchanged content)
  let oldPos = 0;
  let newPos = 0;
  let firstChangeOldPos = -1;
  let lastChangeOldEnd = -1;
  let firstChangeNewPos = -1;
  let lastChangeNewEnd = -1;
  // Track positions in old/new at the time of the last change (for trailing context)
  let oldPosAtLastChange = 0;
  let newPosAtLastChange = 0;

  for (const part of changes) {
    if (part.added) {
      if (firstChangeNewPos === -1) {
        firstChangeNewPos = newPos;
        firstChangeOldPos = oldPos; // Sync old position at first change
      }
      lastChangeNewEnd = newPos + part.value.length;
      lastChangeOldEnd = oldPos; // Old position at this change point
      oldPosAtLastChange = oldPos;
      newPosAtLastChange = newPos + part.value.length;
      newPos += part.value.length;
    } else if (part.removed) {
      if (firstChangeOldPos === -1) {
        firstChangeOldPos = oldPos;
        firstChangeNewPos = newPos; // Sync new position at first change
      }
      lastChangeOldEnd = oldPos + part.value.length;
      lastChangeNewEnd = newPos; // New position at this change point
      oldPosAtLastChange = oldPos + part.value.length;
      newPosAtLastChange = newPos;
      oldPos += part.value.length;
    } else {
      // Unchanged - advances both, but don't update change positions
      oldPos += part.value.length;
      newPos += part.value.length;
    }
  }

  // If no changes found, fall back to full snippet
  if (firstChangeOldPos === -1) firstChangeOldPos = 0;
  if (firstChangeNewPos === -1) firstChangeNewPos = 0;
  if (lastChangeOldEnd === -1) lastChangeOldEnd = oldSnippetNormalized.length;
  if (lastChangeNewEnd === -1) lastChangeNewEnd = newSnippetNormalized.length;

  // Calculate how much trailing unchanged content exists after the last change
  const trailingOldContext = oldSnippetNormalized.length - oldPosAtLastChange;
  const trailingNewContext = newSnippetNormalized.length - newPosAtLastChange;
  const trailingContext = Math.min(
    trailingOldContext,
    trailingNewContext,
    numContextChars
  );

  // Crop to context around actual changes
  const cropStartOld = Math.max(0, firstChangeOldPos - numContextChars);
  const cropEndOld = Math.min(
    oldSnippetNormalized.length,
    oldPosAtLastChange + trailingContext
  );
  const cropStartNew = Math.max(0, firstChangeNewPos - numContextChars);
  const cropEndNew = Math.min(
    newSnippetNormalized.length,
    newPosAtLastChange + trailingContext
  );

  // Recompute diff on cropped snippets
  const croppedOld = oldSnippetNormalized.slice(cropStartOld, cropEndOld);
  const croppedNew = newSnippetNormalized.slice(cropStartNew, cropEndNew);
  const croppedChanges = diffWordsWithSpace(croppedOld, croppedNew);

  // Build the highlighted output for OLD (show removed in red, unchanged in dim, skip added)
  let oldOutput = '';
  for (const part of croppedChanges) {
    if (part.added) {
      // Skip added parts in old line
    } else if (part.removed) {
      // Show newlines explicitly so they're visible in the diff
      if (part.value.includes('\n')) {
        const partLines = part.value.split('\n');
        partLines.forEach((partLine, i) => {
          if (partLine) {
            oldOutput += chalk.bgRed.white(partLine);
          }
          if (i < partLines.length - 1) {
            oldOutput += chalk.bgRed.dim('\\n') + '\n';
          }
        });
      } else {
        oldOutput += chalk.bgRed.white(part.value);
      }
    } else {
      oldOutput += chalk.dim(part.value);
    }
  }

  // Build the highlighted output for NEW (show added in green, unchanged in dim, skip removed)
  let newOutput = '';
  for (const part of croppedChanges) {
    if (part.added) {
      // Show newlines explicitly so they're visible in the diff
      if (part.value.includes('\n')) {
        const partLines = part.value.split('\n');
        partLines.forEach((partLine, i) => {
          if (partLine) {
            newOutput += chalk.bgGreen.black(partLine);
          }
          if (i < partLines.length - 1) {
            newOutput += chalk.bgGreen.dim('\\n') + '\n';
          }
        });
      } else {
        newOutput += chalk.bgGreen.black(part.value);
      }
    } else if (part.removed) {
      // Skip removed parts in new line
    } else {
      newOutput += chalk.dim(part.value);
    }
  }

  verbose('\n--- Diff ---');
  verbose(chalk.red('OLD: ') + oldOutput);
  verbose(chalk.green('NEW: ') + newOutput);
  verbose('--- End Diff ---\n');
};

/**
 * Performs a global replace on a string, finding all matches first, then replacing
 * them in reverse order (to preserve indices), and calling showDiff for each replacement.
 *
 * @param content - The string to perform replacements on
 * @param pattern - The regex pattern to match (should have 'g' flag for multiple matches)
 * @param replacement - Either a string or a replacer function (same as String.replace)
 * @returns The modified string with all replacements applied
 *
 * @example
 * ```ts
 * const result = globalReplace(
 *   content,
 *   /throw Error\(`something`\);/g,
 *   ''
 * );
 * ```
 */
export const globalReplace = (
  content: string,
  pattern: RegExp,
  replacement: string | ((substring: string, ...args: unknown[]) => string)
): string => {
  // Collect all matches with their indices
  const matches: { index: number; length: number }[] = [];

  // Ensure we have a global regex to find all matches
  const globalPattern = pattern.global
    ? pattern
    : new RegExp(pattern.source, pattern.flags + 'g');

  let match: RegExpExecArray | null;
  while ((match = globalPattern.exec(content)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
    });
  }

  // Create a non-global version for single replacements
  const singlePattern = new RegExp(
    pattern.source,
    pattern.flags.replace('g', '')
  );

  // Process matches in reverse order to preserve indices
  let result = content;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { index, length } = matches[i];
    const oldContent = result;

    // Extract the matched portion and use native replace for proper $-pattern handling
    const matchedStr = result.slice(index, index + length);
    const replacementStr = matchedStr.replace(
      singlePattern,
      replacement as string
    );

    // Perform the replacement
    result =
      result.slice(0, index) + replacementStr + result.slice(index + length);

    // Show the diff for this replacement
    showDiff(oldContent, result, replacementStr, index, index + length);
  }

  return result;
};
