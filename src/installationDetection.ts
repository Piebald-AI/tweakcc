import path from 'path';
import fs from 'node:fs/promises';
import which from 'which';
import { WASMagic } from 'wasmagic';

import {
  debug,
  isDebug,
  hashFileInChunks,
  doesFileExist,
  compareSemverVersions,
} from './utils';
import { extractClaudeJsFromNativeInstallation } from './nativeInstallationLoader';
import { CLIJS_SEARCH_PATHS, NATIVE_SEARCH_PATHS } from './installationPaths';
import { CONFIG_FILE, updateConfigFile } from './config';
import {
  ClaudeCodeInstallationInfo,
  FindInstallationOptions,
  InstallationCandidate,
  InstallationKind,
  InstallationSource,
  TweakccConfig,
} from './types';

// ============================================================================
// Types
// ============================================================================

interface ResolvedInstallation {
  kind: InstallationKind;
  resolvedPath: string;
}

// ============================================================================
// Error classes
// ============================================================================

export class InstallationDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallationDetectionError';
  }
}

// ============================================================================
// WASMagic singleton (with graceful fallback for SIMD-unsupported systems)
// ============================================================================

let magicInstancePromise: Promise<WASMagic | null> | null = null;

/**
 * Gets the WASMagic instance, or null if it fails to initialize.
 * This can happen on older CPUs that don't support WebAssembly SIMD (requires SSE 4.1+).
 */
async function getMagicInstance(): Promise<WASMagic | null> {
  if (!magicInstancePromise) {
    magicInstancePromise = WASMagic.create().catch(error => {
      debug(
        'WASMagic initialization failed (likely SIMD unsupported on this CPU):',
        error
      );
      debug('Using fallback file type detection');
      return null;
    });
  }
  return magicInstancePromise;
}

// ============================================================================
// Fallback file type detection (pure JavaScript, no WASM)
// ============================================================================

// Binary file magic numbers
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7FELF
const MACHO_MAGIC_32_BE = Buffer.from([0xfe, 0xed, 0xfa, 0xce]); // Mach-O 32-bit (big-endian)
const MACHO_MAGIC_64_BE = Buffer.from([0xfe, 0xed, 0xfa, 0xcf]); // Mach-O 64-bit (big-endian)
const MACHO_MAGIC_32_LE = Buffer.from([0xce, 0xfa, 0xed, 0xfe]); // Mach-O 32-bit (little-endian)
const MACHO_MAGIC_64_LE = Buffer.from([0xcf, 0xfa, 0xed, 0xfe]); // Mach-O 64-bit (little-endian)
const MACHO_FAT = Buffer.from([0xca, 0xfe, 0xba, 0xbe]); // Mach-O Fat/Universal binary
const PE_MAGIC = Buffer.from([0x4d, 0x5a]); // MZ (DOS/PE/Windows executable)

/**
 * Fallback file type detection using magic numbers and heuristics.
 * Used when WASMagic is unavailable (e.g., on CPUs without SIMD support).
 *
 * Returns 'javascript' for JS files, 'binary' for executables, or null if unknown.
 */
