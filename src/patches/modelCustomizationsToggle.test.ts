import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '2.1.158', stderr: '' })),
}));

import { DEFAULT_SETTINGS } from '../defaultSettings';
import { ClaudeCodeInstallationInfo, TweakccConfig } from '../types';
import { updateConfigFile } from '../config';
import { replaceFileBreakingHardLinks } from '../utils';
import { restoreClijsFromBackup } from '../installationBackup';
import { writeModelCustomizations } from './modelSelector';
import { writeShowMoreItemsInSelectMenus } from './showMoreItemsInSelectMenus';
import { applySystemPrompts } from './systemPrompts';
import { applyCustomization } from './index';

const mockReadFile = vi.hoisted(() => vi.fn());
const mockExtractClaudeJsFromNativeInstallation = vi.hoisted(() => vi.fn());
const mockRepackNativeInstallation = vi.hoisted(() => vi.fn());
const mockCopyFile = vi.hoisted(() => vi.fn());
const mockChmod = vi.hoisted(() => vi.fn());
const mockMkdtemp = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  copyFile: mockCopyFile,
  chmod: mockChmod,
  mkdtemp: mockMkdtemp,
  rm: mockRm,
}));

vi.mock('../config', () => ({
  CONFIG_DIR: '/tmp/tweakcc-test-config',
  NATIVE_BINARY_BACKUP_FILE: '/tmp/tweakcc-test-config/native.backup',
  updateConfigFile: vi.fn(async updateFn => {
    const config = { changesApplied: false } as TweakccConfig;
    updateFn(config);
    return config;
  }),
}));

vi.mock('../utils', () => ({
  debug: vi.fn(),
  replaceFileBreakingHardLinks: vi.fn(),
}));

vi.mock('../installationBackup', () => ({
  restoreNativeBinaryFromBackup: vi.fn(),
  restoreClijsFromBackup: vi.fn(async () => true),
}));

vi.mock('../nativeInstallationLoader', () => ({
  extractClaudeJsFromNativeInstallation:
    mockExtractClaudeJsFromNativeInstallation,
  repackNativeInstallation: mockRepackNativeInstallation,
}));

vi.mock('./modelSelector', () => ({
  writeModelCustomizations: vi.fn((content: string) => `${content}|model`),
}));

vi.mock('./showMoreItemsInSelectMenus', () => ({
  writeShowMoreItemsInSelectMenus: vi.fn(
    (content: string) => `${content}|show`
  ),
}));

vi.mock('./systemPrompts', () => ({
  applySystemPrompts: vi.fn(async (content: string) => ({
    newContent: content,
    results: [],
  })),
}));

const PATCH_IDS = [
  'model-customizations',
  'show-more-items-in-select-menus',
] as const;

const NATIVE_UNSAFE_PATCH_IDS = ['opusplan1m', 'conversation-title'] as const;

const baseConfig = (): TweakccConfig => ({
  ccVersion: '',
  ccInstallationPath: null,
  lastModified: '2026-01-01T00:00:00.000Z',
  changesApplied: false,
  settings: {
    ...DEFAULT_SETTINGS,
    misc: {
      ...DEFAULT_SETTINGS.misc,
    },
  },
});

const ccInstInfo: ClaudeCodeInstallationInfo = {
  cliPath: '/tmp/claude-cli.js',
  version: '2.1.63',
  source: 'search-paths',
};

describe('model customization toggle patch conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFile).mockResolvedValue('base-content');
    fsSync.mkdirSync('/tmp/tweakcc-test-config', { recursive: true });
    fsSync.writeFileSync('/tmp/claude-native', 'native');
    mockExtractClaudeJsFromNativeInstallation.mockResolvedValue(
      Buffer.from('base-content')
    );
    mockCopyFile.mockResolvedValue(undefined);
    mockChmod.mockResolvedValue(undefined);
    mockMkdtemp.mockResolvedValue('/tmp/tweakcc-native-test');
    mockRm.mockResolvedValue(undefined);
  });

  it('skips both model customization patches when disabled', async () => {
    const config = baseConfig();
    config.settings.misc.enableModelCustomizations = false;

    const { results } = await applyCustomization(config, ccInstInfo, [
      ...PATCH_IDS,
    ]);

    const modelResult = results.find(r => r.id === 'model-customizations');
    const showMoreResult = results.find(
      r => r.id === 'show-more-items-in-select-menus'
    );

    expect(modelResult).toMatchObject({ applied: false, skipped: true });
    expect(showMoreResult).toMatchObject({ applied: false, skipped: true });
    expect(vi.mocked(writeModelCustomizations)).not.toHaveBeenCalled();
    expect(vi.mocked(writeShowMoreItemsInSelectMenus)).not.toHaveBeenCalled();
    expect(vi.mocked(replaceFileBreakingHardLinks)).toHaveBeenCalledWith(
      '/tmp/claude-cli.js',
      'base-content',
      'patch'
    );
  });

  it('applies both model customization patches when enabled', async () => {
    const config = baseConfig();
    config.settings.misc.enableModelCustomizations = true;

    const { results } = await applyCustomization(config, ccInstInfo, [
      ...PATCH_IDS,
    ]);

    const modelResult = results.find(r => r.id === 'model-customizations');
    const showMoreResult = results.find(
      r => r.id === 'show-more-items-in-select-menus'
    );

    expect(modelResult).toMatchObject({ applied: true, failed: false });
    expect(showMoreResult).toMatchObject({ applied: true, failed: false });
    expect(vi.mocked(writeModelCustomizations)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeShowMoreItemsInSelectMenus)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(replaceFileBreakingHardLinks)).toHaveBeenCalledWith(
      '/tmp/claude-cli.js',
      expect.stringContaining('base-content'),
      'patch'
    );
  });

  it('marks patches as failed when patch functions return null', async () => {
    const config = baseConfig();
    config.settings.misc.enableModelCustomizations = true;

    vi.mocked(writeModelCustomizations).mockReturnValue(null);
    vi.mocked(writeShowMoreItemsInSelectMenus).mockReturnValue(null);

    const { results } = await applyCustomization(config, ccInstInfo, [
      ...PATCH_IDS,
    ]);

    const modelResult = results.find(r => r.id === 'model-customizations');
    const showMoreResult = results.find(
      r => r.id === 'show-more-items-in-select-menus'
    );

    expect(modelResult).toMatchObject({ applied: false, failed: true });
    expect(showMoreResult).toMatchObject({ applied: false, failed: true });
    expect(vi.mocked(replaceFileBreakingHardLinks)).toHaveBeenCalledWith(
      '/tmp/claude-cli.js',
      'base-content',
      'patch'
    );
  });

  it('runs plumbing required for apply customization', async () => {
    await applyCustomization(baseConfig(), ccInstInfo, [...PATCH_IDS]);

    expect(vi.mocked(restoreClijsFromBackup)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applySystemPrompts)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateConfigFile)).toHaveBeenCalledTimes(1);
  });

  it('skips binary-unsafe patches for native installations', async () => {
    const config = baseConfig();
    config.settings.misc.enableConversationTitle = true;

    const { results } = await applyCustomization(
      config,
      {
        ...ccInstInfo,
        nativeInstallationPath: '/tmp/claude-native',
      },
      [...NATIVE_UNSAFE_PATCH_IDS]
    );

    expect(results.find(r => r.id === 'opusplan1m')).toMatchObject({
      applied: false,
      skipped: true,
    });
    expect(results.find(r => r.id === 'conversation-title')).toMatchObject({
      applied: false,
      skipped: true,
    });
  });
});
