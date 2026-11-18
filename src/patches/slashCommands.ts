// Utilities for working with slash commands in Claude Code

import { showDiff } from './index';

/**
 * Walk forward from an opening '[' counting top-level items.
 * Returns the position of the matching ']' and the item count, or null if
 * the array isn't well-formed (EOF reached). Handles strings, nested brackets,
 * parens, braces, and template literals.
 */
export const analyzeArrayFromOpenBracket = (
  fileContents: string,
  openBracketIndex: number
): { itemCount: number; closingBracket: number } | null => {
  let bracketDepth = 1;
  let parenDepth = 0;
  let braceDepth = 0;
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
    } else if (c === '[') {
      bracketDepth++;
      inItem = true;
    } else if (c === '(') {
      parenDepth++;
      inItem = true;
    } else if (c === '{') {
      braceDepth++;
      inItem = true;
    } else if (c === ']') {
      bracketDepth--;
      if (bracketDepth === 0) {
        if (inItem) itemCount++;
        return { itemCount, closingBracket: i };
      }
    } else if (c === ')') {
      parenDepth--;
      if (parenDepth < 0) return null;
    } else if (c === '}') {
      braceDepth--;
      if (braceDepth < 0) return null;
    } else if (
      c === ',' &&
      bracketDepth === 1 &&
      parenDepth === 0 &&
      braceDepth === 0
    ) {
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
 * Supports the pre-2.1.138 form (plain `=>[ID,ID,...]` with 30+ bare
 * identifiers), the 2.1.138+ form where the array uses spread operators for
 * conditionally-included commands, e.g.:
 *   =L8(()=>[AUK,pL4,DX4,y64,...gT4?[gT4]:[],Qj4,lI6,vL4,...,W94(),...])
 * and the 2.1.227+ form where the list moved into a named function whose body
 * returns the array, e.g.:
 *   function $tS(){return[uOd,Wza,lHf,...t5n("fleetFork"),nEf,...]}
 *
 * The candidate must also sit in slash-command-specific code. The bundle keeps
 * slash-command definitions near command metadata such as name/userFacingName,
 * so this rejects unrelated large arrays. When the bundle defines the `/login`
 * command, the candidate must also reference it, and if more than one
 * candidate still qualifies we refuse to guess and fall through to the
 * semantic lookup below.
 */
export interface SlashCommandArrayBounds {
  openBracket: number;
  closingBracket: number;
  assignmentStart?: number;
}

const escapeIdentifier = (identifier: string): string =>
  identifier.replace(/\$/g, '\\$');

const isIdentifierChar = (c: string | undefined): boolean =>
  c !== undefined && /[$\w]/.test(c);

/** Read the identifier that ends right before `end`. */
const identifierBefore = (fileContents: string, end: number): string | null => {
  let start = end;
  while (start > 0 && isIdentifierChar(fileContents[start - 1])) start--;
  return start < end ? fileContents.slice(start, end) : null;
};

/**
 * Identifiers that stand for the `/login` command: its factory
 * (`var L7t=()=>({type:"local-jsx",name:"login",…})`) plus any variable that
 * holds the factory's result (`ytn=L7t()`, seen in 2.1.312 code-split
 * builds). Returns null when the bundle doesn't define the login factory.
 * Only the first login factory is used; one module defines it once.
 */
export const findLoginCommandRefs = (fileContents: string): string[] | null => {
  const definition = fileContents.indexOf(
    '=()=>({type:"local-jsx",name:"login",'
  );
  if (definition === -1) return null;
  const factory = identifierBefore(fileContents, definition);
  if (!factory) return null;

  const refs = [factory];
  const call = new RegExp(`=${escapeIdentifier(factory)}\\(\\)(?=[,;)}])`, 'g');
  for (const match of fileContents.matchAll(call)) {
    const alias = identifierBefore(fileContents, match.index!);
    if (alias && !refs.includes(alias)) refs.push(alias);
  }
  return refs;
};

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/** True if `code` references one of `identifiers` outside string literals. */
const containsIdentifier = (
  code: string,
  identifiers: readonly string[]
): boolean =>
  new RegExp(
    `(?<![$\\w])(?:${identifiers.map(escapeIdentifier).join('|')})(?![$\\w])`
  ).test(code.replace(STRING_LITERAL, '""'));

export const findSlashCommandListBounds = (
  fileContents: string
): SlashCommandArrayBounds | null => {
  // Walk every `=>[` and `return[` candidate. The slash command array is the
  // (only) array returned from a function that contains >= 30 top-level items.
  const candidatePattern = /(?:=>|return)\s*\[/g;
  let m: RegExpExecArray | null;
  const candidates: { open: number; closing: number }[] = [];
  while ((m = candidatePattern.exec(fileContents)) !== null) {
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
      candidates.push({ open: bracketIndex, closing: info.closingBracket });
    }
  }

  // Proof that a candidate is the command list: it references `/login`.
  const loginRefs = findLoginCommandRefs(fileContents);
  const verified = loginRefs
    ? candidates.filter(c =>
        containsIdentifier(fileContents.slice(c.open, c.closing + 1), loginRefs)
      )
    : candidates;

  if (verified.length === 1) {
    return {
      openBracket: verified[0].open,
      closingBracket: verified[0].closing,
    };
  }
  if (verified.length > 1) {
    console.error(
      `patch: findSlashCommandListBounds: ${verified.length} arrays look like ` +
        `the slash command list (at offsets ${verified.map(c => c.open).join(', ')}); ` +
        'refusing to guess'
    );
  }

  // Current Claude Code builds may store command objects in distant module
  // variables, leaving the array itself as identifiers/spreads only. Resolve
  // it through the semantic getBuiltinCommands export instead.
  const builtinExport = fileContents.match(/getBuiltinCommands:\(\)=>([$\w]+)/);
  if (builtinExport) {
    const getterName = builtinExport[1].replace(/\$/g, '\\$');
    const getter = fileContents.match(
      new RegExp(`function ${getterName}\\(\\)\\{return ([$\\w]+)\\(\\)\\}`)
    );
    if (getter) {
      const listName = getter[1];
      const escapedList = listName.replace(/\$/g, '\\$');
      const listPattern = new RegExp(`${escapedList}=[$\\w]+\\(\\(\\)=>\\[`);
      const listMatch = fileContents.match(listPattern);
      const adjacency = new RegExp(`${escapedList}\\(\\)\\.flatMap\\(`).test(
        fileContents
      );
      if (listMatch?.index !== undefined && adjacency) {
        const openBracket = listMatch.index + listMatch[0].length - 1;
        const info = analyzeArrayFromOpenBracket(fileContents, openBracket);
        if (info && info.itemCount >= 30) {
          let assignmentStart = listMatch.index;
          while (
            assignmentStart > 0 &&
            ![';', '{', '}'].includes(fileContents[assignmentStart - 1])
          ) {
            assignmentStart--;
          }
          return {
            openBracket,
            closingBracket: info.closingBracket,
            assignmentStart,
          };
        }
      }
    }
  }

  console.error(
    'patch: findSlashCommandListEndPosition: failed to find arrayStartPattern'
  );
  return null;
};

export const findSlashCommandListEndPosition = (
  fileContents: string
): number | null =>
  findSlashCommandListBounds(fileContents)?.closingBracket ?? null;

/**
 * CC 2.1.2xx code-split builds define each builtin command as its own
 * factory (`var GBt=()=>({type:"local-jsx",name:"login",…})`) and list them
 * in a large registry array that also mixes in conditional spreads
 * (`…,GBt(),WBt(),HBt,…`). Register a new command right after `/login`'s
 * entry in that registry. `commandDef` starts with `,`.
 */
export const insertAfterLoginRegistration = (
  oldFile: string,
  commandDef: string
): string | null => {
  const loginDefinition = oldFile.match(
    /var\s+([$\w]+)=\(\)=>\(\{type:"local-jsx",name:"login",/
  );
  if (!loginDefinition || loginDefinition.index === undefined) return null;
  const registryEntry = new RegExp(
    `[,\\[]${loginDefinition[1].replace(/\$/g, '\\$')}\\(\\)(?=[,\\]])`,
    'g'
  );
  const entries = [...oldFile.matchAll(registryEntry)].filter(
    match => match.index! > loginDefinition.index!
  );
  if (entries.length !== 1) return null;
  const insertAt = entries[0].index! + entries[0][0].length;
  const newFile =
    oldFile.slice(0, insertAt) + commandDef + oldFile.slice(insertAt);
  showDiff(oldFile, newFile, commandDef, insertAt, insertAt);
  return newFile;
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
    const viaLogin = insertAfterLoginRegistration(oldFile, commandDef);
    if (viaLogin !== null) return viaLogin;
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
