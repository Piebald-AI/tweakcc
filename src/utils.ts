import * as fsSync from 'fs';
import fs from 'node:fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import * as crypto from 'crypto';
import { Theme } from './types';
import { CUSTOM_MODELS } from './patches/modelSelector';

let isDebugModeOn = false;
let isVerboseModeOn = false;
let isShowUnchangedOn = false;

/**
 * Returns true when debug mode is active via --debug flag or DEBUG env var.
 */
export const isDebug = (): boolean => {
  if (isDebugModeOn) return true;
  const debugEnv = process.env.DEBUG;
  return debugEnv === 'tweakcc' || debugEnv === '*';
};
export const isVerbose = (): boolean => {
  return isVerboseModeOn;
};
export const isShowUnchanged = (): boolean => {
  return isShowUnchangedOn;
};
export const enableDebug = (): void => {
  isDebugModeOn = true;
};
export const enableVerbose = (): void => {
  isVerboseModeOn = true;
  isDebugModeOn = true; // Verbose implies debug
};
export const enableShowUnchanged = (): void => {
  isShowUnchangedOn = true;
};
/**
 * Logs a message to stdout only when debug mode is enabled.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const debug = (message: any, ...optionalParams: any[]) => {
  if (isDebug()) {
    console.log(message, ...optionalParams);
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const verbose = (message: any, ...optionalParams: any[]) => {
  if (isVerbose()) {
    console.log(message, ...optionalParams);
  }
};
/**
 * Logs a warning message unconditionally via console.warn.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const warn = (message: any, ...optionalParams: any[]) => {
  console.warn(message, ...optionalParams);
};

export function getCurrentClaudeCodeTheme(): string {
  try {
    const ccConfigPath = path.join(os.homedir(), '.claude.json');
    const ccConfig = JSON.parse(fsSync.readFileSync(ccConfigPath, 'utf8'));
    return ccConfig.theme || 'dark';
  } catch {
    // Do nothing.
  }

  return 'dark';
}

export function setCurrentClaudeCodeTheme(themeId: string): void {
  try {
    const ccConfigPath = path.join(os.homedir(), '.claude.json');
    const ccConfig = JSON.parse(fsSync.readFileSync(ccConfigPath, 'utf8'));
    ccConfig.theme = themeId;
    fsSync.writeFileSync(ccConfigPath, JSON.stringify(ccConfig, null, 2));
  } catch {
    // Do nothing.
  }
}

export function getClaudeSubscriptionType(): string {
  try {
    const credentialsPath = path.join(
      os.homedir(),
      '.claude',
      '.credentials.json'
    );
    const credentials = JSON.parse(
      fsSync.readFileSync(credentialsPath, 'utf8')
    );
    const subscriptionType =
      credentials?.claudeAiOauth?.subscriptionType || 'unknown';

    switch (subscriptionType) {
      case 'enterprise':
        return 'Claude Enterprise';
      case 'team':
        return 'Claude Team';
      case 'max':
        return 'Claude Max';
      case 'pro':
        return 'Claude Pro';
    }
  } catch {
    // File not found or invalid JSON, use default
  }
  return 'Claude API';
}

export function getSelectedModel(): string {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const settings = JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
    const model = settings?.model || 'default';

    if (model === 'opus') {
      return 'Opus 4.5';
    }

    // Check against CUSTOM_MODELS list
    const customModel = CUSTOM_MODELS.find(m => m.value === model);
    if (customModel) {
      return customModel.label;
    }
  } catch {
    // File not found or invalid JSON, use default
  }

  return 'Opus 4.5';
}

export function getColorKeys(theme: Theme): string[] {
  return Object.keys(theme.colors);
}

export function openInExplorer(filePath: string) {
  if (process.platform === 'win32') {
    child_process
      .spawn('explorer', [filePath], {
        detached: true,
        stdio: 'ignore',
      })
      .unref();
  } else if (process.platform === 'darwin') {
    child_process
      .spawn('open', [filePath], {
        detached: true,
        stdio: 'ignore',
      })
      .unref();
  } else {
    child_process
      .spawn('xdg-open', [filePath], {
        detached: true,
        stdio: 'ignore',
      })
      .unref();
  }
}

export function revealFileInExplorer(filePath: string) {
  if (process.platform === 'win32') {
    child_process
      .spawn('explorer', ['/select,', filePath], {
        detached: true,
        stdio: 'ignore',
      })
      .unref();
  } else if (process.platform === 'darwin') {
    child_process
      .spawn('open', ['-R', filePath], {
        detached: true,
        stdio: 'ignore',
      })
      .unref();
  } else {
    const configDir = path.dirname(filePath);
    child_process
      .spawn('xdg-open', [configDir], {
        detached: true,
        stdio: 'ignore',
      })
      .unref();
  }
}

export function isValidColorFormat(color: string): boolean {
  if (!color || typeof color !== 'string') {
    return false;
  }

  const trimmedColor = color.trim();

  // Check hex format: #rrggbb or #rgb
  if (/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/.test(trimmedColor)) {
    return true;
  }

  // Check rgb format: rgb(r, g, b) or rgb(r,g,b)
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(trimmedColor)) {
    const rgbMatch = trimmedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      return parseInt(r) <= 255 && parseInt(g) <= 255 && parseInt(b) <= 255;
    }
  }

  // Check hsl format: hsl(h, s%, l%) or hsl(h,s%,l%)
  if (
    /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/.test(trimmedColor)
  ) {
    const hslMatch = trimmedColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (hslMatch) {
      const [, h, s, l] = hslMatch;
      return parseInt(h) <= 360 && parseInt(s) <= 100 && parseInt(l) <= 100;
    }
  }

  return false;
}

export function normalizeColorToRgb(color: string): string {
  if (!isValidColorFormat(color)) {
    return color;
  }

  const trimmedColor = color.trim();

  // If already RGB, return as-is
  if (trimmedColor.startsWith('rgb(')) {
    return trimmedColor;
  }

  // Convert hex to RGB
  if (trimmedColor.startsWith('#')) {
    let hex = trimmedColor.slice(1);

    // Convert 3-digit hex to 6-digit
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(char => char + char)
        .join('');
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return `rgb(${r},${g},${b})`;
  }

  // Convert HSL to RGB
  if (trimmedColor.startsWith('hsl(')) {
    const hslMatch = trimmedColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]) / 360;
      const s = parseInt(hslMatch[2]) / 100;
      const l = parseInt(hslMatch[3]) / 100;

      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      const g = Math.round(hue2rgb(p, q, h) * 255);
      const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

      return `rgb(${r},${g},${b})`;
    }
  }

  return color;
}

// Hashes a file in chunks efficiently.
export async function hashFileInChunks(
  filePath: string,
  algorithm: string = 'sha256',
  chunkSize: number = 64 * 1024
) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fsSync.createReadStream(filePath, {
      highWaterMark: chunkSize,
    });

    stream.on('data', chunk => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', error => {
      reject(error);
    });
  });
}

// Helper function to build chalk formatting chain
export const buildChalkChain = (
  chalkVar: string,
  rgbValues: string | null,
  backgroundRgbValues: string | null,
  bold: boolean,
  italic: boolean,
  underline: boolean,
  strikethrough: boolean,
  inverse: boolean
): string => {
  let chain = chalkVar;

  if (rgbValues) {
    chain += `.rgb(${rgbValues})`;
  }

  if (backgroundRgbValues && backgroundRgbValues !== 'transparent') {
    chain += `.bgRgb(${backgroundRgbValues})`;
  }

  if (bold) chain += '.bold';
  if (italic) chain += '.italic';
  if (underline) chain += '.underline';
  if (strikethrough) chain += '.strikethrough';
  if (inverse) chain += '.inverse';

  return chain;
};

/**
 * Replaces a file's content while breaking hard links and preserving permissions.
 * This is essential when modifying files that may be hard-linked (e.g., by Bun).
 *
 * @param filePath - The path to the file to replace
 * @param newContent - The new content to write to the file
 * @param operation - Optional description for debug logging (e.g., "restore", "patch")
 */
