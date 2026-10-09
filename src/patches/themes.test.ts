import { describe, expect, it } from 'vitest';

import { Theme } from '../types';
import { PatchGroup } from './index';
import { assertPatchedModuleParses } from './moduleParseGate';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
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

describe('code-split CC 2.1.295 modules', () => {
  // Excerpts from real CC 2.1.295 chunks: the colour switch (chunk-56n0ak5v),
  // the /theme picker options (chunk-zzpk24he), the /config id->name map
  // (chunk-e78x7vh8) and the settings/config theme enum (chunk-qd8e31xf).
  const modules = {
    '/switch.js':
      'function tB(r){switch(r){case"light":return v;case"light-ansi":return Y;case"dark-ansi":return L;case"light-daltonized":return G;case"dark-daltonized":return F;default:return B}}',
    '/picker.js':
      'function F(t,S,C,i,xo,We){if(t[21]===S)Et={label:"Auto (match terminal)",value:"auto"},Mt={label:"Dark mode",value:"dark"},Lt={label:"Light mode",value:"light"},_t={label:"Dark mode (colorblind-friendly)",value:"dark-daltonized"},At={label:"Light mode (colorblind-friendly)",value:"light-daltonized"},Rt={label:"Dark mode (ANSI colors only)",value:"dark-ansi"},Bt={label:"Light mode (ANSI colors only)",value:"light-ansi"},t[21]=Et,t[22]=Mt,t[23]=Lt,t[24]=_t,t[25]=At,t[26]=Rt,t[27]=Bt;else Et=t[21],Mt=t[22],Lt=t[23],_t=t[24],At=t[25],Rt=t[26],Bt=t[27];let Nt;if(t[28]!==C||t[29]!==i){let I;if(t[31]!==i)I=i?[{label:"New custom theme\\u2026",value:We}]:[],t[31]=i,t[32]=I;else I=t[32];Nt=[Et,Mt,Lt,_t,At,Rt,Bt,...C.map(xo),...I];t[28]=C,t[29]=i,t[30]=Nt}else Nt=t[30];}',
    '/names.js':
      'var zc="x",Kc={auto:"Auto (match terminal)",dark:"Dark mode",light:"Light mode","dark-daltonized":"Dark mode (colorblind-friendly)","light-daltonized":"Light mode (colorblind-friendly)","dark-ansi":"Dark mode (ANSI colors only)","light-ansi":"Light mode (ANSI colors only)"};',
    '/schema.js':
      'var Vko=["dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi"],dxe=["auto",...Vko];',
  };
  const themes = [
    { id: 'dark', name: 'Dark mode', colors: { text: 'rgb(1,2,3)' } },
    { id: 'mono', name: 'Mono', colors: { text: 'rgb(4,5,6)' } },
    { id: 'light-ansi', name: 'Light ANSI', colors: {} },
  ] as unknown as Theme[];

  it('patches every theme site in its own module', () => {
    const sources = new Map(Object.entries(modules));
    const out = applyPatchImplementationsToGraph(
      sources,
      { themes: { fn: s => writeThemes(s, themes) } },
      [{ id: 'themes', name: 'Themes', group: PatchGroup.MISC_CONFIGURABLE }]
    );
    expect(out.results[0]).toMatchObject({ applied: true, failed: false });
    // Each theme is layered over the built-in palette for its id, falling back
    // to the default (dark) palette, so newer colour keys stay defined.
    expect(sources.get('/switch.js')).toBe(
      'function tB(r){switch(r){\n' +
        'case"dark":return{...B,"text":"rgb(1,2,3)"};\n' +
        'case"mono":return{...B,"text":"rgb(4,5,6)"};\n' +
        'case"light-ansi":return{...Y,};\n' +
        'default:return{...B,"text":"rgb(1,2,3)"};\n' +
        '}}'
    );
    expect(sources.get('/picker.js')).toContain(
      'Nt=[{"label":"Dark mode","value":"dark"},{"label":"Mono","value":"mono"},{"label":"Light ANSI","value":"light-ansi"},...C.map(xo),...I];'
    );
    expect(sources.get('/names.js')).toBe(
      'var zc="x",Kc={"dark":"Dark mode","mono":"Mono","light-ansi":"Light ANSI"};'
    );
    // Built-in ids are not repeated: this enum also lists the /config options.
    expect(sources.get('/schema.js')).toBe(
      'var Vko=["dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi","mono"],dxe=["auto",...Vko];'
    );
    for (const [name, src] of sources)
      expect(() => assertPatchedModuleParses(name, src)).not.toThrow();
  });
});
