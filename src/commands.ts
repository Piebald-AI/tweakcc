/**
 * CLI Subcommand Handlers
 *
 * Implements: unpack, repack, adhoc-patch subcommands.
 */

import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';
import { spawn, execSync } from 'node:child_process';

import chalk from 'chalk';

import { formatAndDiff } from './formatAndDiff';

import { tryDetectInstallation } from './lib/detection';
import { readContent, writeContent } from './lib/content';
import { Installation } from './lib/types';
import {
  findChalkVar,
  getModuleLoaderFunction,
  getReactVar,
  getRequireFuncName,
  findTextComponent,
  findBoxComponent,
  clearCaches,
} from './patches/helpers';

// =============================================================================
// Diff Approval
// =============================================================================

function askYesNo(prompt: string): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(value);
    };

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    rl.on('close', () => settle(false));
    rl.on('SIGINT', () => settle(false));

    rl.question(prompt, answer => {
      const trimmed = answer.trim().toLowerCase();
      settle(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
    });
  });
}

function renderDiffToConsole(
  hunks: { oldStart: number; newStart: number; lines: string[] }[]
): void {
  for (const hunk of hunks) {
    console.log(chalk.cyan(`@@ -${hunk.oldStart} +${hunk.newStart} @@`));
    for (const line of hunk.lines) {
      if (line.startsWith('+')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-')) {
        console.log(chalk.red(line));
      } else {
        console.log(chalk.gray(line));
      }
    }
    console.log();
  }
}

export async function promptUserForDiffApproval(
  originalJs: string,
  modifiedJs: string,
  skipConfirmation = false
): Promise<boolean> {
  if (skipConfirmation) return true;

  console.log(chalk.gray('Formatting for diff preview...'));

  const result = await formatAndDiff(originalJs, modifiedJs, {
    contextLines: 10,
  });

  if (!result) {
    console.log(
      chalk.yellow(
        'Could not generate formatted diff (oxfmt unavailable or parse error).'
      )
    );
    return askYesNo(chalk.bold('\nApply changes without diff preview? [Y/n] '));
  }

  if (result.changeCount === 0) {
    console.log(
      chalk.yellow('No visible differences after formatting. Proceeding.')
    );
    return true;
  }

  console.log(
    chalk.gray(
      `Formatted ${result.formattedLines.toLocaleString()} lines in ${result.timings.formatMs.toFixed(0)}ms\n`
    )
  );

  renderDiffToConsole(result.hunks);

  console.log(
    chalk.gray(
      `${result.changeCount} change(s) across ${result.formattedLines.toLocaleString()} formatted lines (${result.timings.totalMs.toFixed(0)}ms)`
    )
  );

  return askYesNo(chalk.bold('\nApply these changes? [Y/n] '));
}

// =============================================================================
// Pre-resolved Variables for Scripts
// =============================================================================

/**
 * Pre-resolved minified variable names from Claude Code's JS content.
 * These are passed into adhoc-patch scripts as `vars` so script authors
 * don't need to run detection functions themselves (which they can't,
 * since scripts run in a sandbox with no access to tweakcc modules).
 */
interface ResolvedVars {
  /** The chalk instance variable name, e.g. "Ke" */
  chalkVar: string | undefined;
  /** The module loader function name, e.g. "T" */
  moduleLoaderFunction: string | undefined;
  /** The React variable name, e.g. "fH" */
  reactVar: string | undefined;
  /** The require function name — "require" for Bun, or a variable name for esbuild */
  requireFuncName: string;
  /** The Ink Text component function name */
  textComponent: string | undefined;
  /** The Ink Box component function name */
  boxComponent: string | undefined;
}

/**
 * Resolve all helper variables from the content.
 * Clears caches first to ensure fresh results.
 */
function resolveVars(content: string): ResolvedVars {
  clearCaches();
  return {
    chalkVar: findChalkVar(content),
    moduleLoaderFunction: getModuleLoaderFunction(content),
    reactVar: getReactVar(content),
    requireFuncName: getRequireFuncName(content),
    textComponent: findTextComponent(content),
    boxComponent: findBoxComponent(content),
  };
}

// =============================================================================
// Sandboxed Script Execution
// =============================================================================

