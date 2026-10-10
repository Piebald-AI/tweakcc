import { describe, expect, it, vi } from 'vitest';

import { writeThinkerSymbolMirrorOption } from './thinkerMirrorOption';
import { writeThinkerSymbolSpeed } from './thinkerSymbolSpeed';

// CC 2.1.295, chunk-9ne577yj: the frame arrays and their getters.
const frames =
  'import{a}from"/$bunfs/root/chunk-tq5wzp66.js";var l=["\\xB7","\\u2722","\\u2733","\\u2736","\\u273B","\\u273B"],g=["\\xB7","\\u2722","\\u2733","\\u2736","\\u273B","\\u273D"],p=["\\xB7","\\u2722","*","\\u2736","\\u273B","\\u273D"],d=[...l,...l.toReversed()],y=[...g,...g.toReversed()],f=[...p,...p.toReversed()];function Ncn(){if(a.TERM==="xterm-ghostty")return l;return p}function YPe(){if(a.TERM==="xterm-ghostty")return d;return f}';

// CC 2.1.295, chunk-sk9xe51y: the main spinner's breathing frame index.
const breathing =
  'var qn=2000;' +
  'function Xn(l){let t=XPe(l,qn);return Math.round(t*(Ncn().length-1))}' +
  'function to(l){return`thought for ${Math.max(1,Math.round(l/1000))}s`}';

describe('writeThinkerSymbolMirrorOption', () => {
  it('drops the reversed half of every frame array (CC 2.1.295)', () => {
    const result = writeThinkerSymbolMirrorOption(frames, false);

    expect(result).toContain('d=[...l],y=[...g],f=[...p];');
    expect(result).not.toContain('toReversed');
  });

  it('makes the breathing frame index restart instead of reversing (CC 2.1.295)', () => {
    const result = writeThinkerSymbolMirrorOption(breathing, false);

    expect(result).toContain(
      'function Xn(l){let t=Ncn().length;return Math.floor(l*2*Math.max(1,t-1)/qn)%t}'
    );
    const Xn = new Function(
      'Ncn',
      result!.replace(/^var qn=2000;/, 'const qn=2000;') + 'return Xn;'
    )(() => ['a', 'b', 'c', 'd']) as (time: number) => number;
    // 2000ms over 2*(4-1) frames: 333ms per frame, 0..3 then back to 0.
    expect([0, 340, 670, 1000, 1340, 1670].map(Xn)).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it('keeps a thinker-symbol-speed period', () => {
    const sped = writeThinkerSymbolSpeed(breathing, 157, 4)!;
    const result = writeThinkerSymbolMirrorOption(sped, false);

    expect(result).toContain('return Math.floor(l*2*Math.max(1,t-1)/942)%t}');
  });

  it('leaves the breathing index alone when mirroring is enabled', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(writeThinkerSymbolMirrorOption(breathing, true)).toBeNull();
    spy.mockRestore();
  });

  it('still rewrites the older `[...X].reverse()` form', () => {
    const result = writeThinkerSymbolMirrorOption(
      'uz1=[...ZP2,...[...ZP2].reverse()],pz5=1',
      false
    );

    expect(result).toBe('uz1=[...ZP2],pz5=1');
  });

  it('returns null when neither shape is present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(writeThinkerSymbolMirrorOption('const x=1;', false)).toBeNull();
    spy.mockRestore();
  });
});
