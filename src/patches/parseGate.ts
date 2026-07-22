import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import chalk from 'chalk';

export class PatchedBundleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchedBundleParseError';
  }
}

const MAX_MESSAGE = 2000;
const EXCERPT_RADIUS = 160;

/**
 * Reduces `node --check` stderr to the error summary and a bounded,
 * caret-centered source excerpt, dropping the temp-file path, V8 stack frames,
 * `node:internal` frames, and the Node version footer. Always returns a
 * non-empty message that never contains the temp path, and caps the length so a
 * corrupted long minified line cannot dump the whole line.
 */
export const sanitizeParseError = (stderr: string, tmpFile: string): string => {
  const lines = stderr.split('\n');

  const isNoise = (line: string): boolean =>
    line.includes(tmpFile) ||
    /^\s+at\s/.test(line) ||
    /^node:internal\//.test(line) ||
    /^Node\.js v/.test(line);

  const summary = lines.find(l => /^[A-Za-z]\w*Error\b.*:/.test(l))?.trim();

  const caretIdx = lines.findIndex(l => /^\s*\^+\s*$/.test(l));
  let excerpt = '';
  if (caretIdx > 0) {
    const source = lines[caretIdx - 1];
    const caret = lines[caretIdx];
    if (!isNoise(source)) {
      const col = caret.indexOf('^');
      if (source.length <= EXCERPT_RADIUS * 2) {
        excerpt = `${source}\n${caret}`;
      } else {
        const start = Math.max(0, col - EXCERPT_RADIUS);
        const end = Math.min(source.length, col + EXCERPT_RADIUS);
        const prefix = start > 0 ? '… ' : '';
        const suffix = end < source.length ? ' …' : '';
        const newCaretCol = prefix.length + (col - start);
        excerpt = `${prefix}${source.slice(start, end)}${suffix}\n${' '.repeat(newCaretCol)}^`;
      }
    }
  }

  let message = [excerpt, summary].filter(Boolean).join('\n\n').trim();

  if (message.length === 0) {
    message = lines
      .filter(l => !isNoise(l))
      .join('\n')
      .split(tmpFile)
      .join('<bundle>')
      .trim();
  }

  if (message.length === 0) {
    message =
      'The bundle failed to parse (node --check produced no diagnostic).';
  }

  return message.length > MAX_MESSAGE
    ? `${message.slice(0, MAX_MESSAGE)} …`
    : message;
};

/**
 * Parses the fully-patched bundle with `node --check` and throws
 * PatchedBundleParseError if it does not parse. The bundle is CommonJS
 * (`@bun-cjs`), so the temp file uses a `.cjs` extension to pin CommonJS parsing
 * regardless of any ambient package.json "type". A real parser is used rather
 * than `new Function` / `vm.compileFunction`, which impose a bare function-body
 * context that diverges from module parsing. `node --check` writes its
 * diagnostic to stderr and then exits, which truncates a piped stderr on long
 * lines, so stderr is captured to a file. If the temp file cannot be created or
 * written the check is skipped: the gate only adds safety, so an unusable
 * tmpdir must not block an otherwise-valid apply.
 */
export const assertPatchedBundleParses = (content: string): void => {
  let dir: string;
  try {
    dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'tweakcc-parse-'));
  } catch (err) {
    console.warn(
      chalk.yellow(
        `Warning: could not create a temp file to verify the patched bundle (${String(err)}); skipping the parse check.`
      )
    );
    return;
  }

  const tmpFile = path.join(dir, 'bundle.cjs');
  const errFile = path.join(dir, 'stderr.txt');
  try {
    try {
      fsSync.writeFileSync(tmpFile, content, 'utf8');
    } catch (err) {
      console.warn(
        chalk.yellow(
          `Warning: could not write the patched bundle for verification (${String(err)}); skipping the parse check.`
        )
      );
      return;
    }

    const errFd = fsSync.openSync(errFile, 'w');
    let parseFailed = false;
    try {
      execFileSync(process.execPath, ['--check', tmpFile], {
        stdio: ['ignore', 'ignore', errFd],
      });
    } catch {
      parseFailed = true;
    } finally {
      fsSync.closeSync(errFd);
    }

    if (parseFailed) {
      let stderr = '';
      try {
        stderr = fsSync.readFileSync(errFile, 'utf8');
      } catch {
        // The sanitizer synthesizes a message when stderr is unavailable.
      }
      throw new PatchedBundleParseError(sanitizeParseError(stderr, tmpFile));
    }
  } finally {
    try {
      fsSync.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the temp directory.
    }
  }
};
