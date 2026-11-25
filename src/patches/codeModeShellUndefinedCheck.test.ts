import { describe, expect, it } from 'vitest';

import { writeCodeModeBackgroundShell } from './codeModeBackgroundShell';
import { writeCodeModeShellUndefinedCheck } from './codeModeShellUndefinedCheck';

// CC 2.1.332, chunk-nthvjcm6.js: loads the $ prelude.
const PRELUDE_LOADER =
  'import{Xt}from"/$bunfs/root/chunk-d5hjpa3k.js";var t="/$bunfs/root/shell.prelude.js-e9940635.txt.zst";var e=Xt(t,import.meta.dirname);export{e as default};';

// $ itself, from the 2.1.332 $ prelude.
const DOLLAR =
  "function $(first, ...values) {\n    return isArray(first) && hasOwn(first, 'raw')\n        ? start(rawSh, render(first, values), undefined)\n        : start(rawSh, first, values[0]);\n}";

// Loads the prelude text with the loader and returns its $, with the
// prelude's own helpers stubbed; start records the commands it is given.
const load = (loader: string) => {
  // import.meta only parses in a module.
  const text = new Function(
    'Xt',
    `${loader
      .replace(/^import[^;]*;/, '')
      .replace(/export\{.*$/, '')
      .replace('import.meta.dirname', '"/"')};return e`
  )(() => DOLLAR) as string;
  const started: unknown[] = [];
  const $ = new Function(
    'isArray',
    'hasOwn',
    'apply',
    'regExpExec',
    'stringSlice',
    'jsonStringify',
    'BuiltinError',
    'start',
    'render',
    'rawSh',
    `${text};return $`
  )(
    Array.isArray,
    Object.hasOwn,
    Reflect.apply,
    RegExp.prototype.exec,
    String.prototype.slice,
    JSON.stringify,
    Error,
    (_raw: unknown, command: unknown, timeout: unknown) =>
      started.push([command, timeout]),
    (strings: string[], values: unknown[]) =>
      strings.reduce((cmd, s, i) => cmd + String(values[i - 1]) + s),
    'rawSh'
  ) as (first: unknown, ...values: unknown[]) => unknown;
  return { $, started };
};

const tagged = (strings: TemplateStringsArray, ...values: unknown[]) =>
  [strings, ...values] as const;

describe('writeCodeModeShellUndefinedCheck', () => {
  it('runs a string with the word undefined without the patch', () => {
    const { $, started } = load(PRELUDE_LOADER);
    $('unlace functions hello.psx --option undefined off');
    expect(started).toEqual([
      ['unlace functions hello.psx --option undefined off', undefined],
    ]);
  });

  it('refuses a string with the word undefined before running it', () => {
    const { $, started } = load(
      writeCodeModeShellUndefinedCheck(PRELUDE_LOADER)!
    );
    expect(() =>
      $('cd /w && unlace functions hello.psx --option undefined off 2>&1')
    ).toThrow(
      /^\$ did not run this command: it has the word undefined \(in "cd \/w && unlace functions hello\.psx --option undefined off 2>&1"\).*tagged template/
    );
    expect(() => $('cp a undefined/build')).toThrow(/word undefined/);
    expect(() => $(`ls ${'x'.repeat(100)} undefined`)).toThrow(
      /\(in "\.\.\.x{59} undefined"\)/
    );
    expect(started).toEqual([]);
  });

  it('runs everything else as before', () => {
    const { $, started } = load(
      writeCodeModeShellUndefinedCheck(PRELUDE_LOADER)!
    );
    $('ls > /dev/null', 3000);
    $('echo $UNDEFINED_VAR undefinedness');
    $(...tagged`echo ${1} undefined`);
    expect(started).toEqual([
      ['ls > /dev/null', 3000],
      ['echo $UNDEFINED_VAR undefinedness', undefined],
      ['echo 1 undefined', undefined],
    ]);
  });

  it('applies together with codeModeBackgroundShell in either order', () => {
    for (const loader of [
      writeCodeModeBackgroundShell(
        writeCodeModeShellUndefinedCheck(PRELUDE_LOADER)!
      )!,
      writeCodeModeShellUndefinedCheck(
        writeCodeModeBackgroundShell(PRELUDE_LOADER)!
      )!,
    ]) {
      expect(() => load(loader).$('x undefined')).toThrow(/word undefined/);
      expect(loader).toContain("chain('background'");
    }
  });

  it('returns null when the $ prelude is not there', () => {
    expect(writeCodeModeShellUndefinedCheck('let x=1;')).toBeNull();
  });
});