/**
 * Executes a patch script in a sandboxed Node.js process.
 *
 * The script is run as `new Function('code', 'vars', script)` where:
 * - `code` is the JavaScript content of the Claude Code installation
 * - `vars` is an object containing pre-resolved minified variable names
 *   (chalkVar, reactVar, requireFuncName, textComponent, boxComponent, etc.)
 *
 * The script must return the modified JavaScript content.
 *
 * The sandbox uses Node's permission model with no grants, meaning the script
 * cannot read/write files, make network calls, or spawn child processes.
 *
 * Compatibility: tries `--permission` first (Node 24+), falls back to
 * `--experimental-permission` (Node 20–23). If neither is recognised the
 * user is told to upgrade to Node 20+ or rerun with
 * `--dangerous-no-script-sandbox`.
 *
 * When `noSandbox` is true the script runs without any permission flag at all
 * (useful for Node < 20 where neither flag exists).
 *
 * @param script - The script body to execute
 * @param inputCode - The JavaScript content to pass as the `code` parameter
 * @param vars - Pre-resolved minified variable names
 * @param noSandbox - If true, skip the permission sandbox entirely
 * @returns The modified JavaScript content returned by the script
 */
async function runSandboxedScript(
  script: string,
  inputCode: string,
  vars: ResolvedVars,
  noSandbox = false
): Promise<string> {
  const wrapper = `
    let input = '';
    process.stdin.on('data', c => input += c);
    process.stdin.on('end', async () => {
      try {
        const vars = ${JSON.stringify(vars)};
        process.env = {};
        const fn = new Function('js', 'vars', ${JSON.stringify(script)});
        const result = await fn(input, vars);
        process.stdout.write(JSON.stringify({"r": result}));
      } catch (e) {
        process.stderr.write(e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
      }
    });
  `;

  if (noSandbox) {
    return spawnNodeWithWrapper([], wrapper, inputCode);
  }

  // Try --permission first (Node 24+)
  try {
    return await spawnNodeWithWrapper(['--permission'], wrapper, inputCode);
  } catch (error) {
    if (isBadOptionError(error)) {
      // Fall through to try the older flag
    } else {
      throw error;
    }
  }

  // Try --experimental-permission (Node 20–23)
  try {
    return await spawnNodeWithWrapper(
      ['--experimental-permission'],
      wrapper,
      inputCode
    );
  } catch (error) {
    if (isBadOptionError(error)) {
      // Neither flag works — the Node version is too old
      const nodeVersion = getNodeVersion();
      throw new Error(
        `Your Node.js version (${nodeVersion}) does not support the permission model.\n` +
          'Please either upgrade to Node.js 20+ or rerun with --dangerous-no-script-sandbox.'
      );
    }
    throw error;
  }
}

/**
 * Returns true when an error from a spawned node process indicates that a CLI
 * flag was not recognised ("bad option").
 */
function isBadOptionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('bad option');
}

/**
 * Gets the current Node.js version string (e.g. "v18.17.0").
 */
function getNodeVersion(): string {
  try {
    return execSync('node --version', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Spawns a node process with the given extra CLI flags, feeds `inputCode` on
 * stdin, and resolves with the JSON-wrapped result from stdout.
 */
function spawnNodeWithWrapper(
  extraArgs: string[],
  wrapper: string,
  inputCode: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [...extraArgs, '-e', wrapper], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d));
    child.stderr.on('data', (d: Buffer) => (stderr += d));

    child.on('error', reject);
    child.stdin.on('error', () => {});

    child.on('close', code => {
      if (code !== 0)
        reject(new Error(stderr || `Script exited with code ${code}`));
      else {
        try {
          resolve(JSON.parse(stdout).r);
        } catch {
          reject(
            new Error(
              `Script returned invalid JSON output.\nstdout: ${stdout}\nstderr: ${stderr}`
            )
          );
        }
      }
    });

    child.stdin.write(inputCode);
    child.stdin.end();
  });
}

// =============================================================================
// Helper: Resolve Script Source
// =============================================================================

/**
 * Resolves the script source from a --script argument.
 *
 * - If it starts with `@`, the rest is treated as a file path or URL.
 *   - If it starts with `http://` or `https://`, it's fetched as a URL.
 *   - Otherwise, it's read as a local file.
 * - Otherwise, the argument itself is the script body.
 */
