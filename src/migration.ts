import path from 'node:path';
import fs from 'node:fs/promises';

import { TweakccConfig } from './types';
import { CONFIG_FILE, ensureConfigDir } from './config';

/**
 * In v3.2.0 we changed the user message display config.  This function migrates the old config.
 * @param readConfig The config that was read.
 */
export const migrateUserMessageDisplayToV320 = (readConfig: TweakccConfig) => {
  // In v3.2.0 userMessageDisplay was restructured from prefix/message to a single format string.
  const tmpPreV320UserMessageDisplay = readConfig?.settings
    ?.userMessageDisplay as unknown as {
    prefix?: {
      format: string;
      styling: string[];
      foregroundColor: string;
      backgroundColor: string;
    };
    message?: {
      format: string;
      styling: string[];
      foregroundColor: string;
      backgroundColor: string;
    };
    padding?: number;
  };

  if (tmpPreV320UserMessageDisplay?.prefix) {
    const old = tmpPreV320UserMessageDisplay;
    readConfig.settings.userMessageDisplay = {
      format: (old.prefix?.format || '') + (old.message?.format || '{}'),
      styling: [
        ...(old.prefix?.styling || []),
        ...(old.message?.styling || []),
      ],
      foregroundColor:
        old.message?.foregroundColor === 'rgb(0,0,0)'
          ? 'default'
          : old.message?.foregroundColor ||
            old.prefix?.foregroundColor ||
            'default',
      backgroundColor:
        old.message?.backgroundColor === 'rgb(0,0,0)'
          ? null
          : old.message?.backgroundColor || old.prefix?.backgroundColor || null,
      borderStyle: 'none',
      borderColor: 'rgb(255,255,255)',
      paddingX: 0,
      paddingY: 0,
      fitBoxToContent: false,
    };
  }

  // In v3.2.0 border properties were added to userMessageDisplay.
  if (
    tmpPreV320UserMessageDisplay &&
    !('borderStyle' in tmpPreV320UserMessageDisplay)
  ) {
    readConfig.settings.userMessageDisplay.borderStyle = 'none';
    readConfig.settings.userMessageDisplay.borderColor = 'rgb(255,255,255)';
    readConfig.settings.userMessageDisplay.paddingX = 0;
    readConfig.settings.userMessageDisplay.paddingY = 0;
    readConfig.settings.userMessageDisplay.fitBoxToContent = false;
  }

  // In v3.2.0 padding was split into paddingX and paddingY.
  if (
    tmpPreV320UserMessageDisplay &&
    'padding' in tmpPreV320UserMessageDisplay &&
    !('paddingX' in tmpPreV320UserMessageDisplay)
  ) {
    readConfig.settings.userMessageDisplay.paddingX =
      tmpPreV320UserMessageDisplay.padding || 0;
    readConfig.settings.userMessageDisplay.paddingY = 0;
    delete tmpPreV320UserMessageDisplay.padding; // This will delete it from the readConfig but with type safety.
  }

  // In v3.2.x fitBoxToContent was added to userMessageDisplay.
  if (
    tmpPreV320UserMessageDisplay &&
    !('fitBoxToContent' in tmpPreV320UserMessageDisplay)
  ) {
    readConfig.settings.userMessageDisplay.fitBoxToContent = false;
  }
};

/**
 * Migrates old ccInstallationDir config to ccInstallationPath if needed.
 * This should be called once at startup before any readConfigFile() calls.
 * @returns true if migration occurred, false otherwise
 */
export async function migrateConfigIfNeeded(): Promise<boolean> {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf8');
    const rawConfig = JSON.parse(content) as Record<string, unknown>;

    if (!Object.hasOwn(rawConfig, 'ccInstallationDir')) {
      return false;
    }

    // Migrate ccInstallationDir to ccInstallationPath
    if (rawConfig.ccInstallationDir && !rawConfig.ccInstallationPath) {
      rawConfig.ccInstallationPath = path.join(
        rawConfig.ccInstallationDir as string,
        'cli.js'
      );
    }

    // Remove the old key
    delete rawConfig.ccInstallationDir;

    // Save the migrated config
    rawConfig.lastModified = new Date().toISOString();
    await ensureConfigDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(rawConfig, null, 2));

    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // Config file doesn't exist, no migration needed
      return false;
    }
    throw error;
  }
}
