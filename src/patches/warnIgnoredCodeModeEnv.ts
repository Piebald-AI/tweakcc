// Please see the note about writing patches in ./index
//
// Warn About Ignored Code Mode Env Patch - name CLAUDE_CODE_EXPERIMENTAL_CODE_MODE
// in /doctor and /status when a project's settings file sets it
//
// A project's settings files (.claude/settings.json, .claude/settings.local.json)
// can't turn Code Mode on: CLAUDE_CODE_EXPERIMENTAL_CODE_MODE is in the set of
// env keys that project scope may not set, and the opt-in reads only --settings,
// ~/.claude/settings.json and the shell. The one message about it goes to the
// debug log, so a user who puts the flag in settings.local.json is never told
// (anthropics/claude-code#111742).
//
// /doctor and /status already list env keys that project settings ignore, but
// only for telemetry variables. CC 2.1.332 (chunk-gf6wnm23.js):
//   function _yi(){let t=[],r=[],n=Jo();for(let o of n){if(!KV(o))continue;...
//     let i=me(o)?.env??{},g=[],l=[];for(let a of Object.keys(i)){...}
//     let d=vn(o),c=Tx(o);if(g.length>0)t.push({file:d,path:"env",
//     message:`Claude Code ignores these telemetry variables in ${c}: ...`,
//     severity:"warning",statusOnly:!0});...}return{ignored:t,turnedOff:r}}
//
// This patch adds a notice of the same kind to that list when a project or
// local settings file sets CLAUDE_CODE_EXPERIMENTAL_CODE_MODE to an on value,
// using the module's own env truthiness check (the one it applies to
// CLAUDE_CODE_ENABLE_TELEMETRY).

import { showDiff } from './index';

const CODE_MODE_ENV = 'CLAUDE_CODE_EXPERIMENTAL_CODE_MODE';

export const writeWarnIgnoredCodeModeEnv = (oldFile: string): string | null => {
  const truthy = oldFile.match(
    /([$\w]+)\(process\.env\.CLAUDE_CODE_ENABLE_TELEMETRY\)/
  )?.[1];
  const pattern =
    /let ([$\w]+)=[$\w]+\(([$\w]+)\)\?\.env\?\?\{\}.{0,400}?let ([$\w]+)=[$\w]+\(\2\),([$\w]+)=[$\w]+\(\2\);(?=if\([$\w]+\.length>0\)([$\w]+)\.push\(\{file:\3,path:"env",message:`Claude Code ignores these telemetry variables in \$\{\4\})/g;
  const matches = truthy ? [...oldFile.matchAll(pattern)] : [];
  if (matches.length !== 1) {
    console.error(
      `patch: warnIgnoredCodeModeEnv: expected one ignored-telemetry-env notice, found ${matches.length}`
    );
    return null;
  }

  const [whole, env, , file, fileLabel, ignored] = matches[0];
  const notice =
    `for(let $tccKey of Object.keys(${env}))if($tccKey.toUpperCase()===${JSON.stringify(CODE_MODE_ENV)}&&${truthy}(${env}[$tccKey]))` +
    `${ignored}.push({file:${file},path:"env",message:` +
    '`Claude Code ignores ${$tccKey} in ${' +
    fileLabel +
    "}: a project's settings files can't turn Code Mode on. Set it in your shell, in the env block of ~/.claude/settings.json, or in a --settings file (claude -p and Agent SDK apps take it only from --settings).`" +
    ',severity:"warning",statusOnly:!0});';
  const start = matches[0].index! + whole.length;
  const newFile = oldFile.slice(0, start) + notice + oldFile.slice(start);

  showDiff(oldFile, newFile, notice, start, start);

  return newFile;
};
