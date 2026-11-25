// Please see the note about writing patches in ./index
//
// Code Mode Chained Calls Patch - let a script's chained steps run after a
// command it left running
//
// In Code Mode's async lane a script may start a command without awaiting it
// and return, and the REPL prompt tells Claude to do so for long commands:
//   $`npm test`.nothrow().then(r => write('out.json', ...)); 'started'
// The script's calls may keep running after it returns. When the last one
// settles, the script's call counter drops to 0 and the runner's idle hook
// fires at once:
//
// CC 2.1.332 (chunk-h3f56h75.js, the script's call wrapper):
//   finally{if(this.pendingCalls--,...,this.ended&&this.pendingCalls===0)this.onIdle?.()}
// CC 2.1.332 (chunk-j03wwfcm.js, the REPL runner after the script returned):
//   let g=()=>{},h=new Promise((D)=>{g=D,te.onIdle=D}),...,
//   W=h.then(()=>(...,J.abort(AZo),...))
//
// `J` is the abort controller every tool call of the script runs under. Its
// abort is one microtask after the idle hook, but the code chained on the
// finished call (`.then(r => write(...))`) runs several microtasks later, so
// its first call finds `J` aborted and is refused ("This tool call did not
// run. The code that made it finished or was stopped before the call could
// start."). The result file is never written, and Claude runs the whole
// command again in the foreground (anthropics/claude-code#111618).
//
// This patch makes the idle hook wait one macrotask (setImmediate, after the
// pending microtasks of the chain) and fire only if no call started in the
// meantime. A call that did start keeps the script open, and its own end
// calls the hook again. Aborts (Esc, the 2-hour cap) still resolve at once.

import { showDiff } from './index';

export const writeCodeModeChainedCalls = (oldFile: string): string | null => {
  const pattern =
    /new Promise\(\(([$\w]+)\)=>\{([$\w]+)=\1,([$\w]+)\.onIdle=\1\}\)/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeChainedCalls: expected one script idle hook, found ${matches.length}`
    );
    return null;
  }

  const [whole, resolve, onAbort, script] = matches[0];
  const replacement =
    `new Promise((${resolve})=>{${onAbort}=${resolve},` +
    `${script}.onIdle=()=>setImmediate(()=>{${script}.pendingCalls===0&&${resolve}()})})`;
  const start = matches[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
