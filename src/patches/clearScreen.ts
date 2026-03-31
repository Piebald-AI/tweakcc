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

  const commandDef =
    ',{type:"local",name:"clear-screen",' +
    'description:"Clear screen without resetting conversation context",' +
    'supportsNonInteractive:!1,' +
    'load:()=>Promise.resolve().then(()=>({call:(H,$)=>{' +
    '$.setMessages(m=>{' +
    'let k=null;' +
    'for(let i=m.length-1;i>=0;i--){' +
    'if(m[i]?.type==="assistant"&&m[i].message?.usage){k=m[i];break}' +
    'if(!k&&m[i]?.type==="assistant")k=m[i]}' +
    'return k?[{...k,message:{...k.message,content:[]}}]:[]});' +
    'process.stdout.write("\\x1b[3J");' +
    'globalThis.__tweakccForceRedraw?.();' +
    'return{type:"skip"}}}))}';

  const result = writeSlashCommandDefinition(file, commandDef);
  if (!result) {
    debug('patch: clearScreen: failed to register slash command');
    return null;
  }

  return result;
};
