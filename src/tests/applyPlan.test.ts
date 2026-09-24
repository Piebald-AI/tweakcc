import { describe, expect, it } from 'vitest';

import { getPlannedPatches, isPatchEnabledByConfig } from '../applyPlan';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import { TweakccConfig } from '../types';

function configWithDefaults(
  overrides: Partial<TweakccConfig['settings']> = {}
): TweakccConfig {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
      misc: {
        ...DEFAULT_SETTINGS.misc,
        ...(overrides.misc ?? {}),
      },
    },
  } as TweakccConfig;
}

describe('applyPlan', () => {
  it('plans the update guard only when explicitly enabled and selected', () => {
    const config = configWithDefaults();
    const id = 'prevent-unsupported-updates';
    expect(isPatchEnabledByConfig(id, config, '2.1.261')).toBe(false);
    config.settings.misc!.preventUpdateToUnsupportedVersions = true;
    expect(
      getPlannedPatches(config, '2.1.261', [id]).map(patch => patch.id)
    ).toEqual([id]);
    expect(
      getPlannedPatches(config, '2.1.261', ['themes']).map(patch => patch.id)
    ).not.toContain(id);
    delete (config.settings as Partial<TweakccConfig['settings']>).misc;
    expect(isPatchEnabledByConfig(id, config, '2.1.261')).toBe(false);
  });

  it('marks default-on patches when using DEFAULT_SETTINGS', () => {
    const planned = getPlannedPatches(configWithDefaults(), '2.1.200', null);
    const byId = Object.fromEntries(planned.map(p => [p.id, p]));

    expect(byId['session-memory']?.defaultOn).toBe(true);
    expect(byId['thinking-visibility']?.defaultOn).toBe(true);
    expect(byId['model-customizations']?.defaultOn).toBe(true);
    expect(byId['agents-md']?.defaultOn).toBe(true);
    expect(byId['verbose-property']?.defaultOn).toBe(true);
  });

  it('excludes disabled optional patches', () => {
    const config = configWithDefaults({
      misc: {
        ...DEFAULT_SETTINGS.misc,
        enableSessionMemory: false,
        enableModelCustomizations: false,
        expandThinkingBlocks: false,
      },
      claudeMdAltNames: [],
      inputBox: { removeBorder: false, chevronIdleThemeColor: null },
    });

    expect(isPatchEnabledByConfig('session-memory', config, '2.1.200')).toBe(
      false
    );
    expect(
      isPatchEnabledByConfig('model-customizations', config, '2.1.200')
    ).toBe(false);
    expect(
      isPatchEnabledByConfig('thinking-visibility', config, '2.1.200')
    ).toBe(false);
    expect(isPatchEnabledByConfig('agents-md', config, '2.1.200')).toBe(false);
    expect(
      isPatchEnabledByConfig('input-chevron-color', config, '2.1.200')
    ).toBe(false);
  });

  it('respects --patches filter', () => {
    const planned = getPlannedPatches(configWithDefaults(), '2.1.200', [
      'session-memory',
      'themes',
    ]);
    expect(planned.map(p => p.id)).toEqual(['session-memory']);
  });

  it('skips themes when settings match defaults', () => {
    expect(
      isPatchEnabledByConfig('themes', configWithDefaults(), '2.1.200')
    ).toBe(false);
  });
});
