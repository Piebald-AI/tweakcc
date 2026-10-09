import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readFile,
  doesFileExist,
  extractVersion,
  replaceFileBreakingHardLinks,
} = vi.hoisted(() => ({
  readFile: vi.fn(),
  doesFileExist: vi.fn(),
  extractVersion: vi.fn(),
  replaceFileBreakingHardLinks: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ default: { readFile } }));
vi.mock('../config', () => ({
  CLIJS_BACKUP_FILE: '/backup/cli.js',
  NATIVE_BINARY_BACKUP_FILE: '/backup/native',
  ensureConfigDir: vi.fn(),
  updateConfigFile: vi.fn(),
}));
vi.mock('../systemPromptHashIndex', () => ({ clearAllAppliedHashes: vi.fn() }));
vi.mock('../utils', async importOriginal => ({
  ...(await importOriginal<typeof import('../utils')>()),
  debug: vi.fn(),
  doesFileExist,
  replaceFileBreakingHardLinks,
}));
vi.mock('../installationDetection', () => ({ extractVersion }));

import { restoreNativeBinaryFromBackup } from '../installationBackup';

describe('native backup restore safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doesFileExist.mockResolvedValue(true);
    extractVersion.mockResolvedValueOnce('2.1.150');
  });

  it('refuses to restore a native backup from another Claude version', async () => {
    await expect(
      restoreNativeBinaryFromBackup({
        nativeInstallationPath: '/versions/2.1.258',
        version: '2.1.258',
        source: 'path',
      })
    ).rejects.toThrow(/backup.*2\.1\.150.*installed.*2\.1\.258/i);

    expect(readFile).not.toHaveBeenCalled();
    expect(replaceFileBreakingHardLinks).not.toHaveBeenCalled();
  });
});