export async function replaceFileBreakingHardLinks(
  filePath: string,
  newContent: string | Buffer,
  operation: string = 'replace'
): Promise<void> {
  // Get the original file's permissions before unlinking
  let originalMode = 0o755; // Default fallback
  try {
    const stats = await fs.stat(filePath);
    originalMode = stats.mode;
    debug(
      `[${operation}] Original file mode for ${filePath}: ${(originalMode & parseInt('777', 8)).toString(8)}`
    );
  } catch (error) {
    // File might not exist, use default
    debug(
      `[${operation}] Could not stat ${filePath} (error: ${error}), using default mode 755`
    );
  }

  // Unlink the file first to break any hard links
  try {
    await fs.unlink(filePath);
    debug(`[${operation}] Unlinked ${filePath} to break hard links`);
  } catch (error) {
    // File might not exist, which is fine
    debug(`[${operation}] Could not unlink ${filePath}: ${error}`);
  }

  // Write the new content
  await fs.writeFile(filePath, newContent);

  // Restore the original permissions
  await fs.chmod(filePath, originalMode);
  debug(
    `[${operation}] Restored permissions to ${(originalMode & parseInt('777', 8)).toString(8)}`
  );
}

export async function doesFileExist(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' ||
        error.code === 'ENOTDIR' ||
        error.code === 'EACCES' ||
        error.code === 'EPERM')
    ) {
      return false;
    }
    throw error;
  }
}

