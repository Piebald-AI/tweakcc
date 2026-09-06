import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import type { ClaudeCodeInstallationInfo, TweakccConfig } from '../types';
import {
  extractClaudeJsFromNativeInstallation,
  extractClaudeJsModulesFromNativeInstallation,
  repackNativeInstallation,
  repackNativeInstallationModules,
} from '../nativeInstallationLoader';
import { writePreventUnsupportedUpdates } from './preventUnsupportedUpdates';
import { applyCustomization } from './index';

// All filesystem and installation effects are mocked. These cases exercise
// failure isolation in the real apply pipeline without touching a client.
vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockRejectedValue(new Error('No backup')),
}));
vi.mock('node:fs', async importActual => ({
  ...(await importActual<typeof import('node:fs')>()),
  writeFileSync: vi.fn(),
}));
vi.mock('../config', () => ({
  CONFIG_DIR: '/test/config',
  NATIVE_BINARY_BACKUP_FILE: '/test/config/native.backup',
  updateConfigFile: vi.fn(async update => {
    const config = { changesApplied: false } as TweakccConfig;
    update(config);
    return config;
  }),
}));
vi.mock('../utils', () => ({
  debug: vi.fn(),
  replaceFileBreakingHardLinks: vi.fn(),
}));
vi.mock('../installationBackup', () => ({
  restoreNativeBinaryFromBackup: vi.fn(),
  restoreClijsFromBackup: vi.fn(),
}));
vi.mock('../nativeInstallationLoader', () => ({
  extractClaudeJsFromNativeInstallation: vi.fn(),
  extractClaudeJsModulesFromNativeInstallation: vi.fn(),
  repackNativeInstallation: vi.fn(),
  repackNativeInstallationModules: vi.fn(),
}));
vi.mock('./systemPrompts', () => ({
  applySystemPrompts: vi.fn(async content => ({
    newContent: content,
    results: [],
  })),
}));
vi.mock('./modelSelector', () => ({
  writeModelCustomizations: vi.fn((content: string) => `${content};void 0;`),
}));
vi.mock('./preventUnsupportedUpdates', () => ({
  writePreventUnsupportedUpdates: vi.fn(
    (content: string) => `${content};npmOnlyGuard();`
  ),
  writePreventUnsupportedUpdatesModules: vi.fn(),
}));
vi.mock('./parseGate', async importActual => ({
  ...(await importActual<typeof import('./parseGate')>()),
  assertPatchedBundleParses: vi.fn(),
}));

const installation: ClaudeCodeInstallationInfo = {
  nativeInstallationPath: '/test/claude',
  version: '2.1.20',
  source: 'search-paths',
};
function config(): TweakccConfig {
  return {
    ccVersion: '2.1.20',
    ccInstallationPath: '/test/claude',
    lastModified: '',
    changesApplied: false,
    settings: {
      ...DEFAULT_SETTINGS,
      misc: {
        ...DEFAULT_SETTINGS.misc,
        preventUpdateToUnsupportedVersions: true,
      },
    },
  };
}

describe('native update guard extraction fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractClaudeJsModulesFromNativeInstallation).mockResolvedValue(
      null
    );
    vi.mocked(extractClaudeJsFromNativeInstallation).mockResolvedValue(
      Buffer.from('const base = 1;')
    );
  });

  it('reports the guard as failed while applying an unrelated native customization', async () => {
    const result = await applyCustomization(config(), installation, [
      'model-customizations',
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, failed: true });
    expect(
      result.results.find(patch => patch.id === 'model-customizations')
    ).toMatchObject({ applied: true, failed: false });
    expect(repackNativeInstallation).toHaveBeenCalledWith(
      '/test/claude',
      Buffer.from('const base = 1;;void 0;'),
      '/test/claude'
    );
    expect(repackNativeInstallationModules).not.toHaveBeenCalled();
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });

  it('keeps the restored binary unchanged when the failed guard is the only requested patch', async () => {
    const result = await applyCustomization(config(), installation, [
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, failed: true });
    expect(repackNativeInstallation).not.toHaveBeenCalled();
    expect(repackNativeInstallationModules).not.toHaveBeenCalled();
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });

  it('still fails safely when neither native extractor is available', async () => {
    vi.mocked(extractClaudeJsFromNativeInstallation).mockResolvedValue(null);
    await expect(
      applyCustomization(config(), installation, [
        'prevent-unsupported-updates',
      ])
    ).rejects.toThrow('Failed to extract claude.js');
    expect(repackNativeInstallation).not.toHaveBeenCalled();
    expect(repackNativeInstallationModules).not.toHaveBeenCalled();
  });

  it('does not attempt optional corpus extraction when the guard is disabled', async () => {
    const disabled = config();
    disabled.settings.misc.preventUpdateToUnsupportedVersions = false;
    await applyCustomization(disabled, installation, [
      'prevent-unsupported-updates',
    ]);
    expect(extractClaudeJsModulesFromNativeInstallation).not.toHaveBeenCalled();
    expect(repackNativeInstallation).not.toHaveBeenCalled();
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });
});
