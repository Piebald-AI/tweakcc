import { execSync } from 'child_process';
import { Stats } from 'fs';
import path from 'path';

import { WASMagic } from 'wasmagic';

import { debug, hashFileInChunks } from './utils.js';
import { extractClaudeJsFromNativeInstallation } from './nativeInstallationLoader.js';
import fs from 'node:fs/promises';
import { ClaudeCodeInstallationInfo, TweakccConfig } from './types.js';
import { doesFileExist } from './utils.js';
import { CLIJS_SEARCH_PATHS } from './installationPaths.js';

interface ClaudeExecutablePathInfo {
  commandPath: string;
  resolvedPath: string;
  isSymlink: boolean;
}

// Message shown when PATH fallback check is performed (POSIX only)
// Windows skips PATH-based detection, so this is null on Windows
export const PATH_CHECK_TEXT: string | null =
  process.platform === 'win32'
    ? null
    : "Also checked for 'claude' executable on PATH using 'which claude'.";

let magicInstancePromise: Promise<WASMagic> | null = null;

async function getMagicInstance(): Promise<WASMagic> {
  if (!magicInstancePromise) {
    magicInstancePromise = WASMagic.create();
  }
  return magicInstancePromise!;
}

/**
 * Finds the claude executable on PATH (POSIX platforms only).
 * Returns the resolved executable info, or null if not found.
 */
async function findClaudeExecutableOnPath(): Promise<ClaudeExecutablePathInfo | null> {
  if (process.platform === 'win32') {
    debug(
      'Skipping PATH-based claude executable lookup on Windows; symlink fallback is POSIX-only.'
    );
    return null;
  }

  try {
    const command = 'which claude';

    debug(`Looking for claude executable using: ${command}`);

    const result = execSync(command, { encoding: 'utf8' }).trim();
    const firstPath = result.split('\n')[0]?.trim();

    if (!firstPath) {
      return null;
    }

    let stats: Stats | null = null;
    try {
      stats = await fs.lstat(firstPath);
    } catch (error) {
      debug('lstat failed for claude executable path:', error);
      return null;
    }

    const isSymlink = stats?.isSymbolicLink() ?? false;

    try {
      const realPath = await fs.realpath(firstPath);
      if (isSymlink && realPath !== firstPath) {
        debug(`Found claude executable at: ${firstPath} (symlink)`);
        debug(`Resolved to: ${realPath}`);
      } else {
        debug(`Found claude executable at: ${realPath}`);
      }

      return {
        commandPath: firstPath,
        resolvedPath: realPath,
        isSymlink,
      };
    } catch (error) {
      debug('Could not resolve symlink, using original path:', error);
      return {
        commandPath: firstPath,
        resolvedPath: firstPath,
        isSymlink,
      };
    }
  } catch (error) {
    debug('Could not find claude executable on PATH:', error);
  }

  return null;
}

async function readFilePrefix(
  filePath: string,
  maxBytes = 4096
): Promise<Buffer | null> {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(maxBytes);
      const { bytesRead } = await handle.read({
        buffer,
        position: 0,
        length: maxBytes,
      });
      if (bytesRead <= 0) {
        return null;
      }
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch (error) {
    debug('Failed to read file prefix for WASMagic:', error);
    return null;
  }
}

