import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';

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
