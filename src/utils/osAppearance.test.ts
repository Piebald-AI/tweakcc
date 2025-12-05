import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { detectOSAppearance } from './osAppearance.js';

vi.mock('node:child_process');

describe('osAppearance.ts', () => {
  describe('detectOSAppearance', () => {
    it('should detect dark mode on macOS', () => {
      vi.mocked(execSync).mockReturnValue('Dark\n');
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const result = detectOSAppearance();

      expect(result).toBe('dark');
      expect(execSync).toHaveBeenCalledWith(
        'defaults read -g AppleInterfaceStyle',
        expect.objectContaining({
          encoding: 'utf8',
        })
      );
    });

    it('should detect light mode on macOS when key does not exist', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const result = detectOSAppearance();

      expect(result).toBe('light');
    });

    it('should detect dark mode on Windows', () => {
      const registryOutput = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize
    AppsUseLightTheme    REG_DWORD    0x0
`;
      vi.mocked(execSync).mockReturnValue(registryOutput);
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = detectOSAppearance();

      expect(result).toBe('dark');
    });

    it('should detect light mode on Windows', () => {
      const registryOutput = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize
    AppsUseLightTheme    REG_DWORD    0x1
`;
      vi.mocked(execSync).mockReturnValue(registryOutput);
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = detectOSAppearance();

      expect(result).toBe('light');
    });

    it('should detect dark mode on Linux via gtk-theme', () => {
      vi.mocked(execSync).mockReturnValue("'Adwaita-dark'\n");
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = detectOSAppearance();

      expect(result).toBe('dark');
    });

    it('should detect light mode on Linux via gtk-theme', () => {
      vi.mocked(execSync).mockReturnValue("'Adwaita'\n");
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = detectOSAppearance();

      expect(result).toBe('light');
    });

    it('should default to light mode on unsupported platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });

      const result = detectOSAppearance();

      expect(result).toBe('light');
    });

    it('should default to light mode when detection fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const result = detectOSAppearance();

      expect(result).toBe('light');
    });
  });
});
