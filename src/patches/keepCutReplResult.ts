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
// REPL session; for the in-process VM it holds the VM's global object in
// `vmGlobal`.
//
// This patch puts the uncut text in the VM global `$0` (one string, laid out like
// the uncut file: labelled parts separated by a blank line; for a string result it
// is the string itself), and starts the shown result with a line that names it.
// Only strings cross into the VM, so no host object becomes reachable from
// scripts. A session without `vmGlobal` (the turn-worker REPL) is left as it is.

import { showDiff } from './index';

const NOTICE =
  '[The result below is cut. The whole of it, ${t.length} chars, is in $0 (a string) until another cut result replaces it: slice or search $0 in the next script instead of getting the value again.]';

const keepUncut =
  '((r,s)=>{if(r.uncut===void 0||s.vmGlobal===void 0)return r;' +
  'let t=r.uncut.map((p)=>p.label===void 0?p.text:`${p.label}:\\n${p.text}`).join("\\n\\n");' +
  'try{Object.defineProperty(s.vmGlobal,"$0",{value:t,writable:!0,enumerable:!0,configurable:!0})}catch{return r}' +
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
