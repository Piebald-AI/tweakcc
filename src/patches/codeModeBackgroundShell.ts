// Please see the note about writing patches in ./index
//
// Code Mode Background Shell Patch - $`cmd`.background() starts a background task
//
// In Code Mode a script runs shell commands with $. There is no direct way
// to start one in the background and get its task: an awaited command holds
// the script until it ends or reaches its timeout, and only a command that
// outlives its timeout moves to the background, so scripts launch workers
// with a timeout they mean to exceed (#110717):
//
//   const o = await $`long-running-worker`.nothrow().timeout(5000);
//   const handle = o.running.taskId;
//
// That waits out the timeout, and a command that starts with sleep is
// stopped at its timeout instead. The plain Bash tool has run_in_background.
//
// CC 2.1.332, the $ prelude (shell.prelude.js, loaded by chunk-nthvjcm6.js):
//   var t="/$bunfs/root/shell.prelude.js-e9940635.txt.zst";var e=Xt(t,import.meta.dirname);
// sets the timeout through a chain method:
//   chain('timeout', (n) => {
//       ms = n;
//   });
//
// CC 2.1.332, the host side of $ (chunk-h3f56h75.js) passes it to the shell
// tool and notes a result that went to the background:
//   P=e.useTool(h?ke:kt,{command:M+n,...r!==void 0&&{timeout:r}})}finally{...}
//   let I=await P,W=kZo(I,r,J);if(e.noteBackgroundCommand(u,I),...
//
// This patch adds `.background()` to the promise $ returns: it sets a
// timeout of 0, which the host side now turns into run_in_background: true
// (the shell tool reads a timeout of 0 as "none", so 0 meant the default
// before). The await resolves at once with exitCode null and running naming
// the task and its output file, the result notes that the command started in
// the background, and TaskStop stops it as usual. The REPL declarations
// (chunk-j03wwfcm.js) declare the method, and the advice to keep a dev server
// running with .timeout(3000) points to it instead.

import { showDiff } from './index';

type Site = { pattern: RegExp; replace: (m: RegExpMatchArray) => string };

const PRELUDE_SITES: Site[] = [
  {
    pattern:
      /var ([$\w]+)="\/\$bunfs\/root\/shell\.prelude\.js-\w+\.txt(?:\.zst)?";var [$\w]+=[$\w]+\(\1,import\.meta\.dirname\)/g,
    replace: ([load]) =>
      `${load}.replace("    chain('env', (e) => {",${JSON.stringify(
        "    chain('background', () => {\n        ms = 0;\n    });\n    chain('env', (e) => {"
      )})`,
  },
];

const HOST_SITES: Site[] = [
  {
    pattern:
      /(\.useTool\([$\w]+\?[$\w]+:[$\w]+,\{command:[$\w]+\+[$\w]+,\.\.\.([$\w]+)!==void 0&&)\{timeout:\2\}(\}\)\}finally\{[^{}]*\}let ([$\w]+)=await [$\w]+,[$\w]+=[$\w]+\(\4,\2,[$\w]+\);if\([$\w]+\.noteBackgroundCommand\([$\w]+,\4)\),/g,
    replace: ([, head, timeout, tail]) =>
      `${head}(${timeout}===0?{run_in_background:!0}:{timeout:${timeout}})${tail},${timeout}===0),`,
  },
  {
    pattern:
      /(requestedMs:([$\w]+),backgroundedByUser:[$\w]+,ending:[$\w]+\}\)\{(?:(?!function )[^])*?"The user moved the command to the background\.":)/g,
    replace: ([, head, requested]) =>
      `${head}${requested}===0?"It was started in the background.":`,
  },
];

const BACKGROUND_DECLARATION =
  '    /** runs the command in the background: the await resolves at once, with exitCode null and running naming the task and the file its output streams to (a timeout of 0 does the same) */\n    background(): ShellPromise;\n';

const DECLARATION_SITES: Site[] = [
  {
    pattern: /[$\w]+\.core\[[$\w]+\]\[[$\w]+\]\.trimEnd\(\)/g,
    replace: ([helpers]) =>
      `${helpers}.replace("    timeout(ms: number): ShellPromise;\\n",${JSON.stringify(
        '    timeout(ms: number): ShellPromise;\n' + BACKGROUND_DECLARATION
      )})`,
  },
  {
    pattern:
      / To keep a dev server or a watcher running, await it with a short timeout: `const server = await \$`npm run dev`\.timeout\(3000\)` moves it to the background after 3 s, where the user can see and stop it, and `server\.running\.outputPath` names the file with its output\./g,
    replace: () =>
      ' To keep a dev server, a watcher or a long job running, start it with `.background()`: `const server = await $`npm run dev`.background()` resolves at once and the command runs on in the background, where the user can see and stop it; `server.running.taskId` names its task and `server.running.outputPath` the file with its output.',
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

const MODULES: { marker: string; sites: Site[]; what: string }[] = [
  {
    marker: '/shell.prelude.js-',
    sites: PRELUDE_SITES,
    what: 'the $ prelude',
  },
  {
    marker: '.noteBackgroundCommand(',
    sites: HOST_SITES,
    what: 'the host side of $',
  },
  {
    marker: '.core[',
    sites: DECLARATION_SITES,
    what: 'the REPL declarations',
  },
];

export const writeCodeModeBackgroundShell = (
  oldFile: string
): string | null => {
  for (const { marker, sites, what } of MODULES) {
    if (!oldFile.includes(marker)) continue;
    const newFile = applySites(oldFile, sites);
    if (newFile === null) {
      console.error(`patch: codeModeBackgroundShell: failed to find ${what}`);
    }
    return newFile;
  }
  console.error('patch: codeModeBackgroundShell: failed to find $');
  return null;
};
