import { describe, expect, it } from 'vitest';

import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { writeOpusplan1m } from './opusplan1m';

describe('writeOpusplan1m', () => {
  it('does not fail when mode switching already supports opusplan[1m]', () => {
    const file = [
      'if((A==="opusplan"||A==="opusplan[1m]")&&B==="plan"&&!C)return D();',
      '["sonnet","opus","haiku","sonnet[1m]","opusplan"]',
      'if(A==="opusplan")return"Opus in plan mode, else Sonnet";',
      'if(A==="opusplan")return"Opus Plan";',
      'if(A==="opusplan")return[...B,C()];',
      'if(A===null||B.some((C)=>C.value===A))return B;',
    ].join('');

    const result = writeOpusplan1m(file);

    expect(result).not.toBeNull();
    expect(result).toContain('"opusplan[1m]"');
  });
});

// Trimmed from the real Claude Code 2.1.295 code-split chunks: the resolver,
// description and label functions share one chunk; the /model picker is in
// another.
const RESOLVER_CHUNK =
  'function tbe(e){if(e==="opusplan"||e==="opusplan[1m]")return"opus";if(e==="haiku")return"sonnet";return null}' +
  'function r8(e){if(e==="opusplan")return"Opus in plan mode, else Sonnet";return Wo(Dt(e))}' +
  'function iY(e){if(e==="opusplan")return"Opus Plan";if(ty(e))return Wo(Dt(e));return Wo(e)}';
const PICKER_CHUNK =
  'function lg(s,r){let R=null,C=l_(),F=KF();if(C!==void 0&&C!==null)R=C;else if(F!==void 0&&F!==null)R=F;if(R===null||s.some((M)=>M.value===R))return Yt(s,r);else if(R==="opusplan")return Yt([...s,Vh()],r);else return Yt(s,r)}';

describe('writeOpusplan1m on CC 2.1.295 code-split chunks', () => {
  const graph = () => {
    const sources = new Map([
      ['resolver.js', RESOLVER_CHUNK],
      ['picker.js', PICKER_CHUNK],
      ['other.js', 'function x(){return 1}'],
    ]);
    const out = applyPatchImplementationsToGraph(
      sources,
      { opusplan1m: { fn: writeOpusplan1m } },
      [{ id: 'opusplan1m', name: 'o', group: PatchGroup.ALWAYS_APPLIED }]
    );
    return { sources, out };
  };

  it('labels the natively resolved alias', () => {
    const { sources, out } = graph();
    expect(out.owners.get('opusplan1m')).toEqual(['resolver.js', 'picker.js']);
    const fns = new Function(
      `function Wo(e){return "name:"+e}function Dt(e){return "sonnet[1m]"}function ty(){return!1}${sources.get('resolver.js')};return[r8,iY]`
    )();
    expect(fns[0]('opusplan[1m]')).toBe(
      'Opus in plan mode, else Sonnet (1M context)'
    );
    expect(fns[1]('opusplan[1m]')).toBe('Opus Plan 1M');
  });

  it('lists both opusplan models in the /model picker', () => {
    const { sources } = graph();
    const picker = (current: string | null) =>
      new Function(
        'current',
        `function l_(){return current}function KF(){return null}function Yt(s){return s}function Vh(){return{value:"opusplan"}}${sources.get('picker.js')};return lg([{value:"sonnet"}],null)`
      )(current).map((option: { value: string }) => option.value);
    expect(picker(null)).toEqual(['sonnet', 'opusplan', 'opusplan[1m]']);
    expect(picker('opusplan[1m]')).toEqual([
      'sonnet',
      'opusplan',
      'opusplan[1m]',
    ]);
  });
});
