// Utilities for working with slash commands in Claude Code

import { showDiff } from './index.js';

/**
 * Find the end position of the slash command array using stack machine
 */
export const findSlashCommandListEndPosition = (
  fileContents: string
): number | null => {
  // Find the array with 30+ elements (slash commands list)
  const arrayStartPattern = /=>\[([$a-zA-Z_][$\w]{1,2},){30}/;
  const match = fileContents.match(arrayStartPattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: findSlashCommandListEndPosition: failed to find arrayStartPattern'
    );
    return null;
  }

  // Find the '[' in the match
  const bracketIndex = fileContents.indexOf('[', match.index);
  if (bracketIndex === -1) {
    console.error(
      'patch: findSlashCommandListEndPosition: failed to find bracketIndex'
    );
    return null;
  }

  // Use stack machine to find the matching ']'
  let level = 1; // We're already inside the array
  let i = bracketIndex + 1;

  while (i < fileContents.length && level > 0) {
    if (fileContents[i] === '[') {
      level++;
    } else if (fileContents[i] === ']') {
      level--;
      if (level === 0) {
        return i; // This is the end of the array
      }
    }
    i++;
  }

  console.error(
    'patch: findSlashCommandListEndPosition: failed to find matching closing-bracket'
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
