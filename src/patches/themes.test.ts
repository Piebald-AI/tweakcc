import { describe, expect, it } from 'vitest';

import { Theme } from '../types';
import { writeThemes } from './themes';

const BASE_SWITCH =
  'switch(A){case"light":return LX9;case"dark":return DX9;default:return CX9}';
const BASE_OBJ_ARR =
  '[{"label":"Dark mode","value":"dark"},{"label":"Light mode","value":"light"}]';
const BASE_OBJ = 'return{"dark":"Dark mode","light":"Light mode"}';
const BASE_SCHEMA_ENUM =
  'K8$=["dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi"]';

const makeBundle = (schemaEnum = BASE_SCHEMA_ENUM) =>
  `${BASE_SWITCH}${BASE_OBJ_ARR}${BASE_OBJ}${schemaEnum}`;

const CUSTOM_THEME = {
  id: 'winter',
  name: 'Winter',
  colors: {},
} as unknown as Theme;

describe('patchThemeSchema (via writeThemes)', () => {
  it('appends custom theme ID to the built-in schema enum', () => {
    const result = writeThemes(makeBundle(), [CUSTOM_THEME]);

    expect(result).not.toBeNull();
    expect(result).toMatch(
      /"dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi","winter"/
    );
  });

  it('appends multiple custom theme IDs', () => {
    const themes = [
      CUSTOM_THEME,
      { id: 'ocean', name: 'Ocean', colors: {} } as unknown as Theme,
    ];

    const result = writeThemes(makeBundle(), themes);

    expect(result).not.toBeNull();
    expect(result).toMatch(
      /"dark-daltonized","light-ansi","dark-ansi","winter","ocean"/
    );
  });

  it('preserves all built-in IDs in the schema enum after patching', () => {
    const result = writeThemes(makeBundle(), [CUSTOM_THEME]);

    expect(result).not.toBeNull();
    const schemaSection = result ?? '';
    expect(schemaSection).toContain('"dark-daltonized"');
    expect(schemaSection).toContain('"light-ansi"');
    expect(schemaSection).toContain('"dark-ansi"');
  });

  it('is non-fatal when schema enum is absent — returns patched file without crashing', () => {
    const bundleNoSchema = `${BASE_SWITCH}${BASE_OBJ_ARR}${BASE_OBJ}`;

    const result = writeThemes(bundleNoSchema, [CUSTOM_THEME]);

    expect(result).not.toBeNull();
    expect(result).toContain('"winter"');
  });
});
