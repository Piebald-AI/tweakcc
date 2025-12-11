import fs from 'node:fs/promises';

import {
  CLIJS_BACKUP_FILE,
  ensureConfigDir,
  NATIVE_BINARY_BACKUP_FILE,
  updateConfigFile,
} from './config.js';
import { clearAllAppliedHashes } from './systemPromptHashIndex.js';
import { debug, replaceFileBreakingHardLinks, doesFileExist } from './utils.js';
import { ClaudeCodeInstallationInfo } from './types.js';

export const backupClijs = async (ccInstInfo: ClaudeCodeInstallationInfo) => {
  // Only backup cli.js for NPM installs (when cliPath is set)
  if (!ccInstInfo.cliPath) {
    debug('backupClijs: Skipping for native installation (no cliPath)');
    return;
  }

  await ensureConfigDir();
  debug(`Backing up cli.js to ${CLIJS_BACKUP_FILE}`);
  await fs.copyFile(ccInstInfo.cliPath, CLIJS_BACKUP_FILE);
  await updateConfigFile(config => {
    config.changesApplied = false;
    config.ccVersion = ccInstInfo.version;
  });
};

/**
 * Backs up the native installation binary to the config directory.
 */
export const backupNativeBinary = async (
  ccInstInfo: ClaudeCodeInstallationInfo
) => {
  if (!ccInstInfo.nativeInstallationPath) {
    return;
  }

  await ensureConfigDir();
  debug(`Backing up native binary to ${NATIVE_BINARY_BACKUP_FILE}`);
  await fs.copyFile(
    ccInstInfo.nativeInstallationPath,
    NATIVE_BINARY_BACKUP_FILE
  );
  await updateConfigFile(config => {
    config.changesApplied = false;
    config.ccVersion = ccInstInfo.version;
  });
};

/**
 * Restores the original cli.js file from the backup.
 * Only applies to NPM installs. For native installs, this is a no-op.
 */
export const restoreClijsFromBackup = async (
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<boolean> => {
  // Only restore cli.js for NPM installs (when cliPath is set)
  if (!ccInstInfo.cliPath) {
    debug(
      'restoreClijsFromBackup: Skipping for native installation (no cliPath)'
    );
    return false;
  }

  debug(`Restoring cli.js from backup to ${ccInstInfo.cliPath}`);

  // Read the backup content
  const backupContent = await fs.readFile(CLIJS_BACKUP_FILE);

  // Replace the file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(
    ccInstInfo.cliPath,
    backupContent,
    'restore'
  );

  // Clear all applied hashes since we're restoring to defaults
  await clearAllAppliedHashes();

  await updateConfigFile(config => {
    config.changesApplied = false;
  });

  return true;
};

/**
 * Restores the native installation binary from backup.
 * This function restores the original native binary and clears changesApplied,
 * so patches can be re-applied from a clean state.
 */
export const restoreNativeBinaryFromBackup = async (
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<boolean> => {
  if (!ccInstInfo.nativeInstallationPath) {
    debug(
      'restoreNativeBinaryFromBackup: No native installation path, skipping'
    );
    return false;
  }

  if (!(await doesFileExist(NATIVE_BINARY_BACKUP_FILE))) {
    debug('restoreNativeBinaryFromBackup: No backup file exists, skipping');
    return false;
  }

  debug(
    `Restoring native binary from backup to ${ccInstInfo.nativeInstallationPath}`
  );

  // Read the backup content
  const backupContent = await fs.readFile(NATIVE_BINARY_BACKUP_FILE);

  // Replace the file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(
    ccInstInfo.nativeInstallationPath,
    backupContent,
    'restore'
  );

  return true;
};
