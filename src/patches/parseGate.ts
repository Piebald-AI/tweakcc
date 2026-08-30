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
const PARSE_CHECK_TIMEOUT_MS = 30_000;

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
 * Distinguishes a genuine `node --check` parse failure (the process ran and
 * exited with a non-zero status) from an operational failure (timeout, signal
 * kill, or spawn failure), which leave `status` null.
 */
export const isParseFailureExit = (err: unknown): boolean =>
  err != null && typeof (err as { status?: unknown }).status === 'number';

/**
 * `node --check` diagnostics that indicate the wrong module goal rather than a
 * broken bundle. Older CC native builds bundle as CommonJS (`@bun-cjs`), but
 * newer multi-chunk builds (observed on 2.1.245) extract an ESM entry chunk
 * that begins with cross-chunk `import` statements. Parsed as CommonJS, such a
 * bundle always fails with one of these diagnostics — unpatched or not — so
 * they signal "retry under the ESM goal", never "the bundle is broken".
 */
const ESM_GOAL_DIAGNOSTICS = [
  'Cannot use import statement outside a module',
  "Unexpected token 'export'",
  "Cannot use 'import.meta' outside a module",
] as const;

/**
 * Parses the fully-patched bundle with `node --check` and throws
 * PatchedBundleParseError if it does not parse. The bundle may be CommonJS
 * (older `@bun-cjs` native builds) or ESM (newer multi-chunk builds), so the
 * temp file uses an explicit extension to pin the module goal regardless of any
 * ambient package.json "type": the check runs under CommonJS first and, only
 * when that fails to parse, retries under the ESM goal. A bundle that parses
 * under either goal passes; only failing both is a parse failure, and the
 * reported diagnostic comes from the goal the bundle actually targets (a
 * CommonJS goal-mismatch message would point at a healthy `import` statement).
 * A real parser is used rather than `new Function` / `vm.compileFunction`,
 * which impose a bare function-body context that diverges from module parsing.
 * `node --check` writes its diagnostic to stderr and then exits, which
 * truncates a piped stderr on long lines, so stderr is captured to a file. The
 * check is bounded by a timeout. Only a genuine non-zero exit is treated as a
 * parse failure; a timeout, signal, spawn failure, or an unwritable temp file
 * warns and skips the check, so an operational problem never blocks an
 * otherwise-valid apply.
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

  try {
    const check = (ext: 'cjs' | 'mjs') => {
      const tmpFile = path.join(dir, `bundle.${ext}`);
      const errFile = path.join(dir, `stderr-${ext}.txt`);
      let errFd: number;
      try {
        fsSync.writeFileSync(tmpFile, content, 'utf8');
        errFd = fsSync.openSync(errFile, 'w');
      } catch (err) {
        return {
          tmpFile,
          parseFailed: false,
          operationalFailure: String(err),
          stderr: '',
        };
      }
      let parseFailed = false;
      let operationalFailure: string | null = null;
      try {
        execFileSync(process.execPath, ['--check', tmpFile], {
          stdio: ['ignore', 'ignore', errFd],
          timeout: PARSE_CHECK_TIMEOUT_MS,
        });
      } catch (err) {
        if (isParseFailureExit(err)) {
          parseFailed = true;
        } else {
          operationalFailure = String(err);
        }
      } finally {
        fsSync.closeSync(errFd);
      }
      let stderr = '';
      try {
        stderr = fsSync.readFileSync(errFile, 'utf8');
      } catch {
        // The sanitizer synthesizes a message when stderr is unavailable.
      }
      return { tmpFile, parseFailed, operationalFailure, stderr };
    };

    const warnOperational = (description: string): void => {
      console.warn(
        chalk.yellow(
          `Warning: the parse check could not run to completion (${description}); skipping it.`
        )
      );
    };

    const asCjs = check('cjs');
    if (asCjs.operationalFailure !== null) {
      warnOperational(asCjs.operationalFailure);
      return;
    }
    if (!asCjs.parseFailed) {
      return;
    }

    // CommonJS parsing failed. If the bundle targets the ESM goal, that is the
    // expected outcome rather than a patching regression, so retry under the
    // ESM goal before declaring the bundle broken.
    const asMjs = check('mjs');
    if (asMjs.operationalFailure !== null) {
      warnOperational(asMjs.operationalFailure);
      return;
    }
    if (!asMjs.parseFailed) {
      return;
    }

    const goalMismatch = ESM_GOAL_DIAGNOSTICS.some(diagnostic =>
      asCjs.stderr.includes(diagnostic)
    );
    const failure = goalMismatch ? asMjs : asCjs;
    throw new PatchedBundleParseError(
      sanitizeParseError(failure.stderr, failure.tmpFile)
    );
  } finally {
    try {
      fsSync.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the temp directory.
    }
  }
};
