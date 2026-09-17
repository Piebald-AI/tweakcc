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
 * Temp-file extension per parse mode. `node --check` chooses its goal symbol
 * (Module vs Script) from the file extension alone, and the two are mutually
 * exclusive: `.cjs` rejects a top-level `import` with "Cannot use import
 * statement outside a module", while `.mjs` rejects CommonJS-only syntax such
 * as `var await = 1` as a reserved word. Neither extension can validate both
 * bundle shapes, which is why the gate tries both rather than pinning one.
 */
const MODE_EXTENSIONS = { module: 'mjs', commonjs: 'cjs' } as const;

type ParseMode = keyof typeof MODE_EXTENSIONS;

/**
 * Guesses whether the bundle is an ES module by looking for a top-level
 * `import`/`export` statement — one at the very start of the file, or after a
 * `;`/`}`/newline, which is where a minified bundle's statement boundaries are.
 *
 * This is a heuristic and it is allowed to be wrong. Claude Code's bundle
 * embeds JavaScript source as string payloads, so a `;import{` sequence can
 * appear inside a string literal and fool it. That costs nothing but ordering:
 * the caller tries the other mode too and only reports a failure when both
 * reject the bundle, so a misdetected bundle still passes the gate. Keep it
 * that way — do not let this predicate become load-bearing.
 *
 * A dynamic `import(...)` is deliberately not counted: it is legal in CommonJS
 * and is common in bundles that are otherwise plain CJS.
 */
export const looksLikeEsModule = (content: string): boolean =>
  /(?:^|[\n;}])\s*(?:import[\s{*'"]|export[\s{*])/.test(content);

/**
 * Outcome of one `node --check` run. `skipped` means the check could not be
 * performed at all (unwritable temp file, spawn failure, timeout) and must not
 * be reported to the user as a broken bundle.
 */
type ParseAttempt =
  | { outcome: 'parsed' }
  | { outcome: 'failed'; stderr: string; tmpFile: string }
  | { outcome: 'skipped'; reason: string };

/**
 * Runs `node --check` over `content` in one parse mode. A real parser is used
 * rather than `new Function` / `vm.compileFunction`, which impose a bare
 * function-body context that diverges from module parsing. `node --check`
 * writes its diagnostic to stderr and then exits, which truncates a piped
 * stderr on long lines, so stderr is captured to a file. The run is bounded by
 * a timeout.
 */
const runParseCheck = (
  dir: string,
  content: string,
  mode: ParseMode
): ParseAttempt => {
  const tmpFile = path.join(dir, `bundle.${MODE_EXTENSIONS[mode]}`);
  const errFile = path.join(dir, `stderr-${mode}.txt`);

  try {
    fsSync.writeFileSync(tmpFile, content, 'utf8');
  } catch (err) {
    return {
      outcome: 'skipped',
      reason: `could not write the patched bundle for verification (${String(err)})`,
    };
  }

  let errFd: number;
  try {
    errFd = fsSync.openSync(errFile, 'w');
  } catch (err) {
    return {
      outcome: 'skipped',
      reason: `could not open a temp file to verify the patched bundle (${String(err)})`,
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

  if (operationalFailure !== null) {
    return {
      outcome: 'skipped',
      reason: `the parse check could not run to completion (${operationalFailure})`,
    };
  }

  if (!parseFailed) return { outcome: 'parsed' };

  let stderr = '';
  try {
    stderr = fsSync.readFileSync(errFile, 'utf8');
  } catch {
    // The sanitizer synthesizes a message when stderr is unavailable.
  }
  return { outcome: 'failed', stderr, tmpFile };
};

/**
 * Parses the fully-patched bundle and throws PatchedBundleParseError if it does
 * not parse.
 *
 * The bundle's module kind is not fixed: an npm install's `cli.js` is an ES
 * module (Claude Code has shipped `"type": "module"` since v1.0.20), while a
 * Bun-compiled native install is CommonJS (`@bun-cjs`). Since `node --check`
 * derives its goal symbol from the file extension and the two goal symbols
 * reject each other's syntax, the gate checks the mode the bundle looks like
 * first and falls back to the other, treating the bundle as valid if either
 * accepts it. Pinning `.cjs` failed every ESM install with "Cannot use import
 * statement outside a module" (#981); pinning `.mjs` would fail the CommonJS
 * ones just as reliably.
 *
 * When both modes reject the bundle it is genuinely broken, and the diagnostic
 * reported is the one from the mode the bundle resembles, since that is the
 * error a reader can act on.
 *
 * Only a genuine non-zero exit is treated as a parse failure; a timeout, signal,
 * spawn failure, or an unwritable temp file warns and skips the check, so an
 * operational problem never blocks an otherwise-valid apply.
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
    const modes: ParseMode[] = looksLikeEsModule(content)
      ? ['module', 'commonjs']
      : ['commonjs', 'module'];

    // The first attempt's diagnostic is the one worth showing: its mode matches
    // the bundle's apparent shape, so its error points at the real break rather
    // than at the mode mismatch the fallback exists to absorb.
    let firstFailure: { stderr: string; tmpFile: string } | null = null;

    for (const mode of modes) {
      const attempt = runParseCheck(dir, content, mode);

      if (attempt.outcome === 'parsed') return;

      if (attempt.outcome === 'skipped') {
        // The environment, not the bundle, is at fault. Trying the other mode
        // would hit the same wall, so warn once and let the apply proceed.
        console.warn(
          chalk.yellow(`Warning: ${attempt.reason}; skipping the parse check.`)
        );
        return;
      }

      firstFailure ??= { stderr: attempt.stderr, tmpFile: attempt.tmpFile };
    }

    // Unreachable unless every mode failed, which the loop above guarantees
    // populates; the guard keeps a future third mode from throwing a null.
    if (firstFailure === null) return;

    throw new PatchedBundleParseError(
      sanitizeParseError(firstFailure.stderr, firstFailure.tmpFile)
    );
  } finally {
    try {
      fsSync.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the temp directory.
    }
  }
};
