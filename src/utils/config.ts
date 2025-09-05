import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ClaudeCodeInstallationInfo,
  CLIJS_BACKUP_FILE,
  CLIJS_SEARCH_PATHS,
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_SETTINGS,
  StartupCheckInfo,
  ThinkingVerbsConfig,
  TweakccConfig,
} from './types.js';
import { hashFileInChunks, isDebug } from './misc.js';

export const ensureConfigDir = async (): Promise<void> => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
};

let lastConfig: TweakccConfig = {
  settings: DEFAULT_SETTINGS,
  changesApplied: false,
  ccVersion: '',
  lastModified: '',
  ccInstallationDir: null,
};

/**
 * Loads the contents of the config file, or default values if it doesn't exist yet.
 */
export const readConfigFile = async (): Promise<TweakccConfig> => {
  const config: TweakccConfig = {
    ccVersion: '',
    ccInstallationDir: null,
    lastModified: new Date().toISOString(),
    changesApplied: true,
    settings: DEFAULT_SETTINGS,
  };
  try {
    if (isDebug()) {
      console.log(`Reading config at ${CONFIG_FILE}`);
    }

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

    // Add any colors that the user doesn't have to any built-in themes.
    for (const defaultTheme of DEFAULT_SETTINGS.themes) {
      // Find this theme in the user's settings.
      const readTheme = readConfig?.settings?.themes.find(
        t => t.id === defaultTheme.id || t.name === defaultTheme.name
      );
      if (readTheme) {
        // Add any missing colors.
        for (const [key, value] of Object.entries(defaultTheme)) {
          if (!Object.hasOwn(readTheme, key)) {
            (readTheme as unknown as Record<string, string>)[key] = value;
          }
        }
      }
    }

    // Add userMessageDisplay if it doesn't exist in the config; it was added in v1.4.0.
    if (!readConfig?.settings?.userMessageDisplay) {
      readConfig.settings = readConfig.settings || DEFAULT_SETTINGS;
      readConfig.settings.userMessageDisplay =
        DEFAULT_SETTINGS.userMessageDisplay;
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
  if (isDebug()) {
    console.log(`Updating config at ${CONFIG_FILE}`);
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
 * Restores the original cli.js file from the backup.
 */
export const restoreClijsFromBackup = async (
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<boolean> => {
  if (isDebug()) {
    console.log(`Restoring cli.js from backup to ${ccInstInfo.cliPath}`);
  }
  await fs.copyFile(CLIJS_BACKUP_FILE, ccInstInfo.cliPath);
  await updateConfigFile(config => {
    config.changesApplied = false;
  });

  return true;
};

/**
 * Searches for the Claude Code installation in the default locations.
 */
export const findClaudeCodeInstallation = async (
  config: TweakccConfig
): Promise<ClaudeCodeInstallationInfo | null> => {
  if (config.ccInstallationDir) {
    CLIJS_SEARCH_PATHS.unshift(config.ccInstallationDir);
  }

  for (const searchPath of CLIJS_SEARCH_PATHS) {
    try {
      if (isDebug()) {
        console.log(`Searching for Claude Code cli.js file at ${searchPath}`);
      }
      const cliPath = path.join(searchPath, 'cli.js');
      const packageJsonPath = path.join(searchPath, 'package.json');
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf8')
      );
      if (isDebug()) {
        console.log(
          `Found Claude Code cli.js file at ${searchPath}; checking hash...`
        );
        console.log(`SHA256 hash: ${await hashFileInChunks(cliPath)}`);
      }
      return {
        cliPath: cliPath,
        packageJsonPath,
        version: packageJson.version,
      };
    } catch {
      // Continue searching if this path fails.
      continue;
    }
  }

  return null;
};

const backupClijs = async (ccInstInfo: ClaudeCodeInstallationInfo) => {
  await ensureConfigDir();
  if (isDebug()) {
    console.log(`Backing up cli.js to ${CLIJS_BACKUP_FILE}`);
  }
  await fs.copyFile(ccInstInfo.cliPath, CLIJS_BACKUP_FILE);
  await updateConfigFile(config => {
    config.changesApplied = false;
    config.ccVersion = ccInstInfo.version;
  });
};

async function doesFileExist(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Performs startup checking: finding Claude Code, creating a backup if necessary, checking if
 * it's been updated.  If true, an update is required.
 */
export async function startupCheck(): Promise<StartupCheckInfo | null> {
  const config = await readConfigFile();

  const ccInstInfo = await findClaudeCodeInstallation(config);
  if (!ccInstInfo) {
    return null;
  }

  const realVersion = ccInstInfo.version;
  const backedUpVersion = config.ccVersion;

  // Backup cli.js if we don't have any backup yet.
  let hasBackedUp = false;
  if (!(await doesFileExist(CLIJS_BACKUP_FILE))) {
    if (isDebug()) {
      console.log(
        `startupCheck: ${CLIJS_BACKUP_FILE} not found; backing up cli.js`
      );
    }
    await backupClijs(ccInstInfo);
    hasBackedUp = true;
  }

  // If the installed CC version is different from what we have backed up, clear out our backup
  // and make a new one.
  if (realVersion !== backedUpVersion) {
    // The version we have backed up is different than what's installed.  Mostly likely the user
    // updated CC, so we should back up the new version.  If the backup didn't even exist until we
    // copied in there above, though, we shouldn't back it up twice.
    if (!hasBackedUp) {
      if (isDebug()) {
        console.log(
          `startupCheck: real version (${realVersion}) != backed up version (${backedUpVersion}); backing up cli.js`
        );
      }
      await fs.unlink(CLIJS_BACKUP_FILE);
      await backupClijs(ccInstInfo);
    }

    return {
      wasUpdated: true,
      oldVersion: backedUpVersion,
      newVersion: realVersion,
      ccInstInfo,
    };
  }

  return {
    wasUpdated: false,
    oldVersion: null,
    newVersion: null,
    ccInstInfo,
  };
}
