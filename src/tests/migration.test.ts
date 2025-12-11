import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, it, vi, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaultSettings.js';
import { readConfigFile } from '../config.js';
import { migrateConfigIfNeeded } from '../migration.js';
import { createEnoent } from './testHelpers.js';

describe('userMessageDisplay migration', () => {
  it('should migrate old prefix/message structure to new format string', async () => {
    const oldConfig = {
      ccVersion: '1.0.0',
      ccInstallationDir: null,
      lastModified: '2024-01-01',
      changesApplied: true,
      settings: {
        ...DEFAULT_SETTINGS,
        userMessageDisplay: {
          prefix: {
            format: '$',
            styling: ['bold'],
            foregroundColor: 'rgb(255,0,0)',
            backgroundColor: 'rgb(0,0,0)',
          },
          message: {
            format: '{}',
            styling: ['italic'],
            foregroundColor: 'rgb(0,255,0)',
            backgroundColor: 'rgb(0,0,0)',
          },
        },
      },
    };

    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(oldConfig));

    const result = await readConfigFile();

    expect(result.settings.userMessageDisplay).toEqual({
      format: '${}',
      styling: ['bold', 'italic'],
      foregroundColor: 'rgb(0,255,0)',
      backgroundColor: null,
      borderStyle: 'none',
      borderColor: 'rgb(255,255,255)',
      paddingX: 0,
      paddingY: 0,
      fitBoxToContent: false,
    });
  });

  it('should convert rgb(0,0,0) to default/null', async () => {
    const oldConfig = {
      ccVersion: '1.0.0',
      ccInstallationDir: null,
      lastModified: '2024-01-01',
      changesApplied: true,
      settings: {
        ...DEFAULT_SETTINGS,
        userMessageDisplay: {
          prefix: {
            format: '#',
            styling: [],
            foregroundColor: 'rgb(0,0,0)',
            backgroundColor: 'rgb(0,0,0)',
          },
          message: {
            format: '{}',
            styling: [],
            foregroundColor: 'rgb(0,0,0)',
            backgroundColor: 'rgb(0,0,0)',
          },
        },
      },
    };

    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(oldConfig));

    const result = await readConfigFile();

    expect(result.settings.userMessageDisplay).toEqual({
      format: '#{}',
      styling: [],
      foregroundColor: 'default',
      backgroundColor: null,
      borderStyle: 'none',
      borderColor: 'rgb(255,255,255)',
      paddingX: 0,
      paddingY: 0,
      fitBoxToContent: false,
    });
  });

  it('should preserve custom colors during migration', async () => {
    const oldConfig = {
      ccVersion: '1.0.0',
      ccInstallationDir: null,
      lastModified: '2024-01-01',
      changesApplied: true,
      settings: {
        ...DEFAULT_SETTINGS,
        userMessageDisplay: {
          prefix: {
            format: '>> ',
            styling: [],
            foregroundColor: 'rgb(100,100,100)',
            backgroundColor: 'rgb(50,50,50)',
          },
          message: {
            format: '{}',
            styling: [],
            foregroundColor: 'rgb(200,200,200)',
            backgroundColor: 'rgb(75,75,75)',
          },
        },
      },
    };

    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(oldConfig));

    const result = await readConfigFile();

    expect(result.settings.userMessageDisplay).toEqual({
      format: '>> {}',
      styling: [],
      foregroundColor: 'rgb(200,200,200)',
      backgroundColor: 'rgb(75,75,75)',
      borderStyle: 'none',
      borderColor: 'rgb(255,255,255)',
      paddingX: 0,
      paddingY: 0,
      fitBoxToContent: false,
    });
  });

  it('should not migrate if already in new format', async () => {
    const newConfig = {
      ccVersion: '1.0.0',
      ccInstallationDir: null,
      lastModified: '2024-01-01',
      changesApplied: true,
      settings: {
        ...DEFAULT_SETTINGS,
        userMessageDisplay: {
          format: ' > {} ',
          styling: [],
          foregroundColor: 'default',
          backgroundColor: null,
          borderStyle: 'none',
          borderColor: 'rgb(255,255,255)',
          paddingX: 0,
          paddingY: 0,
          fitBoxToContent: false,
        },
      },
    };

    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(newConfig));

    const result = await readConfigFile();

    expect(result.settings.userMessageDisplay).toEqual({
      format: ' > {} ',
      styling: [],
      foregroundColor: 'default',
      backgroundColor: null,
      borderStyle: 'none',
      borderColor: 'rgb(255,255,255)',
      paddingX: 0,
      paddingY: 0,
      fitBoxToContent: false,
    });
  });

  it('should add fitBoxToContent if missing from new format config', async () => {
    const configMissingFitBox = {
      ccVersion: '1.0.0',
      ccInstallationDir: null,
      lastModified: '2024-01-01',
      changesApplied: true,
      settings: {
        ...DEFAULT_SETTINGS,
        userMessageDisplay: {
          format: ' > {} ',
          styling: [],
          foregroundColor: 'default',
          backgroundColor: null,
          borderStyle: 'none',
          borderColor: 'rgb(255,255,255)',
          paddingX: 0,
          paddingY: 0,
          // fitBoxToContent is missing - should be added by migration
        },
      },
    };

    vi.spyOn(fs, 'readFile').mockResolvedValue(
      JSON.stringify(configMissingFitBox)
    );

    const result = await readConfigFile();

    expect(result.settings.userMessageDisplay).toEqual({
      format: ' > {} ',
      styling: [],
      foregroundColor: 'default',
      backgroundColor: null,
      borderStyle: 'none',
      borderColor: 'rgb(255,255,255)',
      paddingX: 0,
      paddingY: 0,
      fitBoxToContent: false,
    });
  });
});

describe('migrateConfigIfNeeded', () => {
  it('should migrate ccInstallationDir to ccInstallationPath and return true', async () => {
    const mockConfig = { ccInstallationDir: '/some/path', settings: {} };
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockConfig));
    const writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    const result = await migrateConfigIfNeeded();

    expect(result).toBe(true);
    expect(writeSpy).toHaveBeenCalled();

    // Verify the written config has ccInstallationPath and not ccInstallationDir
    const writtenConfig = JSON.parse(writeSpy.mock.calls[0][1] as string);
    expect(writtenConfig.ccInstallationPath).toBe(
      path.join('/some/path', 'cli.js')
    );
    expect(writtenConfig.ccInstallationDir).toBeUndefined();
  });

  it('should return false if no migration needed', async () => {
    const mockConfig = {
      ccInstallationPath: '/some/path/cli.js',
      settings: {},
    };
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockConfig));
    const writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    const result = await migrateConfigIfNeeded();

    expect(result).toBe(false);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('should return false if config file does not exist', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());

    const result = await migrateConfigIfNeeded();

    expect(result).toBe(false);
  });

  it('should be idempotent - second call returns false after migration', async () => {
    const mockConfig = { ccInstallationDir: '/some/path', settings: {} };
    const migratedConfig = {
      ccInstallationPath: path.join('/some/path', 'cli.js'),
      settings: {},
      lastModified: expect.any(String),
    };

    let callCount = 0;
    vi.spyOn(fs, 'readFile').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify(mockConfig);
      }
      // After first migration, return the migrated config
      return JSON.stringify(migratedConfig);
    });
    vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    const result1 = await migrateConfigIfNeeded();
    const result2 = await migrateConfigIfNeeded();

    expect(result1).toBe(true);
    expect(result2).toBe(false);
  });
});