function detectFileTypeFallback(
  prefix: Buffer
): 'javascript' | 'binary' | null {
  if (prefix.length === 0) {
    return null;
  }

  // Check for shebang (#!/usr/bin/env node, #!/usr/bin/node, etc.)
  if (prefix[0] === 0x23 && prefix[1] === 0x21) {
    // #!
    const shebangLine = prefix.subarray(0, Math.min(256, prefix.length));
    const shebangStr = shebangLine.toString('utf8').split('\n')[0];
    if (shebangStr.includes('node')) {
      debug('detectFileTypeFallback: Detected JavaScript via shebang');
      return 'javascript';
    }
  }

  // Check for binary magic numbers
  if (prefix.length >= 4) {
    const first4 = prefix.subarray(0, 4);

    // ELF binary
    if (first4.equals(ELF_MAGIC)) {
      debug('detectFileTypeFallback: Detected ELF binary');
      return 'binary';
    }

    // Mach-O binaries (macOS/iOS)
    if (
      first4.equals(MACHO_MAGIC_32_BE) ||
      first4.equals(MACHO_MAGIC_64_BE) ||
      first4.equals(MACHO_MAGIC_32_LE) ||
      first4.equals(MACHO_MAGIC_64_LE) ||
      first4.equals(MACHO_FAT)
    ) {
      debug('detectFileTypeFallback: Detected Mach-O binary');
      return 'binary';
    }
  }

  // PE/Windows executable
  if (prefix.length >= 2 && prefix.subarray(0, 2).equals(PE_MAGIC)) {
    debug('detectFileTypeFallback: Detected PE binary');
    return 'binary';
  }

  // Heuristic: Check if file looks like text/JavaScript
  // JavaScript files (including minified cli.js without shebang) are text,
  // so they should be mostly printable ASCII characters.
  const sampleSize = Math.min(512, prefix.length);
  let printableCount = 0;
  let nullCount = 0;

  for (let i = 0; i < sampleSize; i++) {
    const byte = prefix[i];
    // Printable ASCII (space through tilde) or common whitespace
    if (
      (byte >= 0x20 && byte <= 0x7e) ||
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d
    ) {
      printableCount++;
    }
    if (byte === 0x00) {
      nullCount++;
    }
  }

  // If file has null bytes, it's likely binary
  if (nullCount > 0) {
    debug(
      `detectFileTypeFallback: Detected binary (${nullCount} null bytes in first ${sampleSize} bytes)`
    );
    return 'binary';
  }

  // If >90% printable, assume it's text (likely JavaScript)
  const printableRatio = printableCount / sampleSize;
  if (printableRatio > 0.9) {
    debug(
      `detectFileTypeFallback: Detected JavaScript via text heuristic (${Math.round(printableRatio * 100)}% printable)`
    );
    return 'javascript';
  }

  debug(
    `detectFileTypeFallback: Unknown file type (${Math.round(printableRatio * 100)}% printable)`
  );
  return null;
}

// ============================================================================
// Core detection functions
// ============================================================================

/**
 * Reads the first bytes of a file for magic detection.
 */
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
    debug('Failed to read file prefix:', error);
    return null;
  }
}

/**
 * Resolves a path to its installation type.
 * Handles symlinks by resolving to target.
 * Returns the kind and resolved path, or null if unrecognized.
 */
export async function resolvePathToInstallationType(
  filePath: string
): Promise<ResolvedInstallation | null> {
  try {
    // Resolve symlinks to get the actual file
    const resolvedPath = await fs.realpath(filePath);
    debug(`resolvePathToInstallationType: ${filePath} -> ${resolvedPath}`);

    // Read first bytes for magic detection
    const prefix = await readFilePrefix(resolvedPath);
    if (!prefix) {
      debug('resolvePathToInstallationType: Could not read file prefix');
      return null;
    }

    // Try WASMagic first (may be null on systems without SIMD support)
    const magic = await getMagicInstance();

    if (magic && typeof magic.detect === 'function') {
      // Use WASMagic for accurate MIME type detection
      const mime = magic.detect(prefix) || null;

      if (mime) {
        const lower = mime.toLowerCase();
        debug(`resolvePathToInstallationType: Detected mime type: ${lower}`);

        if (lower.includes('javascript')) {
          return { kind: 'npm-based', resolvedPath };
        }

        if (!lower.startsWith('text/')) {
          return { kind: 'native-binary', resolvedPath };
        }

        debug('resolvePathToInstallationType: Unrecognized file type');
        return null;
      }
    }

    // Fallback: WASMagic unavailable or returned no result
    // Use pure JavaScript detection (works on all systems)
    debug('resolvePathToInstallationType: Using fallback file type detection');
    const fallbackType = detectFileTypeFallback(prefix);

    if (fallbackType === 'javascript') {
      return { kind: 'npm-based', resolvedPath };
    }

    if (fallbackType === 'binary') {
      return { kind: 'native-binary', resolvedPath };
    }

    debug(
      'resolvePathToInstallationType: Fallback could not determine file type'
    );
    return null;
  } catch (error) {
    debug('resolvePathToInstallationType: Error:', error);
    return null;
  }
}

/**
 * Finds the claude executable on PATH using the `which` package.
 * Cross-platform: works on Windows, macOS, and Linux.
 */
