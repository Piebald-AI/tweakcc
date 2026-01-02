import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EOL } from 'node:os';
import chalk from 'chalk';

import { Settings, Theme, ThinkingVerbsConfig, TweakccConfig } from './types';
import { debug, expandTilde } from './utils';
import { hasUnappliedSystemPromptChanges } from './systemPromptHashIndex';
import { migrateUserMessageDisplayToV320 } from './migration';
import { DEFAULT_SETTINGS } from './defaultSettings';

// Support XDG Base Directory Specification with backward compatibility
// Priority:
// 1. If TWEAKCC_CONFIG_DIR env var is set, use it (explicit override)
// 2. If ~/.tweakcc exists, use it (backward compatibility)
// 3. If ~/.claude/tweakcc exists, use it (Claude ecosystem alignment)
// 4. If $XDG_CONFIG_HOME is set, use $XDG_CONFIG_HOME/tweakcc
// 5. Otherwise, use ~/.tweakcc (default)
export const getConfigDir = (): string => {
  // Check TWEAKCC_CONFIG_DIR first (explicit override)
  const tweakccConfigDir = process.env.TWEAKCC_CONFIG_DIR?.trim();
  if (tweakccConfigDir && tweakccConfigDir.length > 0) {
    return expandTilde(tweakccConfigDir);
  }

  const defaultDir = path.join(os.homedir(), '.tweakcc');
  const claudeDir = path.join(os.homedir(), '.claude', 'tweakcc');
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;

  // Check if default directory exists - use it for backward compatibility
  try {
    if (fsSync.existsSync(defaultDir)) {
      return defaultDir;
    }
  } catch (e) {
    debug(`Failed to check if ${defaultDir} exists: ${e}`);
    // If we can't check, fall through to next location
  }

  // Check .claude-aligned location next
  try {
    if (fsSync.existsSync(claudeDir)) {
      return claudeDir;
    }
  } catch (e) {
    debug(`Failed to check if ${claudeDir} exists: ${e}`);
    // If we can't check, fall through to XDG logic
  }

  // No default or .claude directory - use XDG if available
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, 'tweakcc');
  }

  // Default to legacy location
  return defaultDir;
};

// Constants.
export const CONFIG_DIR = getConfigDir();
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const CLIJS_BACKUP_FILE = path.join(CONFIG_DIR, 'cli.js.backup');
export const NATIVE_BINARY_BACKUP_FILE = path.join(
  CONFIG_DIR,
  'native-binary.backup'
);
export const SYSTEM_PROMPTS_DIR = path.join(CONFIG_DIR, 'system-prompts');
export const PROMPT_CACHE_DIR = path.join(CONFIG_DIR, 'prompt-data-cache');

/**
 * Checks for multiple config locations and warns user
 * Called during startup to help users understand which config is active
 */
export const warnAboutMultipleConfigs = (): void => {
  const configDir = CONFIG_DIR;
  const home = os.homedir();

  const locations = [
    path.join(home, '.tweakcc'),
    path.join(home, '.claude', 'tweakcc'),
    process.env.XDG_CONFIG_HOME
      ? path.join(process.env.XDG_CONFIG_HOME, 'tweakcc')
      : null,
  ].filter(loc => loc !== null);

  const existingLocations = locations.filter(loc => {
    try {
      return fsSync.existsSync(loc) && loc !== configDir;
    } catch {
      return false;
    }
  });

  if (existingLocations.length > 0) {
    console.warn(chalk.yellow('\nMultiple configuration locations detected:'));
    console.warn(chalk.gray(`   Active: ${configDir}`));
    console.warn(chalk.gray('   Other existing locations:'));
    existingLocations.forEach(loc => {
      console.warn(chalk.gray(`     - ${loc}`));
    });
    console.warn(
      chalk.gray('   Only the active location is used. To switch locations,')
    );
    console.warn(
      chalk.gray('   move your config.json to the desired directory.\n')
    );
  }
};

export const ensureConfigDir = async (): Promise<void> => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(SYSTEM_PROMPTS_DIR, { recursive: true });

  // Generate a .gitignore file in case the user wants to version control their config directory
  // with config.json and the system prompts.
  const gitignorePath = path.join(CONFIG_DIR, '.gitignore');
  try {
    await fs.stat(gitignorePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      await fs.writeFile(
        gitignorePath,
        [
          '.DS_Store',
          'prompt-data-cache',
          'cli.js.backup',
          'native-binary.backup',
          'native-claudejs-orig.js',
          'native-claudejs-patched.js',
          'systemPromptAppliedHashes.json',
          'systemPromptOriginalHashes.json',
          'system-prompts/*.diff.html',
        ].join(EOL) + EOL
      );
    }
  }
};

// Lazy initialization to avoid circular dependency with DEFAULT_SETTINGS
let lastConfig: TweakccConfig | null = null;

/**
 * Loads the contents of the config file, or default values if it doesn't exist yet.
 */
