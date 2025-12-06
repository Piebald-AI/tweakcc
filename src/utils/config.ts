import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { EOL } from 'node:os';
import { execSync } from 'node:child_process';
import {
  ClaudeCodeInstallationInfo,
  CLIJS_BACKUP_FILE,
  CLIJS_SEARCH_PATHS,
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_SETTINGS,
  NATIVE_BINARY_BACKUP_FILE,
  Settings,
  StartupCheckInfo,
  SYSTEM_PROMPTS_DIR,
  Theme,
  ThinkingVerbsConfig,
  TweakccConfig,
} from './types.js';
import {
  hashFileInChunks,
  isDebug,
  replaceFileBreakingHardLinks,
} from './misc.js';
import { syncSystemPrompts, displaySyncResults } from './promptSync.js';
import {
  hasUnappliedSystemPromptChanges,
  clearAllAppliedHashes,
} from './systemPromptHashIndex.js';
import { extractClaudeJsFromNativeInstallation } from './nativeInstallation.js';

export const ensureConfigDir = async (): Promise<void> => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(SYSTEM_PROMPTS_DIR, { recursive: true });

  // Generate a .gitignore file in case the user wants to version control their ~/.tweakcc with
  // config.json and the system prompts.
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
          'system-prompts',
        ].join(EOL) + EOL
      );
    }
  }
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
 * Only applies to NPM installs. For native installs, this is a no-op.
 */
export const restoreClijsFromBackup = async (
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<boolean> => {
  // Only restore cli.js for NPM installs (when cliPath is set)
  if (!ccInstInfo.cliPath) {
    if (isDebug()) {
      console.log(
        'restoreClijsFromBackup: Skipping for native installation (no cliPath)'
      );
    }
    return false;
  }

  if (isDebug()) {
    console.log(`Restoring cli.js from backup to ${ccInstInfo.cliPath}`);
  }

  // Read the backup content
  const backupContent = await fs.readFile(CLIJS_BACKUP_FILE);

  // Replace the file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(
    ccInstInfo.cliPath,
    backupContent,
    'restore'
  );

  // Clear all applied hashes since we're restoring to defaults
  await clearAllAppliedHashes();

  await updateConfigFile(config => {
    config.changesApplied = false;
  });

  return true;
};

/**
 * Restores the native installation binary from backup.
 * This function restores the original native binary and clears changesApplied,
 * so patches can be re-applied from a clean state.
 */
export const restoreNativeBinaryFromBackup = async (
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<boolean> => {
  if (!ccInstInfo.nativeInstallationPath) {
    if (isDebug()) {
      console.log(
        'restoreNativeBinaryFromBackup: No native installation path, skipping'
      );
    }
    return false;
  }

  if (!(await doesFileExist(NATIVE_BINARY_BACKUP_FILE))) {
    if (isDebug()) {
      console.log(
        'restoreNativeBinaryFromBackup: No backup file exists, skipping'
      );
    }
    return false;
  }

  if (isDebug()) {
    console.log(
      `Restoring native binary from backup to ${ccInstInfo.nativeInstallationPath}`
    );
  }

  // Read the backup content
  const backupContent = await fs.readFile(NATIVE_BINARY_BACKUP_FILE);

  // Replace the file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(
    ccInstInfo.nativeInstallationPath,
    backupContent,
    'restore'
  );

  return true;
};

interface ClaudeExecutablePathInfo {
  commandPath: string;
  resolvedPath: string;
  isSymlink: boolean;
}

/**
 * Finds the claude executable on PATH (POSIX platforms only).
 * Returns the resolved executable info, or null if not found.
 */
async function findClaudeExecutableOnPath(): Promise<ClaudeExecutablePathInfo | null> {
  if (process.platform === 'win32') {
    if (isDebug()) {
      console.log(
        'Skipping PATH-based claude executable lookup on Windows; symlink fallback is POSIX-only.'
      );
    }
    return null;
  }

  try {
    const command = 'which claude';

    if (isDebug()) {
      console.log(`Looking for claude executable using: ${command}`);
    }

    const result = execSync(command, { encoding: 'utf8' }).trim();
    const firstPath = result.split('\n')[0]?.trim();

    if (!firstPath) {
      return null;
    }

    let stats: Stats | null = null;
    try {
      stats = await fs.lstat(firstPath);
    } catch (error) {
      if (isDebug()) {
        console.log('lstat failed for claude executable path:', error);
      }
      return null;
    }

    const isSymlink = stats?.isSymbolicLink() ?? false;

    try {
      const realPath = await fs.realpath(firstPath);
      if (isDebug()) {
        if (isSymlink && realPath !== firstPath) {
          console.log(`Found claude executable at: ${firstPath} (symlink)`);
          console.log(`Resolved to: ${realPath}`);
        } else {
          console.log(`Found claude executable at: ${realPath}`);
        }
      }

      return {
        commandPath: firstPath,
        resolvedPath: realPath,
        isSymlink,
      };
    } catch (error) {
      if (isDebug()) {
        console.log('Could not resolve symlink, using original path:', error);
      }
      return {
        commandPath: firstPath,
        resolvedPath: firstPath,
        isSymlink,
      };
    }
  } catch (error) {
    if (isDebug()) {
      console.log('Could not find claude executable on PATH:', error);
    }
  }

  return null;
}

