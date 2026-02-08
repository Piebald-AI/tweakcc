import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EOL } from 'node:os';
import chalk from 'chalk';

import {
  RemoteConfig,
  Settings,
  Theme,
  ThinkingVerbsConfig,
  TweakccConfig,
} from './types';
import { debug, expandTilde, deepMergeWithDefaults } from './utils';
import { hasUnappliedSystemPromptChanges } from './systemPromptHashIndex';
import {
  migrateUserMessageDisplayToV320,
  migrateHideCtrlGToEditPrompt,
} from './migration';
import {
  DEFAULT_SETTINGS,
  DEFAULT_INPUT_PATTERN_HIGHLIGHTER,
  DEFAULT_TOOLSET,
  DEFAULT_THEME,
} from './defaultSettings';

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
 * Creates a default config structure with empty/default values.
 */
const createDefaultConfig = (): TweakccConfig => ({
  ccVersion: '',
  ccInstallationPath: null,
  lastModified: new Date().toISOString(),
  changesApplied: true,
  settings: DEFAULT_SETTINGS,
});

/**
 * Applies migrations and normalizations to a parsed config object.
 * This handles:
 * - Legacy field migrations (thinkingVerbs.punctuation -> format)
 * - Deep merging with defaults to fill missing fields
 * - Merging array items (highlighters, toolsets, themes) with their default templates
 * - Removing deprecated fields (launchText)
 *
 * @param config - The config object to normalize (modified in place)
 */
const normalizeConfig = (config: TweakccConfig): void => {
  // In v1.1.0 thinkingVerbs.punctuation was renamed to thinkingVerbs.format
  const tmpThinkingVerbs = config?.settings
    ?.thinkingVerbs as ThinkingVerbsConfig & {
    punctuation?: string;
  };
  if (tmpThinkingVerbs?.punctuation) {
    tmpThinkingVerbs.format = '{}' + tmpThinkingVerbs.punctuation;
    delete tmpThinkingVerbs.punctuation;
  }

  // Deep merge the loaded settings with defaults to fill in any missing keys (recursively)
  // This ensures all required properties exist, including nested ones like inputPatternHighlighters
  config.settings = deepMergeWithDefaults(
    config.settings,
    DEFAULT_SETTINGS
  ) as Settings;

  // Merge each inputPatternHighlighter item against the default template
  // This ensures each highlighter has all required properties even if some were deleted
  if (config.settings.inputPatternHighlighters) {
    config.settings.inputPatternHighlighters =
      config.settings.inputPatternHighlighters.map(
        highlighter =>
          deepMergeWithDefaults(
            highlighter,
            DEFAULT_INPUT_PATTERN_HIGHLIGHTER
          ) as typeof DEFAULT_INPUT_PATTERN_HIGHLIGHTER
      );
  }

  // Merge each toolset item against the default template
  // This ensures each toolset has all required properties even if some were deleted
  if (config.settings.toolsets) {
    config.settings.toolsets = config.settings.toolsets.map(
      toolset =>
        deepMergeWithDefaults(
          toolset,
          DEFAULT_TOOLSET
        ) as typeof DEFAULT_TOOLSET
    );
  }

  // Merge each theme item against the default template
  // This ensures each theme has all required properties (name, id, colors) even if some were deleted
  if (config.settings.themes) {
    config.settings.themes = config.settings.themes.map(
      theme => deepMergeWithDefaults(theme, DEFAULT_THEME) as Theme
    );
  }

  // In v3.2.0 userMessageDisplay was restructured from prefix/message to a single format string.
  migrateUserMessageDisplayToV320(config);

  // In 3.2.6 hideCtrlGToEditPrompt was renamed to hideCtrlGToEdit.
  migrateHideCtrlGToEditPrompt(config);

  // Remove launchText if it exists in the config; it was removed in v3.0.0.
  delete (config.settings as Settings & { launchText: unknown }).launchText;
};

/**
 * Loads the contents of the config file, or default values if it doesn't exist yet.
 */
