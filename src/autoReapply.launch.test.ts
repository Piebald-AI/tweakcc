import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A private config dir, and a spawn that fails asynchronously (via 'error').
vi.mock('./config', async importOriginal => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'tweakcc-check-'));
  writeFileSync(join(dir, 'config.json'), '{}');
  return {
    ...(await importOriginal<typeof import('./config')>()),
    CONFIG_DIR: dir,
    CONFIG_FILE: join(dir, 'config.json'),
  };
});
vi.mock('./appliedRecord', () => ({
  readAppliedRecord: async () => ({ binaries: { '/old': {} } }),
  isRecordedBinary: async () => false,
}));
vi.mock('./installationDetection', () => ({
  findClaudeCodeInstallation: async () => ({
    nativeInstallationPath: '/cc/2.1.296',
    version: '2.1.296',
  }),
}));
vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    setImmediate(() => child.emit('error', new Error('spawn EACCES')));
    return child;
  },
}));

import { runSessionStartCheck } from './autoReapply';
import { CONFIG_DIR } from './config';

describe('runSessionStartCheck', () => {
  afterEach(() => vi.restoreAllMocks());

  it('releases the lock and stays quiet when the detached apply fails to launch', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await runSessionStartCheck();
    expect(write).not.toHaveBeenCalled();
    await expect(
      fs.stat(path.join(CONFIG_DIR, 'auto-apply.lock'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
