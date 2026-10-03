// Please see the note about writing patches in ./index

import { debug } from '../utils';
import { isGraphContextActive } from './graphContext';
import { showDiff } from './index';
import { writeSlashCommandDefinition } from './slashCommands';

export const writeClearScreen = (oldFile: string): string | null => {
  const alreadyPatchedPattern = /name:"clear-screen"/;
  if (alreadyPatchedPattern.test(oldFile)) {
    return oldFile;
  }

  // On a code-split module graph (CC 2.1.2xx) the three sites below live in
  // different modules and communicate only through globalThis, so patch
  // whichever ones this module contains.
  const partial = isGraphContextActive();

  // CC 2.1.2xx reaches the renderer map through a call: As().get(process.stdout)
  const redrawPattern =
    /([,;{}])(function [$\w]+\(\)\{)([$\w]+(?:\(\))?)\.get\(process\.stdout\)\?\.forceRedraw\(\)\}/;
  const redrawMatch = oldFile.match(redrawPattern);
  let file = oldFile;
  if (redrawMatch && redrawMatch.index !== undefined) {
    const delimiter = redrawMatch[1];
    const mapVar = redrawMatch[3];
    const redrawReplacement =
      `${delimiter}globalThis.__tweakccForceRedraw=()=>${mapVar}.get(process.stdout)?.forceRedraw();` +
      redrawMatch[0].slice(1);

    file =
      oldFile.slice(0, redrawMatch.index) +
      redrawReplacement +
      oldFile.slice(redrawMatch.index + redrawMatch[0].length);

    showDiff(
      oldFile,
      file,
      redrawReplacement,
      redrawMatch.index,
      redrawMatch.index + redrawMatch[0].length
    );
  } else if (!partial) {
    debug('patch: clearScreen: failed to find forceRedraw function');
    return null;
  }

  const renderFilterResult = patchRenderFilter(file);
  if (renderFilterResult) {
    file = renderFilterResult;
  } else if (!partial) {
    debug('patch: clearScreen: failed to patch render filter g97');
    return null;
  }

  if (partial) {
    const memoResult = patchListMemo(file);
    if (memoResult) file = memoResult;
  }

  const commandDef =
    ',{type:"local",name:"clear-screen",' +
    'description:"Clear screen without resetting conversation context",' +
    'supportsNonInteractive:!1,' +
    'load:()=>Promise.resolve().then(()=>({call:(H,$)=>{' +
    '$.setMessages(m=>{' +
    'globalThis.__tweakccHiddenUUIDs=new Set(m.map(x=>x.uuid?.slice(0,24)).filter(Boolean));' +
    'return[...m]});' +
    // Code-split builds memoise the message list on its props; bump the
    // version the list subscribes to so it re-filters (see patchListMemo).
    'globalThis.__tweakccClearVersion=(globalThis.__tweakccClearVersion|0)+1;' +
    'process.stdout.write("\\x1b[2J\\x1b[H\\x1b[3J");' +
    'globalThis.__tweakccForceRedraw?.();' +
    'setTimeout(()=>globalThis.__tweakccForceRedraw?.(),50);' +
    'return{type:"skip"}}}))}';

  const result = partial
    ? quietSlashCommand(file, commandDef)
    : writeSlashCommandDefinition(file, commandDef);
  if (!result) {
    if (partial) return file === oldFile ? null : file;
    debug('patch: clearScreen: failed to register slash command');
    return null;
  }

  return result;
};

/** Registers the command only where a command registry exists. */
const quietSlashCommand = (file: string, commandDef: string): string | null =>
  file.includes('name:"login"')
    ? writeSlashCommandDefinition(file, commandDef)
    : null;

/**
 * CC 2.1.2xx: the message list applies the render filter inside a
 * React-compiler memo block keyed only on its props:
 *   if(Q[49]!==Ge||…||Q[61]!==O){let Or;if(Q[66]!==q)Or=(Sk)=>wcr(Sk,q),…;Mo=pcr(Pr.filter(zM).filter(Or),on);…
 * Hiding messages changes none of those props, so the filter never re-runs.
 * Add the clear version (bumped by /clear-screen) to the guard.
 */
export const patchListMemo = (oldFile: string): string | null => {
  const pattern =
    /if\(((?:([$\w]+)\[\d+\]!==[$\w]+\|\|)(?:[$\w]+\[\d+\]!==[$\w]+\|\|)*[$\w]+\[\d+\]!==[$\w]+)\)\{(let ([$\w]+);if\([$\w]+\[\d+\]!==([$\w]+)\)\4=\(([$\w]+)\)=>[$\w.]+\(\6,\5\))/;
  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) return null;
  const [whole, guard, cache, rest] = match;
  const version = 'globalThis.__tweakccClearVersion|0';
  const replacement = `if(${cache}.tweakccClearVersion!==(${version})||${guard}){${cache}.tweakccClearVersion=${version};${rest}`;
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + whole.length);
  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + whole.length
  );
  return newFile;
};

export const patchRenderFilter = (oldFile: string): string | null => {
  const pattern =
    /([,;{}])(function [$\w]+\(([$\w]+),[$\w]+\)\{)if\(\3\.type!=="user"\)return!0;if\(\3\.isMeta\)/;
  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    return null;
  }

  const delimiter = match[1];
  const funcPrefix = match[2];
  const firstArg = match[3];

  const replacement =
    `${delimiter}${funcPrefix}if(globalThis.__tweakccHiddenUUIDs?.has(${firstArg}.uuid?.slice(0,24)))return!1;` +
    match[0].slice(delimiter.length + funcPrefix.length);

  const result =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + match[0].length);

  showDiff(
    oldFile,
    result,
    replacement,
    match.index,
    match.index + match[0].length
  );

  return result;
};
