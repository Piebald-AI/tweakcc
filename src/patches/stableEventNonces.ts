// Please see the note about writing patches in ./index
//
// Stable Event Nonces Patch - keep Code Mode's event nonces stable across restarts
//
// Code Mode delivers script results and notifications to the model as
// `<event nonce="...">` elements inside tool results. Two kinds of nonce are
// computed every time the conversation is turned into a request, as an
// HMAC-SHA256 keyed with 32 random bytes made once per process:
//
// CC 2.1.332 (chunk-89607rrd.js):
//   var V;function eDs(e){return V??=B(32),q("sha256",V).update(e)...}
//   function f4n(e,n){...let o=eDs(`remint:${t}`)...}   // re-minted nonces
//   ...eDs(v2.uuid)...                                     // queued commands
//
// Within one process the key is fixed, so the text is too. After a restart or
// resume the key is new, every such nonce changes, and the old tool result no
// longer matches what the prompt cache holds: everything from that message on
// is written to the cache again (300k-700k tokens each time in long sessions).
//
// This patch keeps the key in a file (0600) next to Claude Code's other
// config, created on first use, so the nonces render the same way in every
// process. They stay unguessable to anything that cannot read that file.

import { showDiff } from './index';

const KEY_FILE = '.event-nonce-key';

const keyLoader = (randomBytes: string) =>
  '(()=>{try{' +
  'const fs=process.getBuiltinModule("fs"),path=process.getBuiltinModule("path");' +
  'const dir=process.env.CLAUDE_CONFIG_DIR||path.join(process.getBuiltinModule("os").homedir(),".claude");' +
  `const file=path.join(dir,${JSON.stringify(KEY_FILE)});` +
  'const read=()=>{try{const k=fs.readFileSync(file);return k.length===32?k:null}catch{return null}};' +
  'let k=read();if(k)return k;' +
  `k=${randomBytes}(32);` +
  'fs.mkdirSync(dir,{recursive:!0});' +
  'try{fs.writeFileSync(file,k,{mode:384,flag:"wx"});return k}catch{return read()??k}' +
  `}catch{return ${randomBytes}(32)}})()`;

export const writeStableEventNonces = (oldFile: string): string | null => {
  const pattern =
    /([$\w]+)\?\?=([$\w]+)\(32\),([$\w]+)\("sha256",\1\)\.update\(/g;
  const matches = oldFile.includes('remint:')
    ? [...oldFile.matchAll(pattern)]
    : [];
  if (matches.length !== 1) {
    console.error(
      `patch: stableEventNonces: expected one per-process nonce key, found ${matches.length}`
    );
    return null;
  }

  const [whole, keyVar, randomBytes, hmac] = matches[0];
  const replacement = `${keyVar}??=${keyLoader(randomBytes)},${hmac}("sha256",${keyVar}).update(`;
  const start = matches[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