/**
 * Extracts version from claude.js content.
 * Searches for VERSION:"x.y.z" patterns and returns the version that appears most frequently.
 */
function extractVersionFromContent(content: string): string | null {
  const versionRegex = /\bVERSION:"(\d+\.\d+\.\d+)"/g;
  const versionCounts = new Map<string, number>();

  let match;
  while ((match = versionRegex.exec(content)) !== null) {
    const version = match[1];
    versionCounts.set(version, (versionCounts.get(version) || 0) + 1);
  }

  if (versionCounts.size === 0) {
    return null;
  }

  // Find the version with the most occurrences
  let maxCount = 0;
  let mostCommonVersion: string | undefined;

  for (const [version, count] of versionCounts.entries()) {
    if (isDebug()) {
      console.log(`Found version ${version} with ${count} occurrences`);
    }
    if (count > maxCount) {
      maxCount = count;
      mostCommonVersion = version;
    }
  }

  if (isDebug() && mostCommonVersion) {
    console.log(
      `Extracted version ${mostCommonVersion} (${maxCount} occurrences)`
    );
  }

  return mostCommonVersion || null;
}

async function doesFileExist(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return false;
    }
    throw error;
  }
}

const CLAUDE_PACKAGE_SEGMENT = `${path.sep}@anthropic-ai${path.sep}claude-code`;

/**
 * Extracts the Claude Code version from the minified JS file.
 * @throws {Error} If the file cannot be read or no VERSION strings are found
 */
async function extractVersionFromJsFile(cliPath: string): Promise<string> {
  const content = await fs.readFile(cliPath, 'utf8');
  const version = extractVersionFromContent(content);

  if (!version) {
    throw new Error(`No VERSION strings found in JS file: ${cliPath}`);
  }

  return version;
}

/**
 * Attempts to derive the package root path for @anthropic-ai/claude-code from a resolved executable
 * path (typically the target of a symlink returned by `which claude`).  Returns the cli.js path if
 * it exists under that package root.
 */
