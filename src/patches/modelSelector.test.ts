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
  // Real CC 2.1.295 excerpt (chunk-75cm4bmg.js `lg`, the /model option builder).
  const chunk295 =
    'let I=Ci(P);if(I!==null&&!s.some((H)=>Pt(H,I)))Qt(s,{...I,sessionTail:!0})}s=dg(s,r);let R=null,C=l_(),F=KF();if(C!==void 0&&C!==null)R=C;else if(F!==void 0&&F!==null)R=F;if(R===null||s.some((M)=>M.value===R))return Yt(s,r);else if(R==="opusplan")return Yt([...s,Vh()],r);else if(dr(R)){let M={value:R,label:"",description:""},P=s.findIndex((E)=>Pt(E,M));if(P!==-1)s[P]={...s[P],value:R};else Qt(s,{...$h(R),sessionTail:!0});return Yt(s,r)}else if(R==="opus"){if(!zd()){let P=cg();return Yt(s.map((E)=>E.value===P?{...E,value:"opus"}:E),r)}let M=tl(!1);return Yt(s.some((P)=>typeof P.value==="string"&&Ot(P.value)===P.value&&Pt(P,M))?s:[...s,{...M,sessionTail:!0}],r)}else if(R==="opus[1m]"&&zd()){let M=nl(!1);return Yt(s.some((P)=>Pt(P,M))?s:[...s,{...M,sessionTail:!0}],r)}else{let M={value:R,label:"",description:""};if(s.some((P)=>Pt(P,M)))return Yt(s,r);return s.push({...Ci(R)??{value:R,label:R,description:"Custom model"},sessionTail:!0}),Yt(s,r)}}';

  it('appends the custom models before the picker sort on CC 2.1.295', () => {
    const out = writeModelCustomizations(chunk295);
    expect(out).not.toBeNull();
    expect(out).toContain(
      '}for(const tweakccModel of [{"value":"claude-opus-4-6"'
    );
    expect(out).toContain(')s.push(tweakccModel);s=dg(s,r);let R=null');
  });
});
