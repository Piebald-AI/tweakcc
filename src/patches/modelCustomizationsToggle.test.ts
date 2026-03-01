import * as fs from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
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
  extractClaudeJsFromNativeInstallation: vi.fn(),
  repackNativeInstallation: vi.fn(),
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
  });

  it('skips both model customization patches when disabled', async () => {
    const config = baseConfig();
    config.settings.misc.enableModelCustomizations = false;

    const { results } = await applyCustomization(config, ccInstInfo, [
      'model-customizations',
      'show-more-items-in-select-menus',
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
      'model-customizations',
      'show-more-items-in-select-menus',
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

  it('runs plumbing required for apply customization', async () => {
    await applyCustomization(baseConfig(), ccInstInfo, [
      'model-customizations',
      'show-more-items-in-select-menus',
    ]);

    expect(vi.mocked(restoreClijsFromBackup)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applySystemPrompts)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateConfigFile)).toHaveBeenCalledTimes(1);
  });
});
