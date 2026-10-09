import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  writeTmuxGraphicsPassthrough,
  writeTmuxGraphicsPassthroughModules,
} from './tmuxGraphicsPassthrough';

// Excerpt of the graphics chunk in Claude Code 2.1.289, with its imports
// replaced by the values they hold.
const CHUNK =
  'var zL="\\x1b",dgn=zL+"\\\\";' +
  'var P=zL+String.fromCharCode(95),G=`${P}G`;' +
  'function d(e,n){let o=n===void 0?"":`;${n}`;return`${G}${e}${o}${dgn}`}' +
  'function ego(e){return d(`a=d,d=I,i=${e},q=2`)}' +
  'function E(e){return d(`i=${e},s=1,v=1,a=q,t=d,f=24`,"AAAA")}';

/** Evaluates a chunk and returns its exported builders. */
const load = (source: string) =>
  new Function('process', `${source};return{ego,E};`) as (process: {
    env: Record<string, string>;
  }) => { ego: (id: number) => string; E: (id: number) => string };

describe('writeTmuxGraphicsPassthrough', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps graphics commands in tmux passthrough when TMUX is set', () => {
    const patched = writeTmuxGraphicsPassthrough(CHUNK);
    expect(patched).not.toBeNull();

    const { ego, E } = load(patched!)({ env: { TMUX: '/tmp/tmux-1/default' } });
    expect(ego(7)).toBe('\x1bPtmux;\x1b\x1b_Ga=d,d=I,i=7,q=2\x1b\x1b\\\x1b\\');
    expect(E(3)).toBe(
      '\x1bPtmux;\x1b\x1b_Gi=3,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\x1b\\\x1b\\'
    );
  });

  it('leaves graphics commands unchanged outside tmux', () => {
    const patched = writeTmuxGraphicsPassthrough(CHUNK)!;

    const { ego, E } = load(patched)({ env: {} });
    const original = load(CHUNK)({ env: {} });
    expect(ego(7)).toBe(original.ego(7));
    expect(E(3)).toBe(original.E(3));
  });

  it('is idempotent', () => {
    const patched = writeTmuxGraphicsPassthrough(CHUNK)!;
    expect(writeTmuxGraphicsPassthrough(patched)).toBe(patched);
  });

  it('matches identifiers containing `$`', () => {
    const input =
      'function $d(e$,n){let o$=n===void 0?"":`;${n}`;return`${$G}${e$}${o$}${S$}`}';

    const patched = writeTmuxGraphicsPassthrough(input);

    expect(patched).toContain('return __tweakccTmuxPassthrough(`${$G}${e$}');
  });

  it('picks a helper name the source does not already use', () => {
    const input = `var __tweakccTmuxPassthrough=1;${CHUNK}`;

    const patched = writeTmuxGraphicsPassthrough(input)!;

    expect(patched).toContain('function __tweakccTmuxPassthrough_(s)');
  });

  it('returns null when there is no graphics command builder', () => {
    expect(writeTmuxGraphicsPassthrough('function f(){return 1}')).toBeNull();
  });
});

describe('writeTmuxGraphicsPassthroughModules', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('patches only the module that builds graphics commands', () => {
    const sources = ['import"./chunk.js";', CHUNK, 'export{}'];

    const patched = writeTmuxGraphicsPassthroughModules(sources)!;

    expect(patched[0]).toBe(sources[0]);
    expect(patched[1]).toBe(writeTmuxGraphicsPassthrough(CHUNK));
    expect(patched[2]).toBe(sources[2]);
  });

  it('returns already-patched sources unchanged', () => {
    const sources = ['entry', writeTmuxGraphicsPassthrough(CHUNK)!];

    expect(writeTmuxGraphicsPassthroughModules(sources)).toEqual(sources);
  });

  it('returns null when no module or several modules match', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(writeTmuxGraphicsPassthroughModules(['a', 'b'])).toBeNull();
    expect(writeTmuxGraphicsPassthroughModules([CHUNK, CHUNK])).toBeNull();
  });
});
