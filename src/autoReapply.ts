import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CONFIG_DIR, CONFIG_FILE } from './config';
import { isRecordedBinary, readAppliedRecord } from './appliedRecord';
import { findClaudeCodeInstallation } from './installationDetection';
import { TweakccConfig } from './types';
import { debug } from './utils';

/**
 * Re-applies tweakcc after Claude Code replaced the binary it patched (a new
 * version, or the same version re-downloaded). A Claude Code SessionStart
 * hook runs `--session-start-check`, which only compares the active binary
 * with applied.json and, on a mismatch, starts `--auto-apply` detached so the
 * session never waits on (or times out on) the multi-second apply.
 */

const CHECK_FLAG = '--session-start-check';
const AUTO_APPLY_LOG = path.join(CONFIG_DIR, 'auto-apply.log');
/** Held while an auto-apply runs; left behind by a failed one. */
const AUTO_APPLY_LOCK = path.join(CONFIG_DIR, 'auto-apply.lock');
/** How long a running or failed auto-apply blocks the next attempt. */
const RETRY_AFTER_MS = 60 * 60 * 1000;

interface HookCommand {
  type?: string;
  command?: string;
  timeout?: number;
}
interface HookMatcher {
  matcher?: string;
  hooks?: HookCommand[];
}
interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[] | undefined>;
  [key: string]: unknown;
}

const claudeSettingsFile = () =>
  path.join(
    process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude'),
    'settings.json'
  );

const isTweakccHook = (hook: HookCommand) =>
  !!hook.command?.endsWith(` ${CHECK_FLAG}`);

const readClaudeSettings = async (file: string): Promise<ClaudeSettings> => {
  try {
    const settings: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw new Error(`${file} does not contain a JSON object`);
    return settings as ClaudeSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
};

const writeClaudeSettings = async (file: string, settings: ClaudeSettings) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Claude Code may read settings.json at any moment; never leave it partial.
  // The replacement keeps the file's permissions (settings can hold secrets):
  // the existing mode, or owner-only for a new file.
  let mode = 0o600;
  try {
    mode = (await fs.stat(file)).mode & 0o777;
  } catch {
    // New file.
  }
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', {
    mode,
  });
  await fs.chmod(temporary, mode); // writeFile's mode is reduced by umask
  await fs.rename(temporary, file);
};

/** Removes tweakcc's SessionStart hooks; returns how many were removed. */
const withoutTweakccHooks = (settings: ClaudeSettings): number => {
  const matchers = settings.hooks?.SessionStart;
  if (!Array.isArray(matchers)) return 0;
  let removed = 0;
  const kept = matchers.flatMap(matcher => {
    const hooks = (matcher.hooks ?? []).filter(hook => {
      if (!isTweakccHook(hook)) return true;
      removed++;
      return false;
    });
    return hooks.length > 0 ? [{ ...matcher, hooks }] : [];
  });
  if (kept.length > 0) settings.hooks!.SessionStart = kept;
  else delete settings.hooks!.SessionStart;
  if (Object.keys(settings.hooks!).length === 0) delete settings.hooks;
  return removed;
};

/** The command Claude Code runs: this Node and this tweakcc entry point. */
const hookCommand = async (): Promise<string> => {
  const script = await fs.realpath(process.argv[1]);
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(script)} ${CHECK_FLAG}`;
};

export const installSessionStartHook = async (): Promise<string> => {
  const file = claudeSettingsFile();
  const settings = await readClaudeSettings(file);
  withoutTweakccHooks(settings);
  const command = await hookCommand();
  settings.hooks ??= {};
  settings.hooks.SessionStart = [
    ...(settings.hooks.SessionStart ?? []),
    {
      matcher: 'startup|resume',
      hooks: [{ type: 'command', command, timeout: 10 }],
    },
  ];
  await writeClaudeSettings(file, settings);
  return `${file}: SessionStart runs ${command}`;
};

export const removeSessionStartHook = async (): Promise<string> => {
  const file = claudeSettingsFile();
  const settings = await readClaudeSettings(file);
  const removed = withoutTweakccHooks(settings);
  if (removed > 0) await writeClaudeSettings(file, settings);
  return removed > 0
    ? `Removed the tweakcc SessionStart hook from ${file}`
    : `No tweakcc SessionStart hook in ${file}`;
};

/** Takes the auto-apply lock unless a recent run holds (or failed with) it. */
const acquireLock = async (binary: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(AUTO_APPLY_LOCK);
    if (Date.now() - stat.mtimeMs < RETRY_AFTER_MS) return false;
    await fs.rm(AUTO_APPLY_LOCK, { force: true });
  } catch {
    // No lock.
  }
  try {
    await fs.writeFile(
      AUTO_APPLY_LOCK,
      JSON.stringify({ binary, startedAt: new Date().toISOString() }),
      { flag: 'wx' }
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * SessionStart hook body. Silent unless it starts a re-apply; never fails
 * the hook. Its only output is a hook JSON `systemMessage` for the user.
 */
export const runSessionStartCheck = async (): Promise<void> => {
  try {
    const record = await readAppliedRecord();
    if (!record || Object.keys(record.binaries).length === 0) return;
    // Only ccInstallationPath matters to detection; skip readConfigFile's
    // normalization and writes.
    const config = JSON.parse(
      await fs.readFile(CONFIG_FILE, 'utf8')
    ) as TweakccConfig;
    const ccInstInfo = await findClaudeCodeInstallation(config, {
      interactive: false,
    });
    const binary = ccInstInfo?.nativeInstallationPath;
    if (!binary || (await isRecordedBinary(record, binary))) return;
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    if (!(await acquireLock(binary))) return;

    try {
      const log = await fs.open(AUTO_APPLY_LOG, 'w');
      try {
        const child = spawn(
          process.execPath,
          [process.argv[1], '--auto-apply'],
          {
            detached: true,
            stdio: ['ignore', log.fd, log.fd],
            windowsHide: true,
          }
        );
        // A launch failure can also arrive asynchronously as 'error'.
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve);
          child.once('error', reject);
        });
        child.unref();
      } finally {
        await log.close();
      }
    } catch (error) {
      // Nothing started: don't let the lock block retries for an hour.
      await fs.rm(AUTO_APPLY_LOCK, { force: true });
      throw error;
    }
    process.stdout.write(
      JSON.stringify({
        systemMessage: `tweakcc: Claude Code ${ccInstInfo.version} is not the binary tweakcc patched; re-applying your customizations in the background (log: ${AUTO_APPLY_LOG}). Restart Claude Code once it finishes.`,
      }) + '\n'
    );
  } catch (error) {
    debug(`session start check: ${error}`);
  }
};

/**
 * Prepares the detached `--auto-apply` run: the lock is released only if
 * the apply exits successfully, so a failing apply is not retried on every
 * session start.
 */
export const runAutoApply = (): void => {
  console.log(`tweakcc auto-apply started ${new Date().toISOString()}`);
  process.on('exit', code => {
    console.log(
      `tweakcc auto-apply exited ${code} ${new Date().toISOString()}`
    );
    if (code === 0) fsSync.rmSync(AUTO_APPLY_LOCK, { force: true });
  });
};
