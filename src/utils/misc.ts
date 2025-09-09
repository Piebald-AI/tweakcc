import * as fs from 'fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import * as crypto from 'crypto';
import { Theme } from './types.js';

let isDebugModeOn = false;
export const isDebug = (): boolean => {
  return isDebugModeOn;
};
export const enableDebug = (): void => {
  isDebugModeOn = true;
};

export function getCurrentClaudeCodeTheme(): string {
  try {
    const ccConfigPath = path.join(os.homedir(), '.claude.json');
    const ccConfig = JSON.parse(fs.readFileSync(ccConfigPath, 'utf8'));
    return ccConfig.theme || 'dark';
  } catch {
    // Do nothing.
  }

  return 'dark';
}

export function getColorKeys(theme: Theme): string[] {
  return Object.keys(theme.colors);
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
    const stream = fs.createReadStream(filePath, { highWaterMark: chunkSize });

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
    const stats = await fsPromises.stat(filePath);
    originalMode = stats.mode;
    if (isDebug()) {
      console.log(
        `[${operation}] Original file mode for ${filePath}: ${(originalMode & parseInt('777', 8)).toString(8)}`
      );
    }
  } catch (error) {
    // File might not exist, use default
    if (isDebug()) {
      console.log(
        `[${operation}] Could not stat ${filePath} (error: ${error}), using default mode 755`
      );
    }
  }

  // Unlink the file first to break any hard links
  try {
    await fsPromises.unlink(filePath);
    if (isDebug()) {
      console.log(`[${operation}] Unlinked ${filePath} to break hard links`);
    }
  } catch (error) {
    // File might not exist, which is fine
    if (isDebug()) {
      console.log(`[${operation}] Could not unlink ${filePath}: ${error}`);
    }
  }

  // Write the new content
  await fsPromises.writeFile(filePath, newContent);

  // Restore the original permissions
  await fsPromises.chmod(filePath, originalMode);
  if (isDebug()) {
    console.log(
      `[${operation}] Restored permissions to ${(originalMode & parseInt('777', 8)).toString(8)}`
    );
  }
}

// Debug function for showing diffs (currently disabled)
export const showDiff = (
  oldFileContents: string,
  newFileContents: string,
  injectedText: string,
  startIndex: number,
  endIndex: number
): void => {
  const contextStart = Math.max(0, startIndex - 20);
  const contextEndOld = Math.min(oldFileContents.length, endIndex + 20);
  const contextEndNew = Math.min(
    newFileContents.length,
    startIndex + injectedText.length + 20
  );

  const oldBefore = oldFileContents.slice(contextStart, startIndex);
  const oldChanged = oldFileContents.slice(startIndex, endIndex);
  const oldAfter = oldFileContents.slice(endIndex, contextEndOld);

  const newBefore = newFileContents.slice(contextStart, startIndex);
  const newChanged = newFileContents.slice(
    startIndex,
    startIndex + injectedText.length
  );
  const newAfter = newFileContents.slice(
    startIndex + injectedText.length,
    contextEndNew
  );

  if (isDebug()) {
    console.log('\n--- Diff ---');
    console.log('OLD:', oldBefore + `\x1b[31m${oldChanged}\x1b[0m` + oldAfter);
    console.log('NEW:', newBefore + `\x1b[32m${newChanged}\x1b[0m` + newAfter);
    console.log('--- End Diff ---\n');
  }
};
