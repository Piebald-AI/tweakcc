import fs from 'node:fs/promises';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as nativeInstallation from '../nativeInstallationLoader';
import * as misc from '../utils';
import { readContent, writeContent } from '../lib/content';
import { Installation } from '../lib/types';

vi.mock('node:fs/promises');
vi.mock('../nativeInstallationLoader', () => ({
  extractClaudeJsFromNativeInstallation: vi.fn(),
  repackNativeInstallation: vi.fn(),
}));

vi.spyOn(misc, 'replaceFileBreakingHardLinks').mockImplementation(async () => {
  // no-op
});

describe('readContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns content and clearBytecode=true for native installation', async () => {
    const jsContent = 'console.log("hello")';
    vi.mocked(
      nativeInstallation.extractClaudeJsFromNativeInstallation
    ).mockResolvedValue({
      data: Buffer.from(jsContent, 'utf8'),
      clearBytecode: true,
    });

    const installation: Installation = {
      kind: 'native',
      path: '/usr/bin/claude',
      version: '1.0.0',
    };

    const result = await readContent(installation);
    expect(result).toEqual({ content: jsContent, clearBytecode: true });
  });

  it('returns content and clearBytecode=false for native installation', async () => {
    const jsContent = 'console.log("world")';
    vi.mocked(
      nativeInstallation.extractClaudeJsFromNativeInstallation
    ).mockResolvedValue({
      data: Buffer.from(jsContent, 'utf8'),
      clearBytecode: false,
    });

    const installation: Installation = {
      kind: 'native',
      path: '/usr/bin/claude',
      version: '1.0.0',
    };

    const result = await readContent(installation);
    expect(result).toEqual({ content: jsContent, clearBytecode: false });
  });

  it('throws when native extraction returns null data', async () => {
    vi.mocked(
      nativeInstallation.extractClaudeJsFromNativeInstallation
    ).mockResolvedValue({
      data: null,
      clearBytecode: false,
    });

    const installation: Installation = {
      kind: 'native',
      path: '/usr/bin/claude',
      version: '1.0.0',
    };

    await expect(readContent(installation)).rejects.toThrow(
      'Failed to extract JavaScript from native installation'
    );
  });

  it('returns content and clearBytecode=false for npm installation', async () => {
    const jsContent = 'module.exports = {}';
    vi.mocked(fs.readFile).mockResolvedValue(jsContent);

    const installation: Installation = {
      kind: 'npm',
      path: '/usr/lib/node_modules/claude/cli.js',
      version: '1.0.0',
    };

    const result = await readContent(installation);
    expect(result).toEqual({ content: jsContent, clearBytecode: false });
  });
});

describe('writeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes clearBytecode to repackNativeInstallation', async () => {
    const installation: Installation = {
      kind: 'native',
      path: '/usr/bin/claude',
      version: '1.0.0',
    };

    await writeContent(installation, 'modified content', true);

    expect(nativeInstallation.repackNativeInstallation).toHaveBeenCalledWith(
      '/usr/bin/claude',
      Buffer.from('modified content', 'utf8'),
      '/usr/bin/claude',
      true
    );
  });

  it('passes clearBytecode=false to repackNativeInstallation', async () => {
    const installation: Installation = {
      kind: 'native',
      path: '/usr/bin/claude',
      version: '1.0.0',
    };

    await writeContent(installation, 'modified content', false);

    expect(nativeInstallation.repackNativeInstallation).toHaveBeenCalledWith(
      '/usr/bin/claude',
      Buffer.from('modified content', 'utf8'),
      '/usr/bin/claude',
      false
    );
  });

  it('ignores clearBytecode for npm installation', async () => {
    const installation: Installation = {
      kind: 'npm',
      path: '/usr/lib/node_modules/claude/cli.js',
      version: '1.0.0',
    };

    await writeContent(installation, 'modified content', true);

    expect(nativeInstallation.repackNativeInstallation).not.toHaveBeenCalled();
    expect(misc.replaceFileBreakingHardLinks).toHaveBeenCalledWith(
      '/usr/lib/node_modules/claude/cli.js',
      'modified content',
      'patch'
    );
  });
});
