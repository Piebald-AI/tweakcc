import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import chalk from 'chalk';

/** A patched module that no longer parses; nothing has been written yet. */
export class PatchedModuleParseError extends Error {
  constructor(
    public readonly moduleName: string,
    public readonly diagnostic: string
  ) {
    super(
      `Patched module ${moduleName} failed to parse; Claude Code was left unmodified.\n${diagnostic}`
    );
    this.name = 'PatchedModuleParseError';
  }
}

const PARSE_CHECK_TIMEOUT_MS = 60_000;

/**
 * Syntax-checks one patched Bun module with `node --check` before anything is
 * repacked. Code-split native builds are ES modules (cross-chunk `import`s,
 * top-level `await`), older ones CommonJS, so the module is checked under the
 * ESM goal first and then the CommonJS goal; it passes if either parses. Only
 * syntax is checked: imports are not resolved, nothing is executed.
 *
 * An operational problem (unwritable temp dir, timeout, spawn failure) warns
 * and skips the check rather than blocking an otherwise valid apply.
 */
export const assertPatchedModuleParses = (
  moduleName: string,
  source: string
): void => {
  let dir: string;
  try {
    dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'tweakcc-parse-'));
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: could not create a temp dir to verify ${moduleName} (${String(error)}); skipping its parse check.`
      )
    );
    return;
  }

  try {
    const diagnostics: string[] = [];
    for (const ext of ['mjs', 'cjs'] as const) {
      const file = path.join(dir, `module.${ext}`);
      const errFile = path.join(dir, `stderr-${ext}.txt`);
      fsSync.writeFileSync(file, source, 'utf8');
      const errFd = fsSync.openSync(errFile, 'w');
      try {
        execFileSync(process.execPath, ['--check', file], {
          stdio: ['ignore', 'ignore', errFd],
          timeout: PARSE_CHECK_TIMEOUT_MS,
        });
        return;
      } catch (error) {
        if (typeof (error as { status?: unknown }).status !== 'number') {
          console.warn(
            chalk.yellow(
              `Warning: the parse check for ${moduleName} could not run (${String(error)}); skipping it.`
            )
          );
          return;
        }
      } finally {
        fsSync.closeSync(errFd);
      }
      const stderr = fsSync.readFileSync(errFile, 'utf8');
      const message =
        stderr
          .split('\n')
          .find(line => /^\w*Error\b/.test(line.trim()))
          ?.trim() ?? 'SyntaxError';
      diagnostics.push(
        `${ext === 'mjs' ? 'as ESM' : 'as CommonJS'}: ${message}`
      );
    }
    throw new PatchedModuleParseError(moduleName, diagnostics.join('\n'));
  } finally {
    fsSync.rmSync(dir, { recursive: true, force: true });
  }
};
