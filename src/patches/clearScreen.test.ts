import { describe, expect, it } from 'vitest';

import { writeClearScreen } from './clearScreen';

const cmds = Array.from({ length: 31 }, (_, i) => `c${i}`).join(',');
const slashCommandArray = `=>[${cmds}]`;

const makeInput = (delimiter = ';') =>
  'const x=1' +
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
    expect(result).toContain('$.setMessages(');
    expect(result).toContain('globalThis.__tweakccForceRedraw?.()');
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

  it('works with different delimiters before useCallback', () => {
    for (const d of [',', ';', '}', '{']) {
      const result = writeClearScreen(makeInput(d));
      expect(result).not.toBeNull();
      expect(result).toContain('globalThis.__tweakccForceRedraw');
    }
  });
});