async function detectClaudeExecutableKind(
  exePath: string
): Promise<'js' | 'binary' | 'other'> {
  const prefix = await readFilePrefix(exePath);
  if (!prefix) {
    return 'other';
  }

  try {
    const magic = await getMagicInstance();
    let mime: string | null = null;

    if (typeof magic.detect === 'function') {
      mime = magic.detect(prefix) || null;
    }

    if (!mime) {
      return 'other';
    }

    const lower = mime.toLowerCase();
    if (lower.includes('javascript')) {
      return 'js';
    }
    if (!lower.startsWith('text/')) {
      return 'binary';
    }
    return 'other';
  } catch (error) {
    debug('WASMagic detection failed, falling back to search paths:', error);
    return 'other';
  }
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
    debug(`Found version ${version} with ${count} occurrences`);
    if (count > maxCount) {
      maxCount = count;
      mostCommonVersion = version;
    }
  }

  if (mostCommonVersion) {
    debug(`Extracted version ${mostCommonVersion} (${maxCount} occurrences)`);
  }

  return mostCommonVersion || null;
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
  // Prefer explicit installation path if provided - this takes priority over all other detection methods.
  // This path may point to either a JS cli.js file or a native binary.
  if (config.ccInstallationPath) {
    const installPath = config.ccInstallationPath;
    try {
      if (!(await doesFileExist(config.ccInstallationPath))) {
        console.warn(
          `Configured ccInstallationPath does not exist: ${config.ccInstallationPath}`
        );
        console.warn('Falling back to automatic detection...');
      } else {
        const kind = await detectClaudeExecutableKind(installPath);

        if (kind === 'js') {
          debug(
            `Using Claude Code cli.js from explicit ccInstallationPath: ${installPath}`
          );
          debug(`SHA256 hash: ${await hashFileInChunks(installPath)}`);
          const version = await extractVersionFromJsFile(installPath);
          return {
            cliPath: installPath,
            version,
          };
        }

        if (kind === 'binary') {
          debug(
            `Using native Claude installation from explicit ccInstallationPath: ${installPath}`
          );

          const claudeJsBuffer =
            await extractClaudeJsFromNativeInstallation(installPath);

          if (claudeJsBuffer) {
            const content = claudeJsBuffer.toString('utf8');
            const version = extractVersionFromContent(content);

            if (version) {
              debug(
                `Extracted version ${version} from native installation via explicit ccInstallationPath`
              );
              return {
                version,
                nativeInstallationPath: installPath,
              };
            }
          }

          console.warn(
            `Configured ccInstallationPath appears to be a native binary, but version could not be determined: ${installPath}`
          );
          console.warn('Falling back to automatic detection...');
        } else {
          console.warn(
            `Configured ccInstallationPath is not recognized as JavaScript or a native binary: ${installPath}`
          );
          console.warn('Falling back to automatic detection...');
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        console.warn(
          `Configured ccInstallationPath is not accessible: ${installPath}`
        );
        console.warn('Falling back to automatic detection...');
      } else {
        throw error;
      }
    }
  }

  // Next, try to locate `claude` on PATH and use WASMagic to determine
  // whether it is a JS entrypoint (cli.js) or a native binary.
  const claudeExePathInfo = await findClaudeExecutableOnPath();
  debug(
    `findClaudeExecutableOnPath() returned: ${claudeExePathInfo?.resolvedPath ?? null}`
  );

  if (claudeExePathInfo) {
    const claudeExePath = claudeExePathInfo.resolvedPath;
    const kind = await detectClaudeExecutableKind(claudeExePath);
    debug(`WASMagic classified claude executable as: ${kind}`);
    if (kind === 'other') {
      debug(
        'PATH claude executable did not look like JavaScript or a native binary; falling back to CLIJS_SEARCH_PATHS.'
      );
    }

    if (kind === 'js') {
      debug(`Treating PATH claude executable as cli.js at: ${claudeExePath}`);
      debug(`SHA256 hash: ${await hashFileInChunks(claudeExePath)}`);

      const version = await extractVersionFromJsFile(claudeExePath);
      return {
        cliPath: claudeExePath,
        version,
      };
    }

    if (kind === 'binary') {
      debug(
        `Treating PATH claude executable as native installation: ${claudeExePath}`
      );

      const claudeJsBuffer =
        await extractClaudeJsFromNativeInstallation(claudeExePath);

      if (claudeJsBuffer) {
        const content = claudeJsBuffer.toString('utf8');
        const version = extractVersionFromContent(content);

        if (!version) {
          debug('Failed to extract version from native installation via PATH');
        } else {
          debug(
            `Extracted version ${version} from native installation via PATH`
          );

          return {
            version,
            nativeInstallationPath: claudeExePath,
          };
        }
      }
    }
  }

  // Fall back to the hard-coded cli.js detection paths.
  for (const searchPath of CLIJS_SEARCH_PATHS) {
    try {
      debug(`Searching for Claude Code cli.js file at ${searchPath}`);

      // Check for cli.js
      const cliPath = path.join(searchPath, 'cli.js');
      if (!(await doesFileExist(cliPath))) {
        continue;
      }
      debug(`Found Claude Code cli.js file at ${searchPath}; checking hash...`);
      debug(`SHA256 hash: ${await hashFileInChunks(cliPath)}`);

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
  debug(
    'Could not find cli.js in standard locations, trying native installation method...'
  );

  const claudeExeInfo = await findClaudeExecutableOnPath();
  debug(
    `findClaudeExecutableOnPath() returned: ${
      claudeExeInfo ? claudeExeInfo.resolvedPath : null
    }`
  );

  if (claudeExeInfo) {
    const { resolvedPath, isSymlink } = claudeExeInfo;

    let derivedCliJsPath: string | null = null;

    if (resolvedPath.endsWith('cli.js')) {
      derivedCliJsPath = resolvedPath;
      debug(
        'Resolved PATH executable already points at cli.js; treating as NPM installation.'
      );
    } else if (isSymlink) {
      derivedCliJsPath = await findClijsFromExecutablePath(resolvedPath);
      if (derivedCliJsPath) {
        debug(
          `Symlink target resides inside Claude Code package; derived cli.js at ${derivedCliJsPath}`
        );
      } else {
        debug(
          'Symlink target did not contain cli.js; attempting native extraction instead.'
        );
      }
    }

    if (derivedCliJsPath) {
      try {
        const version = await extractVersionFromJsFile(derivedCliJsPath);

        debug(
          `Found Claude Code via symlink-derived cli.js at: ${derivedCliJsPath}`
        );

        return {
          cliPath: derivedCliJsPath,
          version,
        };
      } catch (error) {
        debug(
          'Failed to extract version from cli.js found via symlink:',
          error
        );
        // Fall through to try native installation method
      }
    }

    // Treat any found executable as a potential native installation
    // Always extract from the actual binary to get the correct version
    // (The backup is only used when applying modifications, not for version detection)
    debug(
      `Attempting to extract claude.js from native installation: ${resolvedPath}`
    );

    const claudeJsBuffer =
      await extractClaudeJsFromNativeInstallation(resolvedPath);

    if (claudeJsBuffer) {
      // Successfully extracted claude.js from native installation
      // Extract version from the buffer content
      const content = claudeJsBuffer.toString('utf8');
      const version = extractVersionFromContent(content);

      if (!version) {
        debug('Failed to extract version from native installation');
        return null;
      }

      debug(`Extracted version ${version} from native installation`);

      return {
        // cliPath is undefined for native installs - no file on disk
        version,
        nativeInstallationPath: resolvedPath,
      };
    }
  }

  return null;
};
