import fs from 'node:fs/promises';

import {
  findClaudeCodeInstallation,
  getPendingCandidates,
} from './installationDetection.js';
import { doesFileExist } from './utils.js';
import {
  CLIJS_BACKUP_FILE,
  CONFIG_DIR,
  CONFIG_FILE,
  NATIVE_BINARY_BACKUP_FILE,
  readConfigFile,
} from './config.js';
import { debug } from './utils.js';
import { displaySyncResults, syncSystemPrompts } from './systemPromptSync.js';
import {
  ClaudeCodeInstallationInfo,
  FindInstallationOptions,
  InstallationCandidate,
  StartupCheckInfo,
  TweakccConfig,
} from './types.js';
import { backupClijs, backupNativeBinary } from './installationBackup.js';

export interface StartupCheckResult {
  startupCheckInfo: StartupCheckInfo | null;
  pendingCandidates: InstallationCandidate[] | null;
}

/**
 * Performs startup checking: finding Claude Code, creating a backup if necessary, checking if
 * it's been updated.
 *
 * @param options - Options for installation detection (interactive mode flag)
 * @returns StartupCheckResult with either startupCheckInfo or pendingCandidates for UI selection
 */
export async function startupCheck(
  options: FindInstallationOptions
): Promise<StartupCheckResult> {
  const config = await readConfigFile();

  const ccInstInfo = await findClaudeCodeInstallation(config, options);
  if (!ccInstInfo) {
    return { startupCheckInfo: null, pendingCandidates: null };
  }

  // Check if we have pending candidates that need user selection
  const pendingCandidates = getPendingCandidates(ccInstInfo);
  if (pendingCandidates) {
    return { startupCheckInfo: null, pendingCandidates };
  }

  return {
    startupCheckInfo: await completeStartupCheck(config, ccInstInfo),
    pendingCandidates: null,
  };
}

/**
 * Completes the startup check after installation is resolved.
 * Called directly when no selection needed, or after user selects an installation.
 */
export async function completeStartupCheck(
  config: TweakccConfig,
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<StartupCheckInfo | null> {
  if (!ccInstInfo) {
    return null;
  }

  // Sync system prompts with the current CC version
  if (ccInstInfo.version) {
    try {
      const syncSummary = await syncSystemPrompts(ccInstInfo.version);
      displaySyncResults(syncSummary);
    } catch {
      // Error already logged with chalk.red in syncSystemPrompts
      // Continue with startup check even if prompt sync fails
    }
  }

  const realVersion = ccInstInfo.version;
  const backedUpVersion = config.ccVersion;

  // Backup cli.js if we don't have any backup yet.
  let hasBackedUp = false;
  if (!(await doesFileExist(CLIJS_BACKUP_FILE))) {
    debug(`startupCheck: ${CLIJS_BACKUP_FILE} not found; backing up cli.js`);
    await backupClijs(ccInstInfo);
    hasBackedUp = true;
  }

  // Backup native binary if we don't have any backup yet (for native installations)
  let hasBackedUpNativeBinary = false;
  if (
    ccInstInfo.nativeInstallationPath &&
    !(await doesFileExist(NATIVE_BINARY_BACKUP_FILE))
  ) {
    debug(
      `startupCheck: ${NATIVE_BINARY_BACKUP_FILE} not found; backing up native binary`
    );
    await backupNativeBinary(ccInstInfo);
    hasBackedUpNativeBinary = true;
  }

  // If the installed CC version is different from what we have backed up, clear out our backup
  // and make a new one.
  if (realVersion !== backedUpVersion) {
    // The version we have backed up is different than what's installed.  Mostly likely the user
    // updated CC, so we should back up the new version.  If the backup didn't even exist until we
    // copied in there above, though, we shouldn't back it up twice.
    if (!hasBackedUp) {
      debug(
        `startupCheck: real version (${realVersion}) != backed up version (${backedUpVersion}); backing up cli.js`
      );
      await fs.unlink(CLIJS_BACKUP_FILE);
      await backupClijs(ccInstInfo);
    }

    // Also backup native binary if version changed
    if (ccInstInfo.nativeInstallationPath && !hasBackedUpNativeBinary) {
      debug(
        `startupCheck: real version (${realVersion}) != backed up version (${backedUpVersion}); backing up native binary`
      );
      if (await doesFileExist(NATIVE_BINARY_BACKUP_FILE)) {
        await fs.unlink(NATIVE_BINARY_BACKUP_FILE);
      }
      await backupNativeBinary(ccInstInfo);
    }

    return {
      wasUpdated: true,
      oldVersion: backedUpVersion,
      newVersion: realVersion,
      ccInstInfo,
    };
  }

  return {
    wasUpdated: false,
    oldVersion: null,
    newVersion: null,
    ccInstInfo,
  };
}

export const createExampleConfigIfMissing = async (
  examplePath: string
): Promise<void> => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    // Only create if config file doesn't exist
    try {
      await fs.stat(CONFIG_FILE);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        const exampleConfig = {
          ccInstallationPath: examplePath + '/cli.js',
        };
        await fs.writeFile(CONFIG_FILE, JSON.stringify(exampleConfig, null, 2));
      }
    }
  } catch {
    // Silently fail if we can't write the config file
  }
};
