import { describe, expect, it } from 'vitest';

import { writeFeatureFlagOverrides } from './featureFlagOverrides';

// The GrowthBook client of CC 2.1.330 (chunk-wxs996br.js), reduced to the
// parts the patch touches.
const SOURCE =
  'function NM(e){return{readEnvironmentOverrides:()=>process.env.CLAUDE_INTERNAL_FC_OVERRIDES}}' +
  'class Xl{deps;constructor(e){this.deps=e}getEnvironmentOverrides(){return null}' +
  'hasEnvironmentOverride(e){let r=this.getEnvironmentOverrides();return r!==null&&Object.hasOwn(r,e)}}';

const overridesFor = (code: string, value: string | undefined) => {
  const make = new Function(
    'process',
    `${code};const c=new Xl(NM());return [c.getEnvironmentOverrides(),c];`
  );
  return make({ env: { CLAUDE_INTERNAL_FC_OVERRIDES: value } });
};

describe('writeFeatureFlagOverrides', () => {
  const patched = writeFeatureFlagOverrides(SOURCE)!;

  it('replaces the stubbed method', () => {
    expect(patched).not.toBeNull();
    expect(patched).not.toContain('getEnvironmentOverrides(){return null}');
  });

  it('is a no-op before the patch', () => {
    expect(overridesFor(SOURCE, '{"tengu_x":true}')[0]).toBeNull();
  });

  it('returns the JSON object from CLAUDE_INTERNAL_FC_OVERRIDES', () => {
    const [overrides, client] = overridesFor(
      patched,
      '{"tengu_x":true,"tengu_y":{"add":["foot"]}}'
    );
    expect(overrides).toEqual({ tengu_x: true, tengu_y: { add: ['foot'] } });
    expect(client.hasEnvironmentOverride('tengu_x')).toBe(true);
    expect(client.hasEnvironmentOverride('tengu_z')).toBe(false);
  });

  it('ignores unset, invalid and non-object values', () => {
    for (const value of [undefined, '', 'not json', '[1]', 'true', 'null']) {
      expect(overridesFor(patched, value)[0]).toBeNull();
    }
  });

  it('fails when the stub is missing', () => {
    expect(
      writeFeatureFlagOverrides(
        'class Xl{getEnvironmentOverrides(){return {}}}'
      )
    ).toBeNull();
  });
});
