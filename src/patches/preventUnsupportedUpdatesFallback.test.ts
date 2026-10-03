import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import type { ClaudeCodeInstallationInfo, TweakccConfig } from '../types';
import type { NativeBunGraph } from '../nativeInstallation';
import {
  extractClaudeJsFromNativeInstallation,
  extractNativeInstallationModules,
  repackNativeInstallation,
  repackNativeInstallationModuleGraph,
} from '../nativeInstallationLoader';
import {
  writePreventUnsupportedUpdates,
  writePreventUnsupportedUpdatesModules,
} from './preventUnsupportedUpdates';
import { applyCustomization } from './index';
import { assertPatchedBundleParses } from './parseGate';

// All filesystem and installation effects are mocked. These cases exercise
// failure isolation of the update guard in the real apply pipeline.
vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockRejectedValue(new Error('No backup')),
}));
vi.mock('node:fs', async importActual => ({
  ...(await importActual<typeof import('node:fs')>()),
  writeFileSync: vi.fn(),
}));
vi.mock('../config', () => ({
  CONFIG_DIR: '/test/config',
  NATIVE_BINARY_BACKUP_FILE: '/test/config/native.backup',
  updateConfigFile: vi.fn(async update => {
    const config = { changesApplied: false } as TweakccConfig;
    update(config);
    return config;
  }),
}));
vi.mock('../utils', () => ({
  debug: vi.fn(),
  replaceFileBreakingHardLinks: vi.fn(),
}));
vi.mock('../installationBackup', () => ({
  restoreNativeBinaryFromBackup: vi.fn(),
  restoreClijsFromBackup: vi.fn(),
}));
vi.mock('../nativeInstallationLoader', () => ({
  extractClaudeJsFromNativeInstallation: vi.fn(),
  extractNativeInstallationModules: vi.fn(),
  repackNativeInstallation: vi.fn(),
  repackNativeInstallationModuleGraph: vi.fn(),
}));
vi.mock('./systemPrompts', () => ({
  applySystemPrompts: vi.fn(async (input: string | string[]) => ({
    newContent: Array.isArray(input) ? input[0] : input,
    newContents: Array.isArray(input) ? [...input] : [input],
    results: [],
  })),
}));
vi.mock('./modelSelector', () => ({
  writeModelCustomizations: vi.fn((content: string) =>
    content.includes('base') ? `${content};void 0;` : null
  ),
}));
vi.mock('./preventUnsupportedUpdates', () => ({
  writePreventUnsupportedUpdates: vi.fn(
    (content: string) => `${content};npmOnlyGuard();`
  ),
  writePreventUnsupportedUpdatesModules: vi.fn(),
}));
vi.mock('./parseGate', async importActual => ({
  ...(await importActual<typeof import('./parseGate')>()),
  assertPatchedBundleParses: vi.fn(),
}));
vi.mock('./moduleParseGate', async importActual => ({
  ...(await importActual<typeof import('./moduleParseGate')>()),
  assertPatchedModuleParses: vi.fn(),
}));

const installation: ClaudeCodeInstallationInfo = {
  nativeInstallationPath: '/test/claude',
  version: '2.1.288',
  source: 'search-paths',
};

function config(): TweakccConfig {
  return {
    ccVersion: '2.1.288',
    ccInstallationPath: '/test/claude',
    lastModified: '',
    changesApplied: false,
    settings: {
      ...DEFAULT_SETTINGS,
      misc: {
        ...DEFAULT_SETTINGS.misc,
        preventUpdateToUnsupportedVersions: true,
      },
    },
  };
}

const graphOf = (
  entries: Array<{ name: string; contents: Buffer; encoding: number }>
): NativeBunGraph => ({
  modules: entries.map((entry, index) => ({
    index,
    name: entry.name,
    contents: entry.contents,
    sourcemap: Buffer.alloc(0),
    bytecode: Buffer.alloc(0),
    moduleInfo: Buffer.alloc(0),
    bytecodeOriginPath: Buffer.alloc(0),
    encoding: entry.encoding,
    loader: 1,
    moduleFormat: 1,
    side: 0,
    isEntryPoint: index === 0,
  })),
  entryPointIndex: 0,
  flags: 0,
  compileExecArgv: Buffer.alloc(0),
  moduleRecordSize: 52,
});

const twoModules = () =>
  graphOf([
    {
      name: '/$bunfs/root/cli',
      contents: Buffer.from('const base = 1;'),
      encoding: 0,
    },
    {
      name: '/$bunfs/root/chunk.js',
      contents: Buffer.from('export const value = 1;'),
      encoding: 0,
    },
  ]);

