import { describe, expect, it } from 'vitest';

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
