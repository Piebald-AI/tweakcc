import { describe, expect, it } from 'vitest';

import { writeClearScreen, patchRenderFilter } from './clearScreen';

const cmds = Array.from({ length: 31 }, (_, i) => `c${i}`).join(',');
const slashCommandArray = `=>[${cmds}]`;

const renderFilter =
  'function g97(H,$){if(H.type!=="user")return!0;if(H.isMeta){if(H.origin?.kind==="channel")return!0;return!1}if(H.isVisibleInTranscriptOnly&&!$)return!1;return!0}';

const makeInput = (delimiter = ';') =>
  'const x=1' +
  renderFilter +
  slashCommandArray +
  `${delimiter}let Z=G_H.useCallback(()=>{Nw.get(process.stdout)?.forceRedraw()})`;

describe('clearScreen', () => {
  it('exposes forceRedraw and registers /clear-screen command', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      'globalThis.__tweakccForceRedraw=()=>Nw.get(process.stdout)?.forceRedraw()'
    );
    expect(result).toContain('name:"clear-screen"');
    expect(result).toContain('__tweakccHiddenUUIDs');
    expect(result).toContain('globalThis.__tweakccForceRedraw?.()');
  });

  it('preserves all messages for API context (hides via UUID set, does not remove)', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain('__tweakccHiddenUUIDs=new Set(');
    expect(result).toContain('return[...m]');
    expect(result).not.toContain('content:[]');
    expect(result).not.toContain('return k?[');
    expect(result).not.toContain('return[]');
  });

  it('patches render filter to check __tweakccHiddenUUIDs', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      'globalThis.__tweakccHiddenUUIDs?.has(H.uuid?.slice(0,24)))return!1;if(H.type!=="user")'
    );
  });

  it('preserves original app:redraw callback', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      'let Z=G_H.useCallback(()=>{Nw.get(process.stdout)?.forceRedraw()})'
    );
  });

  it('returns oldFile when already patched', () => {
    const input = makeInput() + ',{name:"clear-screen"}';
    const result = writeClearScreen(input);

    expect(result).toBe(input);
  });

  it('returns null when app:redraw callback not found', () => {
    const result = writeClearScreen('const x=1;');

    expect(result).toBeNull();
  });

  it('returns null when render filter not found', () => {
    const input =
      'const x=1' +
      slashCommandArray +
      ';let Z=G_H.useCallback(()=>{Nw.get(process.stdout)?.forceRedraw()})';
    const result = writeClearScreen(input);

    expect(result).toBeNull();
  });

  it('works with different delimiters before useCallback', () => {
    for (const d of [',', ';', '}', '{']) {
      const result = writeClearScreen(makeInput(d));
      expect(result).not.toBeNull();
      expect(result).toContain('globalThis.__tweakccForceRedraw');
    }
  });
});

describe('patchRenderFilter', () => {
  it('adds __tweakccHiddenUUIDs check at the start of the function', () => {
    const result = patchRenderFilter(renderFilter);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'function g97(H,$){if(globalThis.__tweakccHiddenUUIDs?.has(H.uuid?.slice(0,24)))return!1;if(H.type!=="user")'
    );
  });

  it('preserves the rest of the function', () => {
    const result = patchRenderFilter(renderFilter);

    expect(result).not.toBeNull();
    expect(result).toContain('if(H.isMeta)');
    expect(result).toContain('if(H.isVisibleInTranscriptOnly&&!$)return!1');
  });

  it('returns null when pattern not found', () => {
    const result = patchRenderFilter('const x=1;');

    expect(result).toBeNull();
  });

  it('works with different function and argument names', () => {
    const input =
      'function abc(X$,Y$){if(X$.type!=="user")return!0;if(X$.isMeta){if(X$.origin?.kind==="channel")return!0;return!1}return!0}';
    const result = patchRenderFilter(input);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'if(globalThis.__tweakccHiddenUUIDs?.has(X$.uuid?.slice(0,24)))return!1;'
    );
  });
});
