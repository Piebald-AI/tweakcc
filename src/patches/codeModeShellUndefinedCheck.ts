// Please see the note about writing patches in ./index
//
// Code Mode Shell Undefined Check Patch - $(string) refuses a command with the word `undefined`
//
// In Code Mode a script runs shell commands with $. As a tagged template,
// $`cmd ${x}` checks each value and refuses undefined and null before
// anything runs. $ also takes a plain string, $(command), and scripts use it
// to wrap commands in a helper:
//
//   const run = (cmd) => $(`cd ${WT} && ${cmd} 2>&1`).nothrow().then(r=>r.stdout);
//   await run(`${U} functions ${fx}hello.psx --option ${n} ${v}`)
//
// Here the template literal is not tagged, so JavaScript has already turned
// an undefined n into the text "undefined", and $ runs the command as
// written. In one session this ran 358 commands with `--option undefined`,
// all of which failed.
//
// CC 2.1.332, the $ prelude (shell.prelude.js, loaded by chunk-nthvjcm6.js):
//   var t="/$bunfs/root/shell.prelude.js-e9940635.txt.zst";var e=Xt(t,import.meta.dirname);
// takes either form:
//   function $(first, ...values) {
//       return isArray(first) && hasOwn(first, 'raw')
//           ? start(rawSh, render(first, values), undefined)
//           : start(rawSh, first, values[0]);
//   }
//
// This patch makes $(command) throw, before the command reaches the shell
// tool, when the string has `undefined` as a word. The error shows the text
// around the word and says to use the tagged form, which checks each value
// and also runs a command that really does contain the word. It leaves out
// `null`, which is a word in every `> /dev/null`. The tagged form, and
// strings without the word, run as before.

import { showDiff } from './index';

const DOLLAR =
  "function $(first, ...values) {\n    return isArray(first) && hasOwn(first, 'raw')";

const CHECK = `function $(first, ...values) {
    if (typeof first === 'string') {
        const found = apply(regExpExec, /\\bundefined\\b/, [first]);
        if (found !== null) {
            const at = found.index;
            const from = at > 60 ? at - 60 : 0;
            throw new BuiltinError('$ did not run this command: it has the word undefined (in ' +
                jsonStringify((from > 0 ? '...' : '') +
                    apply(stringSlice, first, [from, at + 69]) +
                    (at + 69 < first.length ? '...' : '')) +
                '), which is what a template literal writes for a value that is undefined: with x undefined, \`--option \${x}\` becomes "--option undefined" before $ sees it. Find out why the value is undefined first. Then write the command as a tagged template, $\`... \${x}\`, which checks each value and refuses undefined, and which also runs a command that does contain the word.');
        }
    }
    return isArray(first) && hasOwn(first, 'raw')`;

export const writeCodeModeShellUndefinedCheck = (
  oldFile: string
): string | null => {
  const pattern =
    /var ([$\w]+)="\/\$bunfs\/root\/shell\.prelude\.js-\w+\.txt(?:\.zst)?";var [$\w]+=[$\w]+\(\1,import\.meta\.dirname\)/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeShellUndefinedCheck: expected one $ prelude, found ${matches.length}`
    );
    return null;
  }

  const replacement = `${matches[0][0]}.replace(${JSON.stringify(DOLLAR)},()=>${JSON.stringify(CHECK)})`;
  const start = matches[0].index!;
  const end = start + matches[0][0].length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