async function getClaudeFromPath(): Promise<string | null> {
  try {
    const claudePath = await which('claude');
    debug(`getClaudeFromPath: Found claude at ${claudePath}`);
    return claudePath;
  } catch {
    debug('getClaudeFromPath: claude not found on PATH');
    return null;
  }
}

// ============================================================================
// Version extraction
// ============================================================================

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

/**
 * Extracts version from a cli.js file.
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
 * Extracts version from a native binary by extracting the embedded JS.
 */
async function extractVersionFromNativeBinary(
  binaryPath: string
): Promise<string> {
  const claudeJsBuffer =
    await extractClaudeJsFromNativeInstallation(binaryPath);

  if (!claudeJsBuffer) {
    throw new Error(`Could not extract JS from native binary: ${binaryPath}`);
  }

  const content = claudeJsBuffer.toString('utf8');
  const version = extractVersionFromContent(content);

  if (!version) {
    throw new Error(
      `No VERSION strings found in extracted JS from: ${binaryPath}`
    );
  }

  return version;
}

/**
 * Extracts version from filename for versioned binary paths.
 * e.g., ~/.local/share/claude/versions/2.0.65 -> "2.0.65"
 */
function extractVersionFromFilename(filePath: string): string | null {
  const filename = path.basename(filePath);
  // Match semver-like patterns (major.minor.patch)
  const match = filename.match(/^(\d+\.\d+\.\d+)$/);
  return match ? match[1] : null;
}

/**
 * Extracts version from an installation based on its kind.
 */
async function extractVersion(
  filePath: string,
  kind: InstallationKind
): Promise<string> {
  // First, try extracting version from filename (for versioned paths)
  const filenameVersion = extractVersionFromFilename(filePath);
  if (filenameVersion) {
    debug(`extractVersion: Got version ${filenameVersion} from filename`);
    return filenameVersion;
  }

  // Otherwise, extract from file contents
  if (kind === 'npm-based') {
    return extractVersionFromJsFile(filePath);
  } else {
    return extractVersionFromNativeBinary(filePath);
  }
}

// ============================================================================
// Candidate collection
// ============================================================================

/**
 * Collects all installation candidates from hardcoded search paths.
 */
async function collectCandidates(): Promise<InstallationCandidate[]> {
  const candidates: InstallationCandidate[] = [];

  const seenPaths = new Set<string>();

  // Collect cli.js candidates
  for (const searchPath of CLIJS_SEARCH_PATHS) {
    const cliPath = path.join(searchPath, 'cli.js');
    if (seenPaths.has(cliPath)) {
      continue;
    }
    try {
      if (await doesFileExist(cliPath)) {
        debug(`collectCandidates: Found cli.js at ${cliPath}`);
        const version = await extractVersionFromJsFile(cliPath);
        candidates.push({
          path: cliPath,
          kind: 'npm-based',
          version,
        });
        seenPaths.add(cliPath);
      }
    } catch (error) {
      debug(`collectCandidates: Error checking ${cliPath}:`, error);
    }
  }

  // Collect native binary candidates
  for (const nativePath of NATIVE_SEARCH_PATHS) {
    if (seenPaths.has(nativePath)) {
      continue;
    }
    try {
      if (await doesFileExist(nativePath)) {
        debug(`collectCandidates: Found native binary at ${nativePath}`);
        const version = await extractVersion(nativePath, 'native-binary');
        candidates.push({
          path: nativePath,
          kind: 'native-binary',
          version,
        });
        seenPaths.add(nativePath);
      }
    } catch (error) {
      debug(`collectCandidates: Error checking ${nativePath}:`, error);
    }
  }

  // Sort paths so bunx cache entries are checked in descending version order.
  // This ensures that if multiple bunx cache versions exist, the latest is patched.
  const sortedCandidates = [...candidates].sort((a, b) =>
    compareSemverVersions(a.version, b.version)
  );

  return sortedCandidates;
}

// ============================================================================
// Error message formatting
// ============================================================================

function formatCandidateList(candidates: InstallationCandidate[]): string {
  return candidates
    .map(c => `  • ${c.path} (${c.kind}, v${c.version})`)
    .join('\n');
}

function getConfigExample(examplePath: string): string {
  return `  2. Set ccInstallationPath in your config file (${CONFIG_FILE}):

     {
       "ccInstallationPath": "${examplePath}"
     }`;
}

