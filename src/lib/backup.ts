/**
 * Backup & Restore Utilities
 *
 * Generic file backup/restore with proper handling of permissions and hard links.
 * These are low-level utilities - the caller manages where backups are stored.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { replaceFileBreakingHardLinks, doesFileExist } from '../utils';

// ============================================================================
// Public API
// ============================================================================

/**
 * Backup a file to a specified location.
 *
 * Creates parent directories if needed.
 * Preserves the original file - this is a copy operation.
 *
 * @param sourcePath - Path to the file to backup
 * @param backupPath - Where to store the backup
 */
export async function backupFile(
  sourcePath: string,
  backupPath: string
): Promise<void> {
  // Ensure backup directory exists
  const backupDir = path.dirname(backupPath);
  await fs.mkdir(backupDir, { recursive: true });

  // Copy the file
  await fs.copyFile(sourcePath, backupPath);
}

/**
 * Restore a file from a backup.
 *
 * Handles:
 * - Breaking hard links (common with pnpm installations)
 * - Preserving file permissions
 *
 * @param backupPath - Path to the backup file
 * @param targetPath - Where to restore the file
 * @throws If backup file doesn't exist
 */
export async function restoreBackup(
  backupPath: string,
  targetPath: string
): Promise<void> {
  if (!(await doesFileExist(backupPath))) {
    throw new Error(`Backup file does not exist: ${backupPath}`);
  }

  // Read the backup content
  const backupContent = await fs.readFile(backupPath);

  // Replace the target file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(targetPath, backupContent, 'restore');
}
