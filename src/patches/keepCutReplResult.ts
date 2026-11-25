// Please see the note about writing patches in ./index
//
// Keep Cut REPL Result Patch - keep the whole text of a cut Code Mode result in $0
//
// A Code Mode script's result over the REPL part cap (about 30,000 chars) reaches
// the model cut: the head, `... [N chars elided] ...`, and the tail. Since 2.1.331
// the uncut text is also written to tool-results/uncut-<hex>.txt and a log line
// gives the path, but a script that wants the middle has to read that file back,
// and the cut result itself still looks whole (anthropics/claude-code#111373).
//
// CC 2.1.332 (chunk-j03wwfcm.js), at the end of a script run:
//   Yn=[...me.carriedMarkers],Gn=se===void 0?void 0:Ho(se),en={code:Q,result:Gn?.shown,...}
// `se` is the script's value, `Ho` renders it as `{shown, uncut}`, where `uncut`
// (set only when the text was cut) lists the whole text in parts, and `me` is the
// REPL session. Code Mode has two script engines, and `me` differs between them:
//   - the default one (chunk-r1b3qc87.js) holds the VM's global object in
//     `me.vmGlobal`;
//   - the one behind the tengu_breezy_cupcake flag (chunk-8tabekkf.js) keeps its
//     VM private and runs everything through a queue, `me.messages`:
//       this.messages.post({tag:$oe,send:(r)=>r.run(n,{timeoutMs:R_e(),tag:$oe}),...})
//       run(e,{timeoutMs:t,tag:n,input:r,source:o}){if(o!==void 0&&this.#s.areBuiltinsFrozen()!==!0)
//         return{ok:!1,cause:"lost",...};...if(o===void 0)this.#T(e,i);else this.#u.delete(e);...}
//     where `$oe` is 0, the tag of work that belongs to no script.
//
// This patch puts the uncut text in the VM global `$0` (one string, laid out like
// the uncut file: labelled parts separated by a blank line; for a string result it
// is the string itself), and starts the shown result with a line that names it.
// With `vmGlobal` it defines the property directly. With `messages` it queues a
// one-line script that assigns the text as a string literal; the queue runs it
// before the next script. It passes `source`, as every script run does, so the
// engine doesn't keep the compiled script (with the text in it) in its cache;
// built-ins are frozen by then, since a script just ended. Only a string reaches
// the VM, so no host object becomes reachable from scripts.

import { showDiff } from './index';

const NOTICE =
  '[The result below is cut. The whole of it, ${t.length} chars, is in $0 (a string) until another cut result replaces it: slice or search $0 in the next script instead of getting the value again.]';

const keepUncut =
  '((r,s)=>{if(r.uncut===void 0)return r;' +
  'let t=r.uncut.map((p)=>p.label===void 0?p.text:`${p.label}:\\n${p.text}`).join("\\n\\n");' +
  'if(s.vmGlobal!==void 0)try{Object.defineProperty(s.vmGlobal,"$0",{value:t,writable:!0,enumerable:!0,configurable:!0})}catch{return r}' +
  'else if(s.messages?.post!==void 0){let c=`globalThis.$0=${JSON.stringify(t)};`;' +
  's.messages.post({tag:0,send:(e)=>e.run(c,{timeoutMs:5e3,tag:0,source:{name:"repl-cut-result.js",lineOffset:0}})})}' +
  'else return r;' +
  `return{...r,shown:\`${NOTICE}\\n\${r.shown}\`}})`;

export const writeKeepCutReplResult = (oldFile: string): string | null => {
  const pattern =
    /\[\.\.\.([$\w]+)\.carriedMarkers\],([$\w]+)=([$\w]+)===void 0\?void 0:([$\w]+)\(\3\),(?=[$\w]+=\{code:[$\w]+,result:\2\?\.shown,)/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: keepCutReplResult: expected one REPL result rendering, found ${matches.length}`
    );
    return null;
  }

  const [whole, session, shown, value, render] = matches[0];
  const replacement = `[...${session}.carriedMarkers],${shown}=${value}===void 0?void 0:${keepUncut}(${render}(${value}),${session}),`;
  const start = matches[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
