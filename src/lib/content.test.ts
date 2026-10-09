import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readContent, writeContent } from './content';
import {
  extractNativeInstallationModules,
  repackNativeInstallationModuleGraph,
} from '../nativeInstallationLoader';
import type { NativeBunGraph } from '../nativeInstallation';

vi.mock('../nativeInstallationLoader', () => ({
  extractNativeInstallationModules: vi.fn(),
  repackNativeInstallationModuleGraph: vi.fn(),
}));

const installation = {
  kind: 'native',
  path: '/tmp/claude',
  version: '2.1.295',
} as const;

const graph = {
  entryPointIndex: 1,
  modules: [
    { name: '/$bunfs/root/chunk-a.js', contents: Buffer.from('chunk') },
    { name: '/$bunfs/root/cli', contents: Buffer.from('entry') },
  ],
} as unknown as NativeBunGraph;

describe('native content I/O', () => {
  beforeEach(() => {
    vi.mocked(extractNativeInstallationModules).mockResolvedValue(graph);
    vi.mocked(repackNativeInstallationModuleGraph).mockClear();
  });

  it('reads the entry module', async () => {
    expect(await readContent(installation)).toBe('entry');
  });

  it('leaves the binary untouched when the entry is unchanged (#683)', async () => {
    await writeContent(installation, 'entry');
    expect(repackNativeInstallationModuleGraph).not.toHaveBeenCalled();
  });

  it('replaces only the entry module in place', async () => {
    await writeContent(installation, 'patched');
    expect(repackNativeInstallationModuleGraph).toHaveBeenCalledWith(
      '/tmp/claude',
      new Map([['/$bunfs/root/cli', Buffer.from('patched')]]),
      '/tmp/claude'
    );
  });
});
