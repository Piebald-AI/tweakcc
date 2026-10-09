import { describe, it, expect } from 'vitest';

import { writeModelCustomizations } from './modelSelector';

describe('writeModelCustomizations', () => {
  // CC 2.1.199 emits the built-in "Custom model" push preceded by `{` (inside an
  // `if(...){...}` block), not by a space:
  //   ...if(c.startsWith("anthropic.")){t.push({value:c,label:c,description:"Custom model"})...
  const bundle199 =
    'function F(e){let t=VTp(e),n=1;' +
    'if(c.startsWith("anthropic.")){t.push({value:c,label:c,description:"Custom model"});continue}' +
    'return t}';

  it('injects the custom model list on CC 2.1.199 (push preceded by "{")', () => {
    const out = writeModelCustomizations(bundle199);
    expect(out).not.toBeNull();
    // The extra models are pushed onto the same list var `t`...
    expect(out).toContain('t.push({"value":"claude-opus-4-6"');
    // ...right after the `t` declaration, before the original push site.
    const injectAt = out!.indexOf('t.push({"value":"claude-opus-4-6"');
    const origPushAt = out!.indexOf('if(c.startsWith("anthropic.")');
    expect(injectAt).toBeGreaterThan(-1);
    expect(injectAt).toBeLessThan(origPushAt);
  });

  it('still matches the legacy space-prefixed push site', () => {
    const legacy =
      'function F(e){let t=[]; t.push({value:x,label:y,description:"Custom model"});return t}';
    const out = writeModelCustomizations(legacy);
    expect(out).not.toBeNull();
    expect(out).toContain('t.push({"value":"claude-opus-4-6"');
  });

  it('fails closed on a member-expression push (does not capture a property as the list var)', () => {
    const memberExpr =
      'function F(e){let t=[];return e.t.push({value:c,label:c,description:"Custom model"})}';
    const out = writeModelCustomizations(memberExpr);
    expect(out).toBeNull();
  });
  // Real CC 2.1.295 excerpt (chunk-75cm4bmg.js): no plain "Custom model" push any
  // more; the option list builder opens with the ANTHROPIC_CUSTOM_MODEL_OPTION push.
  const chunk295 =
    'function Zh(e=!1){return[Mi(e)]}' +
    'function lg(e,r){let n=ig(e,r),s=n??Zh(e),h=a.ANTHROPIC_CUSTOM_MODEL_OPTION;if(h&&!s.some((M)=>M.value===h))s.push({value:h,label:a.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME??MPt(h)??h,description:a.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION??`Custom model (${h})`,sessionTail:!0});' +
    'return Yt(s,r)}';

  it('injects the custom model list on CC 2.1.295 (ANTHROPIC_CUSTOM_MODEL_OPTION push)', () => {
    const out = writeModelCustomizations(chunk295);
    expect(out).not.toBeNull();
    expect(out).toContain(
      'h=a.ANTHROPIC_CUSTOM_MODEL_OPTION;s.push({"value":"claude-opus-4-6"'
    );
  });
});