function getEnvVarExample(examplePath: string): string {
  return `  1. Set the TWEAKCC_CC_INSTALLATION_PATH environment variable:

     export TWEAKCC_CC_INSTALLATION_PATH="${examplePath}"`;
}

function getMultipleCandidatesError(
  candidates: InstallationCandidate[]
): string {
  const examplePath = candidates[0]?.path || '/path/to/claude';

  return `Multiple Claude Code installations found.

Found installations:
${formatCandidateList(candidates)}

To specify which installation to use, either:

${getEnvVarExample(examplePath)}

${getConfigExample(examplePath)}`;
}

function getNotFoundError(): string {
  return `Could not find Claude Code installation.

To fix this, either:

${getEnvVarExample('/path/to/claude')}

${getConfigExample('/path/to/claude')}

  3. Install Claude Code:
     • npm install -g @anthropic-ai/claude-code
     • Or download from https://claude.ai/download`;
}

// ============================================================================
// Main detection function
// ============================================================================

/**
 * Converts a resolved installation to ClaudeCodeInstallationInfo.
 */
function toInstallationInfo(
  resolvedPath: string,
  kind: InstallationKind,
  version: string,
  source: InstallationSource
): ClaudeCodeInstallationInfo {
  if (kind === 'npm-based') {
    return { cliPath: resolvedPath, version, source };
  } else {
    return { nativeInstallationPath: resolvedPath, version, source };
  }
}

/**
 * Finds the Claude Code installation.
 *
 * Priority order:
 * 1. TWEAKCC_CC_INSTALLATION_PATH environment variable
 * 2. ccInstallationPath from config
 * 3. `claude` on PATH (via `which` package)
 * 4. Hardcoded search paths (with interactive selection if multiple found)
 *
 * @throws InstallationDetectionError if detection fails or requires user input in non-interactive mode
 */
