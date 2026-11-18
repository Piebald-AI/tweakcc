import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeStartupCheck } from '../startup';
import {
  backupNativeBinary,
  isOfficialReleaseBinary,
} from '../installationBackup';
import { extractVersion } from '../installationDetection';
import type { ClaudeCodeInstallationInfo, TweakccConfig } from '../types';

vi.mock('node:fs/promises', () => ({ default: { unlink: vi.fn() } }));
vi.mock('../utils', () => ({
  debug: vi.fn(),
  doesFileExist: vi.fn(() => true),
}));
vi.mock('../config', () => ({
  CLIJS_BACKUP_FILE: '/cfg/cli.js.backup',
  CONFIG_DIR: '/cfg',
  CONFIG_FILE: '/cfg/config.json',
  NATIVE_BINARY_BACKUP_FILE: '/cfg/native-binary.backup',
  readConfigFile: vi.fn(),
}));
vi.mock('../systemPromptSync', () => ({
  syncSystemPrompts: vi.fn(),
  displaySyncResults: vi.fn(),
}));
vi.mock('../installationDetection', () => ({ extractVersion: vi.fn() }));
vi.mock('../installationBackup', () => ({
  backupClijs: vi.fn(),
  backupNativeBinary: vi.fn(),
  isOfficialReleaseBinary: vi.fn(),
}));

describe('native backup safety', () => {
  const installed: ClaudeCodeInstallationInfo = {
    nativeInstallationPath: '/versions/2.1.296',
    version: '2.1.296',
    source: 'path',
  };
  const config = { ccVersion: '2.1.295' } as TweakccConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractVersion).mockResolvedValue('2.1.295');
  });

  it('keeps the old backup when the new binary is not a proven official build', async () => {
    vi.mocked(isOfficialReleaseBinary).mockResolvedValue(false);
    const info = await completeStartupCheck(config, installed);
    expect(info?.wasUpdated).toBe(true);
    expect(backupNativeBinary).not.toHaveBeenCalled();
  });

  it('backs up a new version once it matches the official release manifest', async () => {
    vi.mocked(isOfficialReleaseBinary).mockResolvedValue(true);
    await completeStartupCheck(config, installed);
    expect(isOfficialReleaseBinary).toHaveBeenCalledWith(
      '/versions/2.1.296',
      '2.1.296'
    );
    expect(backupNativeBinary).toHaveBeenCalledWith(installed);
  });

  it('never replaces a backup of the same version', async () => {
    vi.mocked(extractVersion).mockResolvedValue('2.1.296');
    vi.mocked(isOfficialReleaseBinary).mockResolvedValue(true);
    await completeStartupCheck(config, installed);
    expect(backupNativeBinary).not.toHaveBeenCalled();
  });
});
