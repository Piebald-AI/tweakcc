import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import type { ClaudeCodeInstallationInfo, TweakccConfig } from '../types';
import {
  extractClaudeJsFromNativeInstallation,
  extractClaudeJsModulesFromNativeInstallation,
  repackNativeInstallation,
  repackNativeInstallationModules,
} from '../nativeInstallationLoader';
import {
  writePreventUnsupportedUpdates,
  writePreventUnsupportedUpdatesModules,
} from './preventUnsupportedUpdates';
import { applyCustomization } from './index';
import {
  assertPatchedBundleParses,
  PatchedBundleParseError,
} from './parseGate';
import { applySystemPromptsToSources } from './systemPrompts';

// All filesystem and installation effects are mocked. These cases exercise
// failure isolation in the real apply pipeline without touching a client.
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
  extractClaudeJsModulesFromNativeInstallation: vi.fn(),
  repackNativeInstallation: vi.fn(),
  repackNativeInstallationModules: vi.fn(),
}));
vi.mock('./systemPrompts', () => ({
  applySystemPromptsToSources: vi.fn(async sources => ({
    sources: [...sources],
    results: [],
  })),
  applySystemPrompts: vi.fn(async content => ({
    newContent: content,
    results: [],
  })),
}));
vi.mock('./modelSelector', () => ({
  writeModelCustomizations: vi.fn((content: string) => `${content};void 0;`),
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

const installation: ClaudeCodeInstallationInfo = {
  nativeInstallationPath: '/test/claude',
  version: '2.1.20',
  source: 'search-paths',
};
function config(): TweakccConfig {
  return {
    ccVersion: '2.1.20',
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

describe('native update guard extraction fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractClaudeJsModulesFromNativeInstallation).mockResolvedValue(
      null
    );
    vi.mocked(extractClaudeJsFromNativeInstallation).mockResolvedValue(
      Buffer.from('const base = 1;')
    );
  });

  it.each([
    [0, 'utf8', 'const label = "café 🦆";'],
    [1, 'latin1', 'const label = "café";'],
    [2, 'utf16le', 'const label = "café 🦆";'],
  ] as const)(
    'decodes Bun encoding %i before matching native update guards',
    async (encoding, codec, source) => {
      // Keep the bytes authoritative: UTF-8-decoding the UTF-16 fixture must not
      // accidentally pass just because the matching algorithm is mocked below.
      const modules = [source, 'export const value = 1;'].map(
        (text, index) => ({
          index,
          name: index === 0 ? '/$bunfs/root/cli' : '/$bunfs/root/chunk.js',
          contents: Buffer.from(text, codec),
          loader: 1,
          moduleFormat: 1,
          encoding,
          side: 0,
          isEntrypoint: index === 0,
          isJavaScript: true,
        })
      );
      vi.mocked(extractClaudeJsModulesFromNativeInstallation).mockResolvedValue(
        {
          sourceSha256: '0'.repeat(64),
          moduleStructSize: 52,
          entryPointId: 0,
          modules,
        }
      );
      vi.mocked(writePreventUnsupportedUpdatesModules).mockReturnValue(null);
      await applyCustomization(config(), installation, [
        'prevent-unsupported-updates',
      ]);
      expect(writePreventUnsupportedUpdatesModules).toHaveBeenCalledWith([
        source,
        'export const value = 1;',
      ]);
      expect(extractClaudeJsFromNativeInstallation).not.toHaveBeenCalled();
      expect(repackNativeInstallation).not.toHaveBeenCalled();
      expect(repackNativeInstallationModules).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'preserves chunk prompt edits with updater guard enabled=%s',
    async enabled => {
      const modules = [
        {
          index: 0,
          name: '/$bunfs/root/cli',
          contents: Buffer.from('import "./chunk.js";'),
          loader: 1,
          moduleFormat: 1,
          encoding: 0,
          side: 0,
          isEntrypoint: true,
          isJavaScript: true,
        },
        {
          index: 1,
          name: '/$bunfs/root/chunk.js',
          contents: Buffer.from('export const prompt="old";'),
          loader: 1,
          moduleFormat: 1,
          encoding: 0,
          side: 0,
          isEntrypoint: false,
          isJavaScript: true,
        },
        {
          index: 2,
          name: '/$bunfs/root/prompt.md',
          contents: Buffer.from('# old'),
          loader: 13,
          moduleFormat: 0,
          encoding: 0,
          side: 0,
          isEntrypoint: false,
          isJavaScript: false,
        },
        {
          index: 3,
          name: '/$bunfs/root/asset.js',
          contents: Buffer.from([0xff]),
          loader: 5,
          moduleFormat: 0,
          encoding: 0,
          side: 0,
          isEntrypoint: false,
          isJavaScript: false,
        },
      ];
      vi.mocked(extractClaudeJsModulesFromNativeInstallation).mockResolvedValue(
        {
          sourceSha256: '0'.repeat(64),
          moduleStructSize: 52,
          entryPointId: 0,
          modules,
        }
      );
      vi.mocked(applySystemPromptsToSources).mockResolvedValueOnce({
        sources: [
          'import "./chunk.js";',
          'export const prompt="new";',
          '# new',
        ],
        results: [],
      });
      vi.mocked(writePreventUnsupportedUpdatesModules).mockReturnValue([
        'import "./chunk.js";',
        'export const prompt="new";void 0;',
      ]);
      const settings = config();
      settings.settings.misc.preventUpdateToUnsupportedVersions = enabled;
      await applyCustomization(settings, installation, [
        'test-prompt',
        'prevent-unsupported-updates',
      ]);
      expect(applySystemPromptsToSources).toHaveBeenCalledWith(
        ['import "./chunk.js";', 'export const prompt="old";', '# old'],
        installation.version,
        undefined,
        ['test-prompt', 'prevent-unsupported-updates'],
        new Set([2])
      );
      if (enabled)
        expect(writePreventUnsupportedUpdatesModules).toHaveBeenCalledWith([
          'import "./chunk.js";',
          'export const prompt="new";',
        ]);
      expect(repackNativeInstallationModules).toHaveBeenCalledWith(
        '/test/claude',
        {
          sourceSha256: '0'.repeat(64),
          modules: [
            {
              index: 1,
              name: modules[1].name,
              contents: Buffer.from(
                enabled
                  ? 'export const prompt="new";void 0;'
                  : 'export const prompt="new";'
              ),
            },
            { index: 2, name: modules[2].name, contents: Buffer.from('# new') },
          ],
        },
        '/test/claude'
      );
      expect(assertPatchedBundleParses).toHaveBeenCalledWith(
        enabled
          ? 'export const prompt="new";void 0;'
          : 'export const prompt="new";',
        'module'
      );
      expect(assertPatchedBundleParses).not.toHaveBeenCalledWith(
        '# new',
        expect.anything()
      );
      expect(repackNativeInstallation).not.toHaveBeenCalled();
    }
  );

  it('refuses to repack when an edited chunk fails parsing', async () => {
    vi.mocked(extractClaudeJsModulesFromNativeInstallation).mockResolvedValue({
      sourceSha256: '0'.repeat(64),
      moduleStructSize: 52,
      entryPointId: 0,
      modules: [
        {
          index: 0,
          name: '/$bunfs/root/cli',
          contents: Buffer.from('export {};'),
          loader: 1,
          moduleFormat: 1,
          encoding: 0,
          side: 0,
          isEntrypoint: true,
          isJavaScript: true,
        },
        {
          index: 1,
          name: '/$bunfs/root/chunk.js',
          contents: Buffer.from('export {};'),
          loader: 1,
          moduleFormat: 1,
          encoding: 0,
          side: 0,
          isEntrypoint: false,
          isJavaScript: true,
        },
      ],
    });
    vi.mocked(applySystemPromptsToSources).mockResolvedValueOnce({
      sources: ['export {};', 'broken('],
      results: [],
    });
    vi.mocked(assertPatchedBundleParses)
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new PatchedBundleParseError('bad chunk');
      });
    await expect(
      applyCustomization(config(), installation, ['test-prompt'])
    ).rejects.toThrow('bad chunk');
    expect(repackNativeInstallationModules).not.toHaveBeenCalled();
    expect(repackNativeInstallation).not.toHaveBeenCalled();
  });

  it('reports the guard as failed while applying an unrelated native customization', async () => {
    const result = await applyCustomization(config(), installation, [
      'model-customizations',
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, failed: true });
    expect(
      result.results.find(patch => patch.id === 'model-customizations')
    ).toMatchObject({ applied: true, failed: false });
    expect(repackNativeInstallation).toHaveBeenCalledWith(
      '/test/claude',
      Buffer.from('const base = 1;;void 0;'),
      '/test/claude'
    );
    expect(assertPatchedBundleParses).toHaveBeenCalledWith(
      'const base = 1;;void 0;',
      'auto'
    );
    expect(repackNativeInstallationModules).not.toHaveBeenCalled();
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });

  it('keeps the restored binary unchanged when the failed guard is the only requested patch', async () => {
    const result = await applyCustomization(config(), installation, [
      'prevent-unsupported-updates',
    ]);
    expect(
      result.results.find(patch => patch.id === 'prevent-unsupported-updates')
    ).toMatchObject({ applied: false, failed: true });
    expect(repackNativeInstallation).not.toHaveBeenCalled();
    expect(repackNativeInstallationModules).not.toHaveBeenCalled();
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });

  it('still fails safely when neither native extractor is available', async () => {
    vi.mocked(extractClaudeJsFromNativeInstallation).mockResolvedValue(null);
    await expect(
      applyCustomization(config(), installation, [
        'prevent-unsupported-updates',
      ])
    ).rejects.toThrow('Failed to extract claude.js');
    expect(repackNativeInstallation).not.toHaveBeenCalled();
    expect(repackNativeInstallationModules).not.toHaveBeenCalled();
  });

  it('still reads the prompt corpus when the optional guard is disabled', async () => {
    const disabled = config();
    disabled.settings.misc.preventUpdateToUnsupportedVersions = false;
    await applyCustomization(disabled, installation, [
      'prevent-unsupported-updates',
    ]);
    expect(extractClaudeJsModulesFromNativeInstallation).toHaveBeenCalled();
    expect(repackNativeInstallation).not.toHaveBeenCalled();
    expect(writePreventUnsupportedUpdates).not.toHaveBeenCalled();
  });
});