async function resolveScriptSource(scriptArg: string): Promise<string> {
  if (!scriptArg.startsWith('@')) {
    return scriptArg;
  }

  const ref = scriptArg.slice(1);

  if (ref.startsWith('http://') || ref.startsWith('https://')) {
    console.log(`Fetching script from ${ref}...`);
    const response = await fetch(ref);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch script from ${ref}: HTTP ${response.status} ${response.statusText}`
      );
    }
    return response.text();
  }

  console.log(`Reading script from ${ref}...`);
  return fs.readFile(ref, 'utf8');
}

// =============================================================================
// Helper: Resolve Installation
// =============================================================================

/**
 * Resolves an installation from an optional path argument.
 * Wraps tryDetectInstallation with consistent error handling.
 */
async function resolveInstallation(pathArg?: string): Promise<Installation> {
  try {
    return await tryDetectInstallation({
      path: pathArg,
      interactive: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}

// =============================================================================
// Subcommand: unpack
// =============================================================================

/**
 * Extract JS from a native Claude Code binary and write it to a file.
 *
 * @param outputJsPath - Path to write the extracted JS
 * @param binaryPath - Optional path to the native binary (auto-detect if omitted)
 */
export async function handleUnpack(
  outputJsPath: string,
  binaryPath?: string
): Promise<void> {
  const installation = await resolveInstallation(binaryPath);

  if (installation.kind === 'npm') {
    console.error(
      chalk.red(
        'Error: Cannot unpack an npm-based installation (cli.js). Only native binaries can be unpacked.'
      )
    );
    console.error(
      chalk.gray(
        `  Detected installation: ${installation.path} (npm-based, v${installation.version})`
      )
    );
    process.exit(1);
  }

  console.log(
    `Extracting JS from native binary: ${chalk.cyan(installation.path)} (v${installation.version})`
  );

  const content = await readContent(installation);

  await fs.writeFile(outputJsPath, content, 'utf8');

  console.log(
    chalk.green(`✓ Extracted JS written to ${chalk.cyan(outputJsPath)}`)
  );
  console.log(
    chalk.gray(`  ${content.length.toLocaleString()} characters written`)
  );
}

// =============================================================================
// Subcommand: repack
// =============================================================================

/**
 * Read JS from a file and embed it back into a native Claude Code binary.
 *
 * @param inputJsPath - Path to the JS file to embed
 * @param binaryPath - Optional path to the native binary (auto-detect if omitted)
 */
export async function handleRepack(
  inputJsPath: string,
  binaryPath?: string
): Promise<void> {
  const installation = await resolveInstallation(binaryPath);

  if (installation.kind === 'npm') {
    console.error(
      chalk.red(
        'Error: Cannot repack into an npm-based installation (cli.js). Only native binaries can be repacked.'
      )
    );
    console.error(
      chalk.gray(
        `  Detected installation: ${installation.path} (npm-based, v${installation.version})`
      )
    );
    process.exit(1);
  }

  console.log(
    `Repacking JS into native binary: ${chalk.cyan(installation.path)} (v${installation.version})`
  );

  const newJs = await fs.readFile(inputJsPath, 'utf8');
  const currentJs = await readContent(installation);

  const approved = await promptUserForDiffApproval(currentJs, newJs);
  if (!approved) {
    console.log(chalk.yellow('Aborted.'));
    return;
  }

  await writeContent(installation, newJs);

  console.log(
    chalk.green(
      `✓ JS from ${chalk.cyan(inputJsPath)} repacked into ${chalk.cyan(installation.path)}`
    )
  );
}

// =============================================================================
// Subcommand: adhoc-patch
// =============================================================================

/**
 * Apply a string replacement patch.
 */
async function handleAdhocPatchString(
  oldString: string,
  newString: string,
  index: number | undefined,
  installation: Installation,
  skipConfirmation = false
): Promise<void> {
  const content = await readContent(installation);

  let modified: string;
  let count: number;

  if (index !== undefined) {
    // Replace only the Nth occurrence (1-based)
    const occurrences: number[] = [];
    let pos = 0;
    while (true) {
      const found = content.indexOf(oldString, pos);
      if (found === -1) break;
      occurrences.push(found);
      pos = found + oldString.length;
    }

    if (occurrences.length === 0) {
      console.error(chalk.red('Error: String not found in content.'));
      process.exit(1);
    }

    if (index < 1 || index > occurrences.length) {
      console.error(
        chalk.red(
          `Error: Index ${index} is out of range. Found ${occurrences.length} occurrence(s).`
        )
      );
      process.exit(1);
    }

    const replaceAt = occurrences[index - 1];
    modified =
      content.slice(0, replaceAt) +
      newString +
      content.slice(replaceAt + oldString.length);
    count = 1;
  } else {
    // Replace all occurrences
    // Use split/join for literal string replacement (no regex escaping needed)
    const parts = content.split(oldString);
    count = parts.length - 1;

    if (count === 0) {
      console.error(chalk.red('Error: String not found in content.'));
      process.exit(1);
    }

    modified = parts.join(newString);
  }

  const approved = await promptUserForDiffApproval(
    content,
    modified,
    skipConfirmation
  );
  if (!approved) {
    console.log(chalk.yellow('Aborted.'));
    return;
  }

  await writeContent(installation, modified);

  console.log(
    chalk.green(
      `✓ Replaced ${count} occurrence(s) in ${chalk.cyan(installation.path)}`
    )
  );
}

/**
 * Parse a regex string in /pattern/flags format.
 * If no delimiters are present, treats the entire string as the pattern with no flags.
 *
 * Examples:
 *   "/cl([a-z0-9]+)de/i"  → { pattern: "cl([a-z0-9]+)de", flags: "i" }
 *   "/foo\\/bar/"          → { pattern: "foo\\/bar", flags: "" }
 *   "foo.*bar"             → { pattern: "foo.*bar", flags: "" }
 */
function parseRegexLiteral(input: string): { pattern: string; flags: string } {
  if (input.startsWith('/')) {
    // Find the last / that isn't escaped
    let lastSlash = -1;
    for (let i = input.length - 1; i > 0; i--) {
      if (input[i] === '/') {
        // Check it's not escaped (count preceding backslashes)
        let backslashes = 0;
        for (let j = i - 1; j >= 0 && input[j] === '\\'; j--) {
          backslashes++;
        }
        if (backslashes % 2 === 0) {
          lastSlash = i;
          break;
        }
      }
    }

    if (lastSlash > 0) {
      const pattern = input.slice(1, lastSlash);
      const flags = input.slice(lastSlash + 1);

      // Validate flags
      const validFlags = /^[gimsuy]*$/;
      if (!validFlags.test(flags)) {
        throw new Error(
          `Invalid regex flags: "${flags}". Valid flags are: g, i, m, s, u, y`
        );
      }

      return { pattern, flags };
    }
  }

  // No /.../ delimiters — treat as raw pattern with no flags
  return { pattern: input, flags: '' };
}

/**
 * Apply a regex replacement patch.
 */
async function handleAdhocPatchRegex(
  rawPattern: string,
  replacement: string,
  index: number | undefined,
  installation: Installation,
  skipConfirmation = false
): Promise<void> {
  const content = await readContent(installation);

  let parsed: { pattern: string; flags: string };
  try {
    parsed = parseRegexLiteral(rawPattern);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }

  // Ensure 'g' flag is present for matchAll / replaceAll
  const flags = parsed.flags.includes('g') ? parsed.flags : parsed.flags + 'g';

  let modified: string;
  let count: number;

  const regex = new RegExp(parsed.pattern, flags);

  if (index !== undefined) {
    // Replace only the Nth match (1-based)
    const matches = [...content.matchAll(regex)];

    if (matches.length === 0) {
      console.error(chalk.red('Error: Regex pattern not found in content.'));
      process.exit(1);
    }

    if (index < 1 || index > matches.length) {
      console.error(
        chalk.red(
          `Error: Index ${index} is out of range. Found ${matches.length} match(es).`
        )
      );
      process.exit(1);
    }

    const match = matches[index - 1];
    const matchStart = match.index!;
    const matchEnd = matchStart + match[0].length;

    // Build the replacement string with group substitutions
    const resolvedReplacement = match[0].replace(
      new RegExp(parsed.pattern, parsed.flags),
      replacement
    );

    modified =
      content.slice(0, matchStart) +
      resolvedReplacement +
      content.slice(matchEnd);
    count = 1;
  } else {
    // Replace all matches
    modified = content.replace(regex, replacement);
    // Count matches
    count = [...content.matchAll(new RegExp(parsed.pattern, flags))].length;

    if (count === 0) {
      console.error(chalk.red('Error: Regex pattern not found in content.'));
      process.exit(1);
    }
  }

  const approved = await promptUserForDiffApproval(
    content,
    modified,
    skipConfirmation
  );
  if (!approved) {
    console.log(chalk.yellow('Aborted.'));
    return;
  }

  await writeContent(installation, modified);

  console.log(
    chalk.green(
      `✓ Replaced ${count} match(es) in ${chalk.cyan(installation.path)}`
    )
  );
}

/**
 * Apply a script-based patch.
 */
async function handleAdhocPatchScriptImpl(
  scriptArg: string,
  installation: Installation,
  skipConfirmation = false,
  dangerousNoScriptSandbox = false
): Promise<void> {
  const content = await readContent(installation);

  const script = await resolveScriptSource(scriptArg);

  console.log('Resolving variables...');
  const vars = resolveVars(content);

  console.log(
    dangerousNoScriptSandbox
      ? 'Running patch script WITHOUT sandbox (--dangerous-no-script-sandbox)...'
      : 'Running patch script in sandbox...'
  );
  let modified: string;
  try {
    modified = await runSandboxedScript(
      script,
      content,
      vars,
      dangerousNoScriptSandbox
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: Script execution failed:`));
    console.error(chalk.red(`  ${message}`));
    process.exit(1);
  }

  if (typeof modified !== 'string') {
    console.error(
      chalk.red(
        'Error: Script did not return a string. Got: ' + typeof modified
      )
    );
    process.exit(1);
  }

  if (modified === content) {
    console.log(
      chalk.yellow('Script returned unchanged content. Nothing to do.')
    );
    return;
  }

  const approved = await promptUserForDiffApproval(
    content,
    modified,
    skipConfirmation
  );
  if (!approved) {
    console.log(chalk.yellow('Aborted.'));
    return;
  }

  await writeContent(installation, modified);

  console.log(
    chalk.green(`✓ Script patch applied to ${chalk.cyan(installation.path)}`)
  );
}

