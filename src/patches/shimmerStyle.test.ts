import { describe, expect, it } from 'vitest';

import { isShimmerCustomized, writeShimmerStyle } from './shimmerStyle';

// Real CC 2.1.295 excerpts (chunk-sk9xe51y.js): the spinner hook's shimmer
// timing and the shimmer renderer's highlighted window.
const SPINNER =
  'var Fn=[1e4,45000,300000],Kn=2000,qn=2000,zn=200,le=10,Yn=1e4;' +
  'function hook(){let ft=t?0:Xn(T),Z=l==="requesting"?50:zn,gt=J(()=>ae(c),[c]),dt=gt+2*le,ht=Math.floor(T/Z),Lt=t?-100:U?-100:l==="requesting"?ht%dt-le:gt+le-ht%dt,At=t?0:l==="tool-use"?oo(T):0;return{Z,dt,Lt,At}}';
const RENDERER =
  'let kt=c-1,xt=c+1;if(kt>=T||xt<0){let x;if(u[67]!==t||u[68]!==o)x=e(n,{color:o,children:t}),u[67]=t,u[68]=o,u[69]=x;else x=u[69];return x}';
const MODULE = SPINNER + RENDERER;

const DEFAULTS = { enabled: true, stepMs: null, width: null };

// Evaluate the hook with reducedMotion off, not stalled, and a 10-cell message.
const runHook = (file: string, mode: string, time: number) => {
  const body = file.slice(0, file.indexOf('let kt=')) + 'return hook()';
  return new Function('t', 'U', 'l', 'T', 'Xn', 'J', 'ae', 'c', 'oo', body)(
    false,
    false,
    mode,
    time,
    () => 0,
    (f: () => number) => f(),
    () => 10,
    '',
    () => 0.5
  );
};

describe('writeShimmerStyle', () => {
  it('ignores modules without the shimmer timing', () => {
    expect(writeShimmerStyle(RENDERER, { ...DEFAULTS, width: 5 })).toBeNull();
  });

  it('sets the step time for every mode', () => {
    const result = writeShimmerStyle(MODULE, { ...DEFAULTS, stepMs: 80 })!;
    expect(result).toContain('Z=80,gt=');
    expect(runHook(result, 'responding', 800).Z).toBe(80);
    expect(runHook(result, 'requesting', 800).Z).toBe(80);
    expect(runHook(MODULE, 'responding', 800).Z).toBe(200);
  });

  it('parks the glimmer and drops the tool-use flash when disabled', () => {
    const result = writeShimmerStyle(MODULE, { ...DEFAULTS, enabled: false })!;
    for (const mode of ['requesting', 'responding', 'tool-use']) {
      const { Lt, At } = runHook(result, mode, 1234);
      expect(Lt).toBe(-100);
      expect(At).toBe(0);
    }
    expect(runHook(MODULE, 'tool-use', 1234).At).toBe(0.5);
  });

  it('widens the highlighted window and the sweep padding', () => {
    const result = writeShimmerStyle(MODULE, { ...DEFAULTS, width: 24 })!;
    expect(result).toContain('let kt=c-11,xt=c+12;if(kt>=T||xt<0)');
    // 10-cell message + 24 cells of padding on each side.
    expect(runHook(result, 'responding', 0).dt).toBe(58);
    expect(runHook(MODULE, 'responding', 0).dt).toBe(30);
  });

  it('keeps the default padding for narrow windows', () => {
    const result = writeShimmerStyle(MODULE, { ...DEFAULTS, width: 1 })!;
    expect(result).toContain('let kt=c-0,xt=c+0;');
    expect(runHook(result, 'responding', 0).dt).toBe(30);
  });

  it('is only enabled when a shimmer option differs from the default', () => {
    expect(isShimmerCustomized(undefined)).toBe(false);
    expect(isShimmerCustomized(DEFAULTS)).toBe(false);
    expect(isShimmerCustomized({ ...DEFAULTS, enabled: false })).toBe(true);
    expect(isShimmerCustomized({ ...DEFAULTS, stepMs: 100 })).toBe(true);
  });
});