export const readConfigFile = async (): Promise<TweakccConfig> => {
  const config: TweakccConfig = {
    ccVersion: '',
    ccInstallationPath: null,
    lastModified: new Date().toISOString(),
    changesApplied: true,
    settings: DEFAULT_SETTINGS,
  };
  try {
    debug(`Reading config at ${CONFIG_FILE}`);

    // Check for multiple configs and warn user
    warnAboutMultipleConfigs();

    const content = await fs.readFile(CONFIG_FILE, 'utf8');
    const readConfig: TweakccConfig = { ...config, ...JSON.parse(content) };

    // In v1.1.0 thinkingVerbs.punctuation was renamed to thinkingVerbs.format.  This should catch
    // old configs.
    const tmpThinkingVerbs = readConfig?.settings
      ?.thinkingVerbs as ThinkingVerbsConfig & { punctuation?: string };
    if (tmpThinkingVerbs?.punctuation) {
      tmpThinkingVerbs.format = '{}' + tmpThinkingVerbs.punctuation;
      delete tmpThinkingVerbs.punctuation;
    }

    // Add any missing top-level settings properties from defaults
    if (!readConfig.settings.inputBox) {
      readConfig.settings.inputBox = DEFAULT_SETTINGS.inputBox;
    }
    if (!readConfig.settings.toolsets) {
      readConfig.settings.toolsets = DEFAULT_SETTINGS.toolsets;
    }
    if (!Object.hasOwn(readConfig.settings, 'defaultToolset')) {
      readConfig.settings.defaultToolset = DEFAULT_SETTINGS.defaultToolset;
    }
    if (!Object.hasOwn(readConfig.settings, 'planModeToolset')) {
      readConfig.settings.planModeToolset = DEFAULT_SETTINGS.planModeToolset;
    }

    // Add any colors that the user doesn't have to any built-in themes.
    for (const defaultTheme of DEFAULT_SETTINGS.themes) {
      // Find this theme in the user's settings.
      const readTheme = readConfig?.settings?.themes.find(
        t => t.id === defaultTheme.id || t.name === defaultTheme.name
      );
      if (readTheme) {
        // Add any missing top-level properties (like name, id)
        for (const [key, value] of Object.entries(defaultTheme)) {
          if (key !== 'colors' && !Object.hasOwn(readTheme, key)) {
            (readTheme as unknown as Record<string, unknown>)[key] = value;
          }
        }

        // Add any missing colors
        if (!readTheme.colors) {
          readTheme.colors = {} as Theme['colors'];
        }
        for (const [colorKey, colorValue] of Object.entries(
          defaultTheme.colors
        )) {
          if (!Object.hasOwn(readTheme.colors, colorKey)) {
            (readTheme.colors as Record<string, string>)[colorKey] = colorValue;
          }
        }
      }
    }

    // Also add missing colors to custom themes (non-built-in themes)
    for (const readTheme of readConfig?.settings?.themes || []) {
      // Skip built-in themes (already handled above)
      const isBuiltIn = DEFAULT_SETTINGS.themes.some(
        dt => dt.id === readTheme.id || dt.name === readTheme.name
      );
      if (isBuiltIn) continue;

      // For custom themes, use the first default theme as a template for missing colors
      const defaultTemplate = DEFAULT_SETTINGS.themes[0];
      if (!readTheme.colors) {
        readTheme.colors = {} as Theme['colors'];
      }
      for (const [colorKey, colorValue] of Object.entries(
        defaultTemplate.colors
      )) {
        if (!Object.hasOwn(readTheme.colors, colorKey)) {
          // Use the template's color as a fallback
          (readTheme.colors as Record<string, string>)[colorKey] = colorValue;
        }
      }
    }

    // Add userMessageDisplay if it doesn't exist in the config; it was added in v1.4.0.
    if (!readConfig?.settings?.userMessageDisplay) {
      readConfig.settings = readConfig.settings || DEFAULT_SETTINGS;
      readConfig.settings.userMessageDisplay =
        DEFAULT_SETTINGS.userMessageDisplay;
    }

    // In v3.2.0 userMessageDisplay was restructured from prefix/message to a single format string.
    migrateUserMessageDisplayToV320(readConfig);

    // Remove launchText if it exists in the config; it was removed in v3.0.0.
    delete (readConfig.settings as Settings & { launchText: unknown })
      .launchText;

    // Check if system prompts have been modified since they were last applied
    // If so, mark changesApplied as false to show the "*Apply customizations" indicator
    const hasSystemPromptChanges =
      await hasUnappliedSystemPromptChanges(SYSTEM_PROMPTS_DIR);
    if (hasSystemPromptChanges) {
      readConfig.changesApplied = false;
    }

    lastConfig = readConfig;
    return readConfig;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return config;
    }
    throw error;
  }
};

/**
 * Updates the config file with the changes made by the `updateFn` callback.
 */
export const updateConfigFile = async (
  updateFn: (config: TweakccConfig) => void
): Promise<TweakccConfig> => {
  debug(`Updating config at ${CONFIG_FILE}`);

  // Ensure lastConfig is initialized
  if (!lastConfig) {
    lastConfig = await readConfigFile();
  }
  updateFn(lastConfig);
  lastConfig.lastModified = new Date().toISOString();
  await saveConfig(lastConfig);
  return lastConfig;
};

/**
 * Internal function to write contents to the config file.
 */
const saveConfig = async (config: TweakccConfig): Promise<void> => {
  try {
    config.lastModified = new Date().toISOString();
    await ensureConfigDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
};