// =============================================================================
// Subcommand: adhoc-patch (dispatcher)
// =============================================================================

/**
 * Main handler for the adhoc-patch subcommand.
 * Routes to string, regex, or script handler based on which option was provided.
 */
export async function handleAdhocPatch(options: {
  string?: string[];
  regex?: string[];
  script?: string;
  index?: number;
  path?: string;
  confirmPossibleDangerousPatch?: boolean;
  dangerousNoScriptSandbox?: boolean;
}): Promise<void> {
  // Validate that exactly one mode is specified
  const modes = [options.string, options.regex, options.script].filter(
    m => m !== undefined
  );
  if (modes.length === 0) {
    console.error(
      chalk.red('Error: Must specify one of --string, --regex, or --script.')
    );
    process.exit(1);
  }
  if (modes.length > 1) {
    console.error(
      chalk.red(
        'Error: Only one of --string, --regex, or --script can be used at a time.'
      )
    );
    process.exit(1);
  }

  const skipConfirmation = !!options.confirmPossibleDangerousPatch;
  const installation = await resolveInstallation(options.path);

  console.log(
    `Target: ${chalk.cyan(installation.path)} (${installation.kind}, v${installation.version})`
  );

  if (options.string) {
    if (options.string.length !== 2) {
      console.error(
        chalk.red(
          'Error: --string requires exactly 2 arguments: <old-string> <new-string>'
        )
      );
      process.exit(1);
    }
    await handleAdhocPatchString(
      options.string[0],
      options.string[1],
      options.index,
      installation,
      skipConfirmation
    );
  } else if (options.regex) {
    if (options.regex.length !== 2) {
      console.error(
        chalk.red(
          'Error: --regex requires exactly 2 arguments: <pattern> <replacement>'
        )
      );
      process.exit(1);
    }
    await handleAdhocPatchRegex(
      options.regex[0],
      options.regex[1],
      options.index,
      installation,
      skipConfirmation
    );
  } else if (options.script) {
    if (options.index !== undefined) {
      console.error(chalk.red('Error: --index cannot be used with --script.'));
      process.exit(1);
    }
    await handleAdhocPatchScriptImpl(
      options.script,
      installation,
      skipConfirmation,
      !!options.dangerousNoScriptSandbox
    );
  }
}
