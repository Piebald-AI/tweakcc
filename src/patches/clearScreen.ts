// Please see the note about writing patches in ./index

import { debug } from '../utils';
import { showDiff } from './index';
import { writeSlashCommandDefinition } from './slashCommands';

export const writeClearScreen = (oldFile: string): string | null => {
  const alreadyPatchedPattern = /name:"clear-screen"/;
  if (alreadyPatchedPattern.test(oldFile)) {
    return oldFile;
  }

  const redrawPattern =
    /([,;{}])(let [$\w]+=[$\w]+\.useCallback\(\(\)=>\{)([$\w]+)\.get\(process\.stdout\)\?\.forceRedraw\(\)\}/;
  const redrawMatch = oldFile.match(redrawPattern);
  if (!redrawMatch || redrawMatch.index === undefined) {
    debug('patch: clearScreen: failed to find app:redraw callback');
    return null;
  }

  const delimiter = redrawMatch[1];
  const mapVar = redrawMatch[3];
  const redrawReplacement =
    `${delimiter}globalThis.__tweakccForceRedraw=()=>${mapVar}.get(process.stdout)?.forceRedraw();` +
    redrawMatch[0].slice(1);

  let file =
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

  const renderFilterResult = patchRenderFilter(file);
  if (!renderFilterResult) {
    debug('patch: clearScreen: failed to patch render filter g97');
    return null;
  }
  file = renderFilterResult;

  const commandDef =
    ',{type:"local",name:"clear-screen",' +
    'description:"Clear screen without resetting conversation context",' +
    'supportsNonInteractive:!1,' +
    'load:()=>Promise.resolve().then(()=>({call:(H,$)=>{' +
    '$.setMessages(m=>{' +
    'globalThis.__tweakccHiddenUUIDs=new Set(m.map(x=>x.uuid?.slice(0,24)).filter(Boolean));' +
    'return[...m]});' +
    'process.stdout.write("\\x1b[2J\\x1b[H\\x1b[3J");' +
    'globalThis.__tweakccForceRedraw?.();' +
    'return{type:"skip"}}}))}';

  const result = writeSlashCommandDefinition(file, commandDef);
  if (!result) {
    debug('patch: clearScreen: failed to register slash command');
    return null;
  }

  return result;
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
