import * as os from 'node:os';

import { describe, it, expect } from 'vitest';

import {
  assertPatchedBundleParses,
  PatchedBundleParseError,
  sanitizeParseError,
} from './parseGate';

// The exact over-escaped template/ternary that shipped in #869 (fixed by #870).
// Raw bytes: `${l?`\\`${y}\\``:y}`; the doubled backslash closes the inner
// template early, so `node --check` reports `Unexpected identifier '$'`.
const BROKEN_869 =
  'var y = 1, l = 0;\n' +
  'var out = `${l?`\\\\`${y}\\\\``:y}`;\n' +
  'module.exports = out;\n';

describe('assertPatchedBundleParses', () => {
  it('does not throw on valid CommonJS', () => {
    const valid = 'const x = 1;\nmodule.exports = { x };\n';
    expect(() => assertPatchedBundleParses(valid)).not.toThrow();
  });

  it('throws PatchedBundleParseError on a simple syntax error', () => {
    expect(() => assertPatchedBundleParses('let a=;')).toThrow(
      PatchedBundleParseError
    );
  });

  it('throws on the #869 over-escaped template/ternary', () => {
    expect(() => assertPatchedBundleParses(BROKEN_869)).toThrow(
      PatchedBundleParseError
    );
  });

  it('surfaces the SyntaxError in the thrown message', () => {
    let caught: unknown;
    try {
      assertPatchedBundleParses(BROKEN_869);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PatchedBundleParseError);
    expect((caught as Error).message).toContain('SyntaxError');
  });

  it('does not leak the temp path or V8 stack into the message', () => {
    let caught: unknown;
    try {
      assertPatchedBundleParses('let a=;');
    } catch (err) {
      caught = err;
    }
    const message = (caught as Error).message;
    expect(message).not.toContain(os.tmpdir());
    expect(message).not.toContain('node:internal');
    expect(message).not.toMatch(/^\s+at /m);
  });

  it('does not throw when export/import/await appear inside string literals', () => {
    // The real bundle is CommonJS and carries these keywords inside minified
    // string/template literals. Parsing in CommonJS mode accepts them as the
    // plain strings they are; a naive keyword scan would false-positive.
    const keywordsInStrings =
      'const a = "export default await import(x)";\n' +
      'const b = `import ${a}`;\n' +
      'module.exports = { a, b };\n';
    expect(() => assertPatchedBundleParses(keywordsInStrings)).not.toThrow();
  });

  it('surfaces a bounded SyntaxError even when the break is on a very long line', () => {
    // Prompt-injection sites live on long minified lines. node --check writes
    // its diagnostic to stderr then exits; a piped stderr truncates before the
    // SyntaxError line, so the gate must capture stderr in a way that survives.
    const longBreak = 'var s = "' + 'x'.repeat(300 * 1024) + '"; let b=;\n';
    let caught: unknown;
    try {
      assertPatchedBundleParses(longBreak);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PatchedBundleParseError);
    const message = (caught as Error).message;
    expect(message).toContain('SyntaxError');
    expect(message.length).toBeLessThan(4000);
  });
});

describe('sanitizeParseError', () => {
  const TMP = '/tmp/tweakcc-parse-abc123/bundle.cjs';

  const syntaxStderr =
    `${TMP}:2\n` +
    'var out = `${l?`\\`${y}\\``:y}`;\n' +
    '                 ^\n' +
    '\n' +
    "SyntaxError: Unexpected identifier '$'\n" +
    '    at wrapSafe (node:internal/modules/cjs/loader:1804:18)\n' +
    '    at checkSyntax (node:internal/main/check_syntax:76:3)\n' +
    '\n' +
    'Node.js v24.18.0\n';

  it('keeps the error summary and drops path, stack, and version noise', () => {
    const out = sanitizeParseError(syntaxStderr, TMP);
    expect(out).toContain("SyntaxError: Unexpected identifier '$'");
    expect(out).not.toContain(TMP);
    expect(out).not.toContain('at wrapSafe');
    expect(out).not.toContain('node:internal');
    expect(out).not.toContain('Node.js v');
    expect(out.length).toBeGreaterThan(0);
  });

  it('drops node:internal lines from RangeError-class output', () => {
    const rangeStderr =
      'node:internal/modules/cjs/loader:1804\n' +
      '      throw err;\n' +
      '      ^\n' +
      '\n' +
      'RangeError: Maximum call stack size exceeded\n' +
      '    at wrapSafe (node:internal/modules/cjs/loader:1804:18)\n';
    const out = sanitizeParseError(rangeStderr, TMP);
    expect(out).toContain('RangeError');
    expect(out).not.toContain('node:internal');
  });

  it('never returns an empty message and never leaks the temp path', () => {
    expect(sanitizeParseError('', TMP).length).toBeGreaterThan(0);
    // stderr containing only the strippable path header must not fall through
    // to a raw echo of that path.
    const out = sanitizeParseError(`${TMP}:1\n`, TMP);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain(TMP);
  });

  it('caps the message when the source line is enormous', () => {
    const huge =
      `${TMP}:1\n` +
      'x'.repeat(300 * 1024) +
      '\n' +
      ' '.repeat(150 * 1024) +
      '^\n' +
      '\n' +
      'SyntaxError: Unexpected end of input\n';
    const out = sanitizeParseError(huge, TMP);
    expect(out).toContain('SyntaxError: Unexpected end of input');
    expect(out.length).toBeLessThan(4000);
    expect(out).not.toContain(TMP);
  });
});
