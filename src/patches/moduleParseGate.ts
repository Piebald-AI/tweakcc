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
 * Explicit resource management (`using x = …`, `await using x = …`) is valid
 * for Bun, which runs Claude Code, but `node --check` only accepts it from
 * Node 24. On an older host Node the declarations are checked as `const`
 * (same scoping), so the rest of the module is still verified. Comments may
 * separate `using` from the binding, as whitespace can.
 */
const USING_DECLARATION =
  /(?<![\w$.])(?:await\s+)?using((?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))+)(?=[A-Za-z_$][\w$]*\s*(?:=|of\b))/g;

let hostParsesUsing: boolean | undefined;

const nodeCheckFails = (file: string): string | null => {
  const errFile = `${file}.stderr`;
  const errFd = fsSync.openSync(errFile, 'w');
  try {
    execFileSync(process.execPath, ['--check', file], {
      stdio: ['ignore', 'ignore', errFd],
      timeout: PARSE_CHECK_TIMEOUT_MS,
    });
    return null;
  } catch (error) {
    // Not a syntax verdict (timeout, spawn failure): let the caller warn.
    if (typeof (error as { status?: unknown }).status !== 'number') throw error;
  } finally {
    fsSync.closeSync(errFd);
  }
  return (
    fsSync
      .readFileSync(errFile, 'utf8')
      .split('\n')
      .find(line => /^\w*Error\b/.test(line.trim()))
      ?.trim() ?? 'SyntaxError'
  );
};

/** The first parse error of `source` under each module goal, or null if either parses. */
const parseErrors = (dir: string, source: string): string[] | null => {
  if (hostParsesUsing === undefined) {
    const probe = path.join(dir, 'probe.mjs');
    fsSync.writeFileSync(probe, 'async function f(){await using r=null}');
    hostParsesUsing = nodeCheckFails(probe) === null;
  }
  const checked = hostParsesUsing
    ? source
    : source.replace(USING_DECLARATION, 'const$1');
  const diagnostics: string[] = [];
  for (const ext of ['mjs', 'cjs'] as const) {
    const file = path.join(dir, `module.${ext}`);
    fsSync.writeFileSync(file, checked, 'utf8');
    const message = nodeCheckFails(file);
    if (message === null) return null;
    diagnostics.push(`${ext === 'mjs' ? 'as ESM' : 'as CommonJS'}: ${message}`);
  }
  return diagnostics;
};

/**
 * Syntax-checks one patched Bun module with `node --check` before anything is
 * repacked. Code-split native builds are ES modules (cross-chunk `import`s,
 * top-level `await`), older ones CommonJS, so the module is checked under the
 * ESM goal first and then the CommonJS goal; it passes if either parses. Only
 * syntax is checked: imports are not resolved, nothing is executed.
 *
 * If the unpatched module (`original`) does not parse either, this Node cannot
 * judge it (Claude Code may use syntax newer than the host Node), so the check
 * warns and is skipped instead of blocking a valid apply.
 *
 * An operational problem (unwritable temp dir, timeout, spawn failure) warns
 * and skips the check rather than blocking an otherwise valid apply.
 */
export const assertPatchedModuleParses = (
  moduleName: string,
  source: string,
  original?: () => string | undefined
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
    const diagnostics = parseErrors(dir, source);
    if (diagnostics === null) return;
    const unpatched = original?.();
    if (unpatched !== undefined && parseErrors(dir, unpatched) !== null) {
      console.warn(
        chalk.yellow(
          `Warning: Node ${process.version} cannot parse the unpatched ${moduleName}; skipping its parse check. Use Node 24 or newer for a full check.`
        )
      );
      return;
    }
    throw new PatchedModuleParseError(moduleName, diagnostics.join('\n'));
  } catch (error) {
    if (error instanceof PatchedModuleParseError) throw error;
    console.warn(
      chalk.yellow(
        `Warning: the parse check for ${moduleName} could not run (${String(error)}); skipping it.`
      )
    );
  } finally {
    fsSync.rmSync(dir, { recursive: true, force: true });
  }
};
