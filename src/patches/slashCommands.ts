// Utilities for working with slash commands in Claude Code

import { showDiff } from './index';

/**
 * Walk forward from an opening '[' counting top-level items.
 * Returns the position of the matching ']' and the item count, or null if
 * the array isn't well-formed (EOF reached). Handles strings, nested brackets,
 * parens, braces, and template literals.
 */
const analyzeArrayFromOpenBracket = (
  fileContents: string,
  openBracketIndex: number
): { itemCount: number; closingBracket: number } | null => {
  let depth = 1;
  let i = openBracketIndex + 1;
  let itemCount = 0;
  let inItem = false;
  let inString: string | null = null;
  let escape = false;

  while (i < fileContents.length) {
    const c = fileContents[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === inString) {
        inString = null;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      inItem = true;
    } else if (c === '[' || c === '(' || c === '{') {
      depth++;
      inItem = true;
    } else if (c === ']') {
      if (depth === 1) {
        if (inItem) itemCount++;
        return { itemCount, closingBracket: i };
      }
      depth--;
    } else if (c === ')' || c === '}') {
      depth--;
    } else if (c === ',' && depth === 1) {
      if (inItem) itemCount++;
      inItem = false;
    } else if (!/\s/.test(c)) {
      inItem = true;
    }
    i++;
  }
  return null;
};

/**
 * Find the end position of the slash command array using stack machine.
 *
 * Supports both pre-2.1.138 form (plain `=>[ID,ID,...]` with 30+ bare
 * identifiers) and 2.1.138+ form where the array uses spread operators for
 * conditionally-included commands, e.g.:
 *   =L8(()=>[AUK,pL4,DX4,y64,...gT4?[gT4]:[],Qj4,lI6,vL4,...,W94(),...])
 *
 * The candidate must also sit in slash-command-specific code. The bundle keeps
 * slash-command definitions near command metadata such as name/userFacingName,
 * so this rejects unrelated large arrow-return arrays.
 */
export const findSlashCommandListEndPosition = (
  fileContents: string
): number | null => {
  // Walk every `=>[` candidate. The slash command array is the (only) array
  // following an arrow-return that contains >= 30 top-level items.
  const arrowPattern = /=>\s*\[/g;
  let m: RegExpExecArray | null;
  let best: { closing: number; items: number } | null = null;
  while ((m = arrowPattern.exec(fileContents)) !== null) {
    const bracketIndex = m.index + m[0].length - 1; // position of '['
    const anchorWindow = fileContents.slice(
      Math.max(0, m.index - 12000),
      Math.min(fileContents.length, m.index + 12000)
    );
    if (!/name:"[^"]+"[\s\S]{0,1200}description:/.test(anchorWindow)) {
      continue;
    }
    const info = analyzeArrayFromOpenBracket(fileContents, bracketIndex);
    if (info && info.itemCount >= 30) {
      if (!best || info.itemCount > best.items) {
        best = { closing: info.closingBracket, items: info.itemCount };
      }
    }
  }

  if (best) return best.closing;

  console.error(
    'patch: findSlashCommandListEndPosition: failed to find arrayStartPattern'
  );
  return null;
};

/**
 * Generic function to write a slash command definition
 */
export const writeSlashCommandDefinition = (
  oldFile: string,
  commandDef: string
): string | null => {
  const arrayEnd = findSlashCommandListEndPosition(oldFile);
  if (arrayEnd === null) {
    console.error(
      'patch: writeSlashCommandDefinition: failed to find slash command array end position'
    );
    return null;
  }

  // Insert before the closing ']'
  const newFile =
    oldFile.slice(0, arrayEnd) + commandDef + oldFile.slice(arrayEnd);

  showDiff(oldFile, newFile, commandDef, arrayEnd, arrayEnd);

  return newFile;
};
