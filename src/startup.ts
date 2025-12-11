import fs from 'node:fs/promises';

import { findClaudeCodeInstallation } from './installationDetection.js';
import { doesFileExist } from './utils.js';
import {
  CLIJS_BACKUP_FILE,
  CONFIG_DIR,
  CONFIG_FILE,
  NATIVE_BINARY_BACKUP_FILE,
  readConfigFile,
} from './config.js';
import { isDebug } from './utils.js';
import { displaySyncResults, syncSystemPrompts } from './systemPromptSync.js';
import { StartupCheckInfo } from './types.js';
import { backupClijs, backupNativeBinary } from './installationBackup.js';

/**
 * Performs startup checking: finding Claude Code, creating a backup if necessary, checking if
 * it's been updated.  If true, an update is required.
 */
export async function startupCheck(): Promise<StartupCheckInfo | null> {
  const config = await readConfigFile();

  const ccInstInfo = await findClaudeCodeInstallation(config);
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
    if (isDebug()) {
      console.log(
        `startupCheck: ${CLIJS_BACKUP_FILE} not found; backing up cli.js`
      );
    }
    await backupClijs(ccInstInfo);
    hasBackedUp = true;
  }

  // Backup native binary if we don't have any backup yet (for native installations)
  let hasBackedUpNativeBinary = false;
  if (
    ccInstInfo.nativeInstallationPath &&
    !(await doesFileExist(NATIVE_BINARY_BACKUP_FILE))
  ) {
    if (isDebug()) {
      console.log(
        `startupCheck: ${NATIVE_BINARY_BACKUP_FILE} not found; backing up native binary`
      );
    }
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
      if (isDebug()) {
        console.log(
          `startupCheck: real version (${realVersion}) != backed up version (${backedUpVersion}); backing up cli.js`
        );
      }
      await fs.unlink(CLIJS_BACKUP_FILE);
      await backupClijs(ccInstInfo);
    }

    // Also backup native binary if version changed
    if (ccInstInfo.nativeInstallationPath && !hasBackedUpNativeBinary) {
      if (isDebug()) {
        console.log(
          `startupCheck: real version (${realVersion}) != backed up version (${backedUpVersion}); backing up native binary`
        );
      }
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
