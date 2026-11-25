// Please see the note about writing patches in ./index
//
// Code Mode Unavailable Helpers Patch - leave out script helpers whose tool the agent lacks
//
// In Code Mode a script writes files with write() and edit() and reads them
// with file(), which call the Write, Edit and Read tools. A subagent whose
// tools leave one of these out (Explore, Plan, a custom read-only agent) is
// not given the tool in its scripts, and since 2.1.328 its REPL declarations
// leave the helper out too. The helper itself is still defined, and every call
// throws "Write tool is not available in this REPL context" (#110715).
//
// CC 2.1.332, default kernel (chunk-r1b3qc87.js): the script context is made
// with the agent's script tools, then every global is put in it:
//   for(let k of gdr(e))t.toolNames.add(k.name);let T={shared:t,vmContext:i,...};
//   G(T,t.toolNames);let m=new Set(Object.getOwnPropertyNames(i)),...
// where G installs edit, write, file and sleep unconditionally:
//   for(let a of["edit","write","file","sleep"])h(e,a,x[a]);
//
// CC 2.1.332, Repl kernel (chunk-8tabekkf.js, behind an experiment): the
// kernel puts every helper the file prelude returns, again on every install:
//   constructor(e,t){...for(let{name:r}of gdr(e))this.toolNames.add(r);...
//     let n=it(t,{shellKind:_dr(),...});...}
//   function it(e,t){let n={...t,ops:...};...return`...
//       file: ${ae(JJr)},
//   ...`}
//
// This patch deletes the helpers whose tool is not among the script's tools
// right after the default kernel installs them, and wraps the Repl kernel's
// file prelude so it never returns them. The names left out are the ones the
// declarations already leave out, so a call is now a ReferenceError the model
// can see coming, not a throw from a declared function.

import { showDiff } from './index';

const HELPER_TOOLS = JSON.stringify([
  ['edit', 'Edit'],
  ['write', 'Write'],
  ['file', 'Read'],
]);

type Site = { pattern: RegExp; replace: (m: RegExpMatchArray) => string };

const KERNEL_SITE: Site = {
  pattern:
    /;([$\w]+)\(([$\w]+),([$\w]+)\.toolNames\);(?=let [$\w]+=new Set\(Object\.getOwnPropertyNames\(([$\w]+)\)\))/g,
  replace: ([whole, , , shared, context]) =>
    `${whole}for(const[tweakccHelper,tweakccTool]of${HELPER_TOOLS})if(!${shared}.toolNames.has(tweakccTool))delete ${context}[tweakccHelper];`,
};

const REPL_SITES: Site[] = [
  {
    pattern: /=([$\w]+)\(([$\w]+),\{shellKind:/g,
    replace: ([, build, backend]) =>
      `=${build}(${backend},{unavailableHelpers:${HELPER_TOOLS}.flatMap(([h,n])=>this.toolNames.has(n)?[]:[h]),shellKind:`,
  },
  {
    pattern:
      /(function [$\w]+\([$\w]+,([$\w]+)\)\{let [$\w]+=\{\.\.\.\2,ops:[^`]*`[^`]*?\n {4}file: )\$\{([$\w]+\([$\w]+\))\},\n/g,
    replace: ([, head, settings, prelude]) =>
      `${head}(f => (...a) => { const h = f(...a); for (const n of \${JSON.stringify(${settings}.unavailableHelpers ?? [])}) delete h[n]; return h; })(\${${prelude}}),\n`,
  },
];

const applySites = (oldFile: string, sites: Site[]): string | null => {
  let text = oldFile;
  for (const { pattern, replace } of sites) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1) return null;
    const start = matches[0].index!;
    const end = start + matches[0][0].length;
    const replacement = replace(matches[0]);
    const next = text.slice(0, start) + replacement + text.slice(end);
    showDiff(text, next, replacement, start, end);
    text = next;
  }
  return text;
};

export const writeCodeModeUnavailableHelpers = (
  oldFile: string
): string | null => {
  if (oldFile.includes('.toolNames);let ')) {
    const newFile = applySites(oldFile, [KERNEL_SITE]);
    if (newFile === null) {
      console.error(
        'patch: codeModeUnavailableHelpers: failed to find where the script globals are installed'
      );
    }
    return newFile;
  }
  if (oldFile.includes('{shellKind:')) {
    const newFile = applySites(oldFile, REPL_SITES);
    if (newFile === null) {
      console.error(
        'patch: codeModeUnavailableHelpers: failed to find the Repl kernel file prelude'
      );
    }
    return newFile;
  }
  console.error(
    'patch: codeModeUnavailableHelpers: failed to find the script helpers'
  );
  return null;
};
