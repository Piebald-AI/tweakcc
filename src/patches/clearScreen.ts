// Please see the note about writing patches in ./index

import { debug } from '../utils';
import { showDiff } from './index';
import {
  findSlashCommandListEndPosition,
  writeSlashCommandDefinition,
} from './slashCommands';

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

export const writeClearScreen = (oldFile: string): string | null => {
  const alreadyPatchedPattern = /name:"clear-screen"/;
  if (alreadyPatchedPattern.test(oldFile)) {
    return oldFile;
  }

  let file = exposeForceRedraw(oldFile);
  if (!file) {
    debug('patch: clearScreen: failed to find forceRedraw function');
    return null;
  }

  file = patchRenderFilter(file);
  if (!file) {
    debug('patch: clearScreen: failed to patch render filter g97');
    return null;
  }

  const result = writeSlashCommandDefinition(file, commandDef);
  if (!result) {
    debug('patch: clearScreen: failed to register slash command');
    return null;
  }

  return result;
};

/**
 * CC 2.1.280+ split bundles: the forceRedraw helper (chunk-tjhhhqzz in
 * 2.1.295), the Messages transcript splitter (chunk-7ytk1pm2) and the
 * slash-command list (chunk-53bsrq2x) live in different modules. Patch each in
 * its own module.
 */
export const writeClearScreenModules = (
  modules: Map<string, string>
): Map<string, string> | null => {
  const changed = new Map<string, string>();
  const steps: [string, (file: string) => string | null][] = [
    ['forceRedraw function', exposeForceRedraw],
    ['transcript splitter', patchTranscriptSplit],
    [
      'slash command list',
      file =>
        /type:"local"/.test(file) &&
        findSlashCommandListEndPosition(file) !== null
          ? writeSlashCommandDefinition(file, commandDef)
          : null,
    ],
  ];
  for (const [label, step] of steps) {
    let found = false;
    for (const [name, content] of modules) {
      const current = changed.get(name) ?? content;
      const result = step(current);
      if (result) {
        changed.set(name, result);
        found = true;
        break;
      }
    }
    if (!found) {
      debug(`patch: clearScreen: failed to find ${label} in any module`);
      return null;
    }
  }
  return changed;
};

const exposeForceRedraw = (oldFile: string): string | null => {
  const redrawPattern =
    /([,;{}])(function [$\w]+\(\)\{)([$\w]+(?:\(\))?)\.get\(process\.stdout\)\?\.forceRedraw\(\)\}/;
  const redrawMatch = oldFile.match(redrawPattern);
  if (!redrawMatch || redrawMatch.index === undefined) {
    return null;
  }

  const delimiter = redrawMatch[1];
  const mapVar = redrawMatch[3];
  const redrawReplacement =
    `${delimiter}globalThis.__tweakccForceRedraw=()=>${mapVar}.get(process.stdout)?.forceRedraw();` +
    redrawMatch[0].slice(1);

  const file =
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

  return file;
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

/**
 * CC 2.1.295's Messages component runs the render filter inside a memo keyed
 * on the transcript array, which a stateful splitter keeps identical while the
 * messages themselves are unchanged, so hiding messages in the filter never
 * re-renders. Drop hidden messages in the splitter instead, e.g.
 *   split(l){let u=this.transcript,m=this.progress,...;for(let C of l)
 */
export const patchTranscriptSplit = (oldFile: string): string | null => {
  const pattern =
    /(split\(([$\w]+)\)\{let [$\w]+=this\.transcript,[$\w]+=this\.progress,[^;]*;for\(let [$\w]+ of )\2\)/;
  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    return null;
  }

  const arg = match[2];
  const replacement =
    `${match[1]}globalThis.__tweakccHiddenUUIDs?` +
    `${arg}.filter(x=>!globalThis.__tweakccHiddenUUIDs.has(x.uuid?.slice(0,24))):${arg})`;

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
