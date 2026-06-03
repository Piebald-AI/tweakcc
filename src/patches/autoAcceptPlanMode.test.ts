import { describe, expect, it } from 'vitest';

import { writeAutoAcceptPlanMode } from './autoAcceptPlanMode';

describe('writeAutoAcceptPlanMode', () => {
  it('finds the enclosing return even when it starts before the Ready prompt window', () => {
    const filler = 'x'.repeat(700);
    const input =
      'function A(){let h=(v)=>v;' +
      `return R.default.createElement(Box,{children:"${filler}"},` +
      'R.default.createElement(Card,{color:"planMode",title:"Ready to code?",onChange:h,onCancel:z}));}';

    const result = writeAutoAcceptPlanMode(input);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'h("yes-accept-edits-keep-context");return null;return R.default.createElement'
    );
  });
});
