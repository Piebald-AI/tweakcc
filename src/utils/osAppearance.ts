/**
 * Utilities for detecting OS appearance mode (light/dark theme)
 */

import { execSync } from 'node:child_process';
import { isDebug } from './misc.js';

export type AppearanceMode = 'light' | 'dark';

/**
 * Detect the current OS appearance mode
 * Returns 'dark' or 'light' based on system settings
 */
export function detectOSAppearance(): AppearanceMode {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS: Check AppleInterfaceStyle
      // If it returns 'Dark', we're in dark mode
      // If it errors (key doesn't exist), we're in light mode
      try {
        const result = execSync('defaults read -g AppleInterfaceStyle', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        return result === 'Dark' ? 'dark' : 'light';
      } catch {
        // Key doesn't exist = light mode
        return 'light';
      }
    } else if (platform === 'win32') {
      // Windows: Check registry for AppsUseLightTheme
      // 0 = dark mode, 1 = light mode
      try {
        const result = execSync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        // Parse the registry output
        const match = result.match(/AppsUseLightTheme\s+REG_DWORD\s+0x(\d+)/);
        if (match) {
          return match[1] === '0' ? 'dark' : 'light';
        }
      } catch {
        // Default to light if we can't determine
        return 'light';
      }
    } else if (platform === 'linux') {
      // Linux: Try to detect via gsettings (GNOME/GTK)
      try {
        const result = execSync(
          'gsettings get org.gnome.desktop.interface gtk-theme',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
        // Check if theme name contains 'dark' (case-insensitive)
        return /dark/i.test(result) ? 'dark' : 'light';
      } catch {
        // Try alternative method: check for color-scheme
        try {
          const result = execSync(
            'gsettings get org.gnome.desktop.interface color-scheme',
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
          ).trim();
          return /dark/i.test(result) ? 'dark' : 'light';
        } catch {
          // Default to light if we can't determine
          return 'light';
        }
      }
    }
  } catch (error) {
    if (isDebug()) {
      console.error('Error detecting OS appearance:', error);
    }
  }

  // Default to light mode if we can't determine
  return 'light';
}

/**
 * Check if a theme name or ID suggests it's for a particular appearance mode
 */
export function inferThemeAppearance(
  themeNameOrId: string
): AppearanceMode | null {
  const lower = themeNameOrId.toLowerCase();

  // Check for explicit dark/light indicators
  if (
    lower.includes('dark') ||
    lower.includes('night') ||
    lower.includes('black')
  ) {
    return 'dark';
  }

  if (
    lower.includes('light') ||
    lower.includes('day') ||
    lower.includes('white')
  ) {
    return 'light';
  }

  return null;
}