describe('update guard on code-split native builds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractNativeInstallationModules).mockResolvedValue(twoModules());
    vi.mocked(extractClaudeJsFromNativeInstallation).mockResolvedValue(
      Buffer.from('const base = 1;')
    );
    vi.mocked(writePreventUnsupportedUpdatesModules).mockReturnValue(null);
  });

  it.each([
    [0, 'utf8', 'const label = "café 🦆";'],
    [1, 'latin1', 'const label = "café";'],
    [2, 'utf16le', 'const label = "café 🦆";'],
  ] as const)(
    'decodes Bun encoding %i before matching the updater',
    async (encoding, codec, source) => {
      vi.mocked(extractNativeInstallationModules).mockResolvedValue(
        graphOf([
          {
            name: '/$bunfs/root/cli',
            contents: Buffer.from(source, codec),
            encoding,
          },
          {
            name: '/$bunfs/root/chunk.js',
            contents: Buffer.from('export const value = 1;'),
            encoding: 0,
          },
        ])
      );
      await applyCustomization(config(), installation, [
        'prevent-unsupported-updates',
      ]);
      expect(writePreventUnsupportedUpdatesModules).toHaveBeenCalledWith([
        source,
        'export const value = 1;',
      ]);
      expect(repackNativeInstallationModuleGraph).not.toHaveBeenCalled();
      expect(repackNativeInstallation).not.toHaveBeenCalled();
    }
  );

  it('patches every module the guard changes and reports it applied', async () => {
    vi.mocked(writePreventUnsupportedUpdatesModules).mockImplementation(
      sources => sources.map(source => `${source}/*guard*/`)
    );
    const result = await applyCustomization(config(), installation, [
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: true });
    const replacements = vi.mocked(repackNativeInstallationModuleGraph).mock
      .calls[0][1];
    expect([...replacements.keys()]).toEqual([
      '/$bunfs/root/cli',
      '/$bunfs/root/chunk.js',
    ]);
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });

  it('reports the guard as failed while applying an unrelated customization', async () => {
    const result = await applyCustomization(config(), installation, [
      'model-customizations',
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, failed: true });
    expect(
      result.results.find(patch => patch.id === 'model-customizations')
    ).toMatchObject({ applied: true });
    const replacements = vi.mocked(repackNativeInstallationModuleGraph).mock
      .calls[0][1];
    expect(replacements.get('/$bunfs/root/cli')?.toString()).toBe(
      'const base = 1;;void 0;'
    );
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });

  it('keeps the restored binary unchanged when the failed guard is the only requested patch', async () => {
    const result = await applyCustomization(config(), installation, [
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, failed: true });
    expect(repackNativeInstallationModuleGraph).not.toHaveBeenCalled();
    expect(repackNativeInstallation).not.toHaveBeenCalled();
  });

  it('skips the guard entirely when it is disabled', async () => {
    const disabled = config();
    disabled.settings.misc.preventUpdateToUnsupportedVersions = false;
    const result = await applyCustomization(disabled, installation, [
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, skipped: true });
    expect(writePreventUnsupportedUpdatesModules).not.toHaveBeenCalled();
    expect(repackNativeInstallationModuleGraph).not.toHaveBeenCalled();
  });
});

describe('update guard on single-bundle native builds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractNativeInstallationModules).mockResolvedValue(null);
    vi.mocked(extractClaudeJsFromNativeInstallation).mockResolvedValue(
      Buffer.from('const base = 1;')
    );
  });

  it('never applies the npm-only matcher to a native bundle', async () => {
    const result = await applyCustomization(config(), installation, [
      'model-customizations',
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, failed: true });
    expect(
      result.results.find(patch => patch.id === 'model-customizations')
    ).toMatchObject({ applied: true });
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
    expect(assertPatchedBundleParses).toHaveBeenCalledWith(
      'const base = 1;;void 0;',
      'auto'
    );
    expect(repackNativeInstallation).toHaveBeenCalledWith(
      '/test/claude',
      Buffer.from('const base = 1;;void 0;'),
      '/test/claude'
    );
  });

  it('leaves the binary untouched when nothing changed', async () => {
    await applyCustomization(config(), installation, [
      'prevent-unsupported-updates',
    ]);
    expect(repackNativeInstallation).not.toHaveBeenCalled();
  });

  it('still fails safely when no extractor is available', async () => {
    vi.mocked(extractClaudeJsFromNativeInstallation).mockResolvedValue(null);
    await expect(
      applyCustomization(config(), installation, [
        'prevent-unsupported-updates',
      ])
    ).rejects.toThrow('Failed to extract claude.js');
    expect(repackNativeInstallation).not.toHaveBeenCalled();
    expect(repackNativeInstallationModuleGraph).not.toHaveBeenCalled();
  });
});