export async function findClaudeCodeInstallation(
  config: TweakccConfig,
  options: FindInstallationOptions
): Promise<ClaudeCodeInstallationInfo | null> {
  // 1. Check TWEAKCC_CC_INSTALLATION_PATH environment variable
  const envPath = process.env.TWEAKCC_CC_INSTALLATION_PATH?.trim();
  if (envPath && envPath.length > 0) {
    debug(`Checking TWEAKCC_CC_INSTALLATION_PATH: ${envPath}`);

    if (!(await doesFileExist(envPath))) {
      throw new InstallationDetectionError(
        `TWEAKCC_CC_INSTALLATION_PATH is set to '${envPath}' but file does not exist.`
      );
    }

    const resolved = await resolvePathToInstallationType(envPath);
    if (!resolved) {
      throw new InstallationDetectionError(
        `Unable to detect installation type from TWEAKCC_CC_INSTALLATION_PATH value '${envPath}'.\n` +
          `Expected a Claude Code cli.js file or native binary.`
      );
    }

    const version = await extractVersion(resolved.resolvedPath, resolved.kind);
    if (isDebug() && resolved.kind === 'npm-based') {
      debug(`SHA256 hash: ${await hashFileInChunks(resolved.resolvedPath)}`);
    }

    debug(
      `Using Claude Code from TWEAKCC_CC_INSTALLATION_PATH: ${resolved.resolvedPath} (${resolved.kind}, v${version})`
    );
    return toInstallationInfo(
      resolved.resolvedPath,
      resolved.kind,
      version,
      'env-var'
    );
  }

  // 2. Check ccInstallationPath from config
  if (config.ccInstallationPath) {
    const configPath = config.ccInstallationPath;
    debug(`Checking ccInstallationPath: ${configPath}`);

    if (!(await doesFileExist(configPath))) {
      throw new InstallationDetectionError(
        `ccInstallationPath is set to '${configPath}' but file does not exist.`
      );
    }

    const resolved = await resolvePathToInstallationType(configPath);
    if (!resolved) {
      throw new InstallationDetectionError(
        `Unable to detect installation type from configured ccInstallationPath '${configPath}'.\n` +
          `Expected a Claude Code cli.js file or native binary.`
      );
    }

    const version = await extractVersion(resolved.resolvedPath, resolved.kind);
    if (isDebug() && resolved.kind === 'npm-based') {
      debug(`SHA256 hash: ${await hashFileInChunks(resolved.resolvedPath)}`);
    }

    debug(
      `Using Claude Code from ccInstallationPath: ${resolved.resolvedPath} (${resolved.kind}, v${version})`
    );
    return toInstallationInfo(
      resolved.resolvedPath,
      resolved.kind,
      version,
      'config'
    );
  }

  // 3. Check PATH via `which` package
  const pathClaudeExe = await getClaudeFromPath();
  if (pathClaudeExe) {
    debug(`Checking claude on PATH: ${pathClaudeExe}`);

    const resolved = await resolvePathToInstallationType(pathClaudeExe);
    if (!resolved) {
      debug(
        `Unable to detect installation type from 'claude' on PATH (${pathClaudeExe}). ` +
          `Falling back to hardcoded search paths.`
      );
    } else {
      const version = await extractVersion(
        resolved.resolvedPath,
        resolved.kind
      );
      if (isDebug() && resolved.kind === 'npm-based') {
        debug(`SHA256 hash: ${await hashFileInChunks(resolved.resolvedPath)}`);
      }

      debug(
        `Using Claude Code from PATH: ${resolved.resolvedPath} (${resolved.kind}, v${version})`
      );
      return toInstallationInfo(
        resolved.resolvedPath,
        resolved.kind,
        version,
        'path'
      );
    }
  }

  // 4. Fall back to hardcoded search paths
  debug('Collecting candidates from hardcoded search paths...');
  const candidates = await collectCandidates();

  if (candidates.length === 0) {
    if (options.interactive) {
      // Return null to let the UI handle displaying the error
      return null;
    }
    throw new InstallationDetectionError(getNotFoundError());
  }

  if (candidates.length === 1) {
    const candidate = candidates[0];
    debug(
      `Using single candidate: ${candidate.path} (${candidate.kind}, v${candidate.version})`
    );
    return toInstallationInfo(
      candidate.path,
      candidate.kind,
      candidate.version,
      'search-paths'
    );
  }

  // Multiple candidates found
  if (!options.interactive) {
    throw new InstallationDetectionError(
      getMultipleCandidatesError(candidates)
    );
  }

  // Interactive mode: return candidates for UI to handle
  // The UI will call selectAndSaveInstallation() after user picks one
  return {
    // Return a special marker that indicates selection is needed
    // This is a workaround since we can't return candidates directly
    version: '',
    source: 'search-paths', // Will be updated when selection is made
    _pendingCandidates: candidates,
  } as ClaudeCodeInstallationInfo & {
    _pendingCandidates: InstallationCandidate[];
  };
}

/**
 * Returns candidates for interactive selection.
 * Called by the UI when findClaudeCodeInstallation returns _pendingCandidates.
 */
export function getPendingCandidates(
  info: ClaudeCodeInstallationInfo
): InstallationCandidate[] | null {
  const extended = info as ClaudeCodeInstallationInfo & {
    _pendingCandidates?: InstallationCandidate[];
  };
  return extended._pendingCandidates || null;
}

/**
 * Saves the user's installation selection to config and returns the installation info.
 */
export async function selectAndSaveInstallation(
  candidate: InstallationCandidate
): Promise<ClaudeCodeInstallationInfo> {
  debug(`Saving selected installation to config: ${candidate.path}`);

  await updateConfigFile(config => {
    config.ccInstallationPath = candidate.path;
  });

  // After selection, the source becomes 'config' since we saved it to ccInstallationPath
  return toInstallationInfo(
    candidate.path,
    candidate.kind,
    candidate.version,
    'config'
  );
}

/**
 * Gets candidates for display in non-interactive error messages.
 * This re-collects candidates, used when we need to show what was found.
 */
export async function getCandidatesForError(): Promise<
  InstallationCandidate[]
> {
  return collectCandidates();
}

/**
 * Formats the "not found" error message for display.
 */
export function formatNotFoundError(): string {
  return getNotFoundError();
}

/**
 * Formats the "multiple candidates" error message for display.
 */
export function formatMultipleCandidatesError(
  candidates: InstallationCandidate[]
): string {
  return getMultipleCandidatesError(candidates);
}