// Helper function to expand ~ in paths
export const expandTilde = (filepath: string): string => {
  if (filepath.startsWith('~')) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
};

/**
 * Compares two semantic versions.
 * Returns: positive if a > b, negative if a < b, 0 if equal
 */
export const compareSemverVersions = (a: string, b: string): number => {
  const parseVersion = (v: string): [number, number, number] => {
    const parts = v.split('.').map(Number);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };

  const aParts = parseVersion(a);
  const bParts = parseVersion(b);

  if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
  if (aParts[1] !== bParts[1]) return aParts[1] - bParts[1];
  return aParts[2] - bParts[2];
};

export const stringifyRegex = (regex: RegExp): string => {
  const str = regex.toString();
  const lastSlash = str.lastIndexOf('/');
  const pattern = JSON.stringify(str.substring(1, lastSlash));
  const flags = JSON.stringify(str.substring(lastSlash + 1));
  return `new RegExp(${pattern}, ${flags})`;
};

/**
 * Recursively merges a partial object with a defaults object,
 * filling in any missing keys from the defaults.
 * This ensures that all properties from the defaults are present,
 * while preserving any user-provided values from the partial object.
 *
 * @param partial - The user-provided partial object (may be missing keys)
 * @param defaults - The complete default object with all keys
 * @returns A merged object with all keys from defaults, using partial values where available
 */
export function deepMergeWithDefaults(
  partial: unknown,
  defaults: unknown
): unknown {
  // If partial is null or undefined, use defaults
  if (partial === null || partial === undefined) {
    return defaults;
  }

  // If defaults is not an object, return partial as-is
  if (typeof defaults !== 'object' || defaults === null) {
    return partial;
  }

  // If defaults is an array, return partial if it's also an array, otherwise use defaults
  if (Array.isArray(defaults)) {
    return Array.isArray(partial) ? partial : defaults;
  }

  // For objects, recursively merge
  const result = { ...partial } as Record<string, unknown>;

  for (const key of Object.keys(defaults as Record<string, unknown>)) {
    const defaultValue = (defaults as Record<string, unknown>)[key];

    if (!(key in result)) {
      // Key is missing from partial, use default
      result[key] = defaultValue;
    } else if (
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      !Array.isArray(defaultValue)
    ) {
      // Key exists in both, and default is a plain object - recurse
      result[key] = deepMergeWithDefaults(result[key], defaultValue);
    }
    // Otherwise, keep the partial value as-is
  }

  return result;
}