export const readConfigFile = async (): Promise<TweakccConfig> => {
  const defaultConfig = createDefaultConfig();

  try {
    debug(`Reading config at ${CONFIG_FILE}`);

    // Check for multiple configs and warn user
    warnAboutMultipleConfigs();

    const content = await fs.readFile(CONFIG_FILE, 'utf8');
    const config: TweakccConfig = { ...defaultConfig, ...JSON.parse(content) };

    const beforeNormalize = JSON.stringify(config);

    normalizeConfig(config);

    const hasSystemPromptChanges =
      await hasUnappliedSystemPromptChanges(SYSTEM_PROMPTS_DIR);
    if (hasSystemPromptChanges) {
      config.changesApplied = false;
    }

    const changed =
      JSON.stringify(config) !== beforeNormalize || hasSystemPromptChanges;
    if (changed) {
      await saveConfig(config);
    }

    lastConfig = config;
    return config;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return defaultConfig;
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

/**
 * Fetches configuration from a URL.
 * The remote config should contain settings fields directly (themes, toolsets, etc.),
 * NOT wrapped in a "settings" object. For example:
 *
 *   {
 *     "themes": [...],
 *     "toolsets": [...],
 *     "thinkingVerbs": { ... }
 *   }
 *
 * Machine-specific fields (ccInstallationPath, ccVersion) are read from the
 * local config file. Missing fields are filled in with defaults.
 *
 * The fetched remote config is cached in the local config.json under the
 * `remoteConfig` field with `sourceUrl` and `settings` properties.
 *
 * @param url - The URL to fetch the configuration from
 * @returns The parsed and merged configuration
 * @throws Error if the URL is invalid, network fails, or JSON is invalid
 */
export const fetchConfigFromUrl = async (
  url: string
): Promise<TweakccConfig> => {
  debug(`Fetching config from URL: ${url}`);

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      `Invalid URL format: ${url}\n` +
        `  Expected a valid URL like https://example.com/config.json`
    );
  }

  // Only allow http and https protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(
      `Unsupported URL protocol: ${parsedUrl.protocol}\n` +
        `  Only http:// and https:// URLs are supported`
    );
  }

  // Read local config to get machine-specific fields (ccInstallationPath, ccVersion)
  let localConfig: TweakccConfig;
  try {
    const localContent = await fs.readFile(CONFIG_FILE, 'utf8');
    localConfig = JSON.parse(localContent);
  } catch {
    // If local config doesn't exist or is invalid, use empty defaults
    localConfig = createDefaultConfig();
  }

  // Fetch the config from URL
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'tweakcc',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch config from ${url}\n` +
        `  Network error: ${message}\n` +
        `  Please check your internet connection and try again.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch config from ${url}\n` +
        `  HTTP ${response.status}: ${response.statusText}\n` +
        `  Please check that the URL is correct and accessible.`
    );
  }

  // Parse JSON - the remote config contains settings fields directly
  let remoteSettings: Partial<Settings>;
  try {
    const content = await response.text();
    remoteSettings = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse config from ${url}\n` +
        `  JSON parse error: ${message}\n` +
        `  Please ensure the URL returns valid JSON.`
    );
  }

  // Store the remote config in local config.json for reference
  const remoteConfig: RemoteConfig = {
    sourceUrl: url,
    dateFetched: new Date().toISOString(),
    settings: remoteSettings,
  };
  await updateConfigFile(cfg => {
    cfg.remoteConfig = remoteConfig;
  });

  // Build the full config using local machine-specific fields and remote settings
  const config: TweakccConfig = {
    ...createDefaultConfig(),
    ccVersion: localConfig.ccVersion || '',
    ccInstallationPath: localConfig.ccInstallationPath || null,
    settings: {
      ...DEFAULT_SETTINGS,
      ...remoteSettings,
    } as Settings,
    remoteConfig,
  };

  // Apply migrations and normalize the config
  normalizeConfig(config);

  debug(`Successfully fetched and parsed config from ${url}`);

  return config;
};
