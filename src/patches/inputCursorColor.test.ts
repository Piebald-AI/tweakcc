import { describe, it, expect } from 'vitest';

import { writeInputCursorColor } from './inputCursorColor';

// CC 2.1.295 chunk-m4y78v89.js, inside the input box hook hr()
const CC_2_1_295 =
  'let b;if(p[4]!==C||p[5]!==i)b=!i?Xt:C?()=>ge.hex(C.hex)(C.char):g?Yt:D7,p[4]=C,p[5]=i,p[6]=b;else b=p[6];let I=b;';

describe('writeInputCursorColor', () => {
  it('replaces the inverse-video fallback with a chalk background', () => {
    const result = writeInputCursorColor(CC_2_1_295, 'rgb(255,0,135)');

    expect(result).toBe(
      'let b;if(p[4]!==C||p[5]!==i)b=!i?Xt:C?()=>ge.hex(C.hex)(C.char):g?Yt:(c=>ge.bgRgb(255,0,135)(c)),p[4]=C,p[5]=i,p[6]=b;else b=p[6];let I=b;'
    );
  });

  it('returns null when already patched', () => {
    const patched = writeInputCursorColor(CC_2_1_295, 'rgb(1,2,3)')!;

    expect(writeInputCursorColor(patched, 'rgb(1,2,3)')).toBeNull();
  });

  it('returns null for a non-rgb color', () => {
    expect(writeInputCursorColor(CC_2_1_295, '#ff0087')).toBeNull();
  });

  it('returns null when the anchor is absent', () => {
    expect(writeInputCursorColor('const x=1;', 'rgb(1,2,3)')).toBeNull();
  });
});