async function findClijsFromExecutablePath(
  resolvedExecutablePath: string
): Promise<string | null> {
  const normalizedPath = path.normalize(resolvedExecutablePath);
  const segmentIndex = normalizedPath.lastIndexOf(CLAUDE_PACKAGE_SEGMENT);

  if (segmentIndex === -1) {
    return null;
  }

  const packageRoot = normalizedPath.slice(
    0,
    segmentIndex + CLAUDE_PACKAGE_SEGMENT.length
  );
  const potentialCliJs = path.join(packageRoot, 'cli.js');

  if (await doesFileExist(potentialCliJs)) {
    return potentialCliJs;
  }

  return null;
}

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

      // Check for cli.js
      const cliPath = path.join(searchPath, 'cli.js');
      if (!(await doesFileExist(cliPath))) {
        continue;
      }
      if (isDebug()) {
        console.log(
          `Found Claude Code cli.js file at ${searchPath}; checking hash...`
        );
        console.log(`SHA256 hash: ${await hashFileInChunks(cliPath)}`);
      }

      // Extract version from the cli.js file itself
      const version = await extractVersionFromJsFile(cliPath);

      return {
        cliPath: cliPath,
        version,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        // Continue searching if this path fails or is not a directory.
        continue;
      } else {
        throw error;
      }
    }
  }

  // If we didn't find cli.js in the usual locations, try extracting from native installation
  if (isDebug()) {
    console.log(
      'Could not find cli.js in standard locations, trying native installation method...'
    );
  }

  const claudeExeInfo = await findClaudeExecutableOnPath();
  if (isDebug()) {
    console.log(
      `findClaudeExecutableOnPath() returned: ${
        claudeExeInfo ? claudeExeInfo.resolvedPath : null
      }`
    );
  }

  if (claudeExeInfo) {
    const { resolvedPath, isSymlink } = claudeExeInfo;

    let derivedCliJsPath: string | null = null;

    if (resolvedPath.endsWith('cli.js')) {
      derivedCliJsPath = resolvedPath;
      if (isDebug()) {
        console.log(
          'Resolved PATH executable already points at cli.js; treating as NPM installation.'
        );
      }
    } else if (isSymlink) {
      derivedCliJsPath = await findClijsFromExecutablePath(resolvedPath);
      if (isDebug()) {
        if (derivedCliJsPath) {
          console.log(
            `Symlink target resides inside Claude Code package; derived cli.js at ${derivedCliJsPath}`
          );
        } else {
          console.log(
            'Symlink target did not contain cli.js; attempting native extraction instead.'
          );
        }
      }
    }

    if (derivedCliJsPath) {
      try {
        const version = await extractVersionFromJsFile(derivedCliJsPath);

        if (isDebug()) {
          console.log(
            `Found Claude Code via symlink-derived cli.js at: ${derivedCliJsPath}`
          );
        }

        return {
          cliPath: derivedCliJsPath,
          version,
        };
      } catch (error) {
        if (isDebug()) {
          console.log(
            'Failed to extract version from cli.js found via symlink:',
            error
          );
        }
        // Fall through to try native installation method
      }
    }

    // Treat any found executable as a potential native installation
    // Always extract from the actual binary to get the correct version
    // (The backup is only used when applying modifications, not for version detection)
    if (isDebug()) {
      console.log(
        `Attempting to extract claude.js from native installation: ${resolvedPath}`
      );
    }

    const claudeJsBuffer = extractClaudeJsFromNativeInstallation(resolvedPath);

    if (claudeJsBuffer) {
      // Successfully extracted claude.js from native installation
      // Extract version from the buffer content
      const content = claudeJsBuffer.toString('utf8');
      const version = extractVersionFromContent(content);

      if (!version) {
        if (isDebug()) {
          console.log('Failed to extract version from native installation');
        }
        return null;
      }

      if (isDebug()) {
        console.log(`Extracted version ${version} from native installation`);
      }

      return {
        // cliPath is undefined for native installs - no file on disk
        version,
        nativeInstallationPath: resolvedPath,
      };
    }
  }

  return null;
};

const backupClijs = async (ccInstInfo: ClaudeCodeInstallationInfo) => {
  // Only backup cli.js for NPM installs (when cliPath is set)
  if (!ccInstInfo.cliPath) {
    if (isDebug()) {
      console.log('backupClijs: Skipping for native installation (no cliPath)');
    }
    return;
  }

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

/**
 * Backs up the native installation binary to the config directory.
 */
const backupNativeBinary = async (ccInstInfo: ClaudeCodeInstallationInfo) => {
  if (!ccInstInfo.nativeInstallationPath) {
    return;
  }

  await ensureConfigDir();
  if (isDebug()) {
    console.log(`Backing up native binary to ${NATIVE_BINARY_BACKUP_FILE}`);
  }
  await fs.copyFile(
    ccInstInfo.nativeInstallationPath,
    NATIVE_BINARY_BACKUP_FILE
  );
  await updateConfigFile(config => {
    config.changesApplied = false;
    config.ccVersion = ccInstInfo.version;
  });
};

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

  // Sync system prompts with the current CC version
  if (ccInstInfo.version) {
    try {
      const syncSummary = await syncSystemPrompts(ccInstInfo.version);
      displaySyncResults(syncSummary);
    } catch {
      // Error already logged with chalk.red in syncSystemPrompts
      // Continue with startup check even if prompt sync fails
    }
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

  // Backup native binary if we don't have any backup yet (for native installations)
  let hasBackedUpNativeBinary = false;
  if (
    ccInstInfo.nativeInstallationPath &&
    !(await doesFileExist(NATIVE_BINARY_BACKUP_FILE))
  ) {
    if (isDebug()) {
      console.log(
        `startupCheck: ${NATIVE_BINARY_BACKUP_FILE} not found; backing up native binary`
      );
    }
    await backupNativeBinary(ccInstInfo);
    hasBackedUpNativeBinary = true;
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

    // Also backup native binary if version changed
    if (ccInstInfo.nativeInstallationPath && !hasBackedUpNativeBinary) {
      if (isDebug()) {
        console.log(
          `startupCheck: real version (${realVersion}) != backed up version (${backedUpVersion}); backing up native binary`
        );
      }
      if (await doesFileExist(NATIVE_BINARY_BACKUP_FILE)) {
        await fs.unlink(NATIVE_BINARY_BACKUP_FILE);
      }
      await backupNativeBinary(ccInstInfo);
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
