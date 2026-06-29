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

  it('injects before the component return for the JSX-runtime memoized layout', () => {
    // Mirrors CC 2.1.195: a single plan-approval select after the title (its
    // onImagePaste/pastedContents/onRemoveImage props come from an embedded text
    // input), an inner memoized callback whose return sits BEFORE the title, and the
    // component's true top-level tail `else kr=t[105];return kr}` AFTER the title.
    const input =
      'function xEc(e){let t=Mc.c(106);' +
      'let it;if(t[66]!==e)it=(q)=>{if(q)return q;return 0},t[66]=e,t[67]=it;else it=t[66];' +
      'let vt;if(t[80]!==e)vt=R.jsx(Lf,{color:"planMode",title:"Ready to code?",children:xt}),t[80]=e,t[82]=vt;else vt=t[82];' +
      'let Dn;if(t[88]!==Ie)Dn=(Mr)=>void Ie(Mr),t[88]=Ie,t[89]=Dn;else Dn=t[89];' +
      'let nn;if(t[90]!==Ze)nn=R.jsx(Sr,{options:N,onChange:Dn,onCancel:Ze,onImagePaste:K,pastedContents:d,onRemoveImage:J}),t[90]=Ze,t[95]=nn;else nn=t[95];' +
      'let kr;if(t[102]!==tt)kr=R.jsxs(U,{flexDirection:"column",tabIndex:0,autoFocus:!0,onKeyDown:tt,children:[vt,nn]}),t[102]=tt,t[105]=kr;else kr=t[105];return kr}';

    const result = writeAutoAcceptPlanMode(input);

    expect(result).not.toBeNull();
    // Lands at the component's top-level return, not the inner callback before the title.
    expect(result).toContain(
      'else kr=t[105];Dn("yes-accept-edits-keep-context");return null;return kr}'
    );
    expect(result).toContain('it=(q)=>{if(q)return q;return 0}');
  });

  it('is idempotent on the JSX-runtime layout', () => {
    const input =
      'function xEc(e){let t=Mc.c(106);' +
      'let vt;if(t[80]!==e)vt=R.jsx(Lf,{color:"planMode",title:"Ready to code?",children:xt}),t[80]=e,t[82]=vt;else vt=t[82];' +
      'let Dn;if(t[88]!==Ie)Dn=(Mr)=>void Ie(Mr),t[88]=Ie,t[89]=Dn;else Dn=t[89];' +
      'let nn;if(t[90]!==Ze)nn=R.jsx(Sr,{options:N,onChange:Dn,onCancel:Ze,onImagePaste:K,pastedContents:d,onRemoveImage:J}),t[90]=Ze,t[95]=nn;else nn=t[95];' +
      'let kr;if(t[102]!==tt)kr=R.jsxs(U,{flexDirection:"column",tabIndex:0,autoFocus:!0,onKeyDown:tt,children:[vt,nn]}),t[102]=tt,t[105]=kr;else kr=t[105];return kr}';

    const once = writeAutoAcceptPlanMode(input);
    expect(once).not.toBeNull();
    expect(writeAutoAcceptPlanMode(once as string)).toBe(once);
  });
});
