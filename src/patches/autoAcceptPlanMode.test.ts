import { describe, expect, it } from 'vitest';

import { writeAutoAcceptPlanMode } from './autoAcceptPlanMode';
import {
  beginGraphContext,
  endGraphContext,
  enterGraphModule,
  leaveGraphModule,
} from './graphContext';

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

  it('polls the CC 2.1.295 code-split dialog handler from inside its own component', () => {
    // Real CC 2.1.295 excerpt (chunk-tjhhhqzz): the empty-plan "Exit plan mode?"
    // early return, then the "Ready to code?" dialog with
    // onChange:(Br)=>void Ar(Br) and defaultFocusValue:Dn.
    const input =
      'function Bot({payload:h,answer:A,wouldTakeAnswer:L}){async function Ar(Br){if(!L())return;A(Br)}' +
      'if(Po)return e(fa,{color:"planMode",title:"Exit plan mode?",requestSource:h.requestSource,children:r' +
      '(s,{flexDirection:"column",paddingX:1,marginTop:1,children:[e(n,{children:"Claude wants to exit plan' +
      ' mode"}),e(s,{marginTop:1,children:e(Ge,{refuseInput:os,selectedValue:Pi,options:[{label:no!==null?n' +
      'o.node:"Yes",value:"yes"},{label:"No",value:"no"}],onChange:pr,onCancel:()=>pr("no")})})]})});return' +
      ' r(ao,{onKeyDown:Vr,children:[e(EC,{ref:an?.attach,flexDirection:"column",height:sr?Un:void 0,sticky' +
      'Scroll:!1,children:e(fa,{color:"planMode",title:"Ready to code?",innerPaddingX:0,requestSource:h.req' +
      'uestSource,children:r(s,{flexDirection:"column",marginTop:1,children:[e(s,{paddingX:1,flexDirection:' +
      '"column",children:e(n,{children:"Here is Claude\'s plan:"})}),e(gl,{marginBottom:1,children:$o!==null' +
      '?e(za,{children:$o}):e(n,{dimColor:!0,children:Eot})}),e(s,{flexDirection:"column",paddingX:1,childr' +
      'en:e(Uw,{permissionResult:h.permissionResult,toolType:"tool"})})]})})}),r(s,{ref:Kn,flexDirection:"c' +
      'olumn",borderStyle:"round",borderColor:"planMode",borderLeft:!1,borderRight:!1,borderBottom:!1,paddi' +
      'ngX:1,flexShrink:0,children:[e(n,{dimColor:!0,children:"Claude has written up a plan and is ready to' +
      ' execute. Would you like to proceed?"}),e(s,{marginTop:1,children:e(Ge,{refuseInput:os,selectedValue' +
      ':Pi,options:Xo,defaultFocusValue:Dn,onChange:(Br)=>void Ar(Br),onCancel:ks,onImagePaste:An,pastedCon' +
      'tents:nt,onRemoveImage:Fn})}),Xn&&e(s,{marginTop:1,children:r(n,{children:[r(n,{dimColor:!0,children' +
      ':[e(G,{chord:"ctrl+g",action:`edit in ${Xn}`}),uo&&` \\xB7 ${rs(uo)}`]}),Go&&r(Y,{children:[e(n,{dimC' +
      'olor:!0,children:" \\xB7 "}),r(n,{color:"success",children:[e(ct,{status:"success",withSpace:!0}),"Pl' +
      'an saved!"]})]})]})})]})]})}';

    beginGraphContext(new Map([['/$bunfs/root/chunk-tjhhhqzz.js', input]]));
    enterGraphModule('/$bunfs/root/chunk-tjhhhqzz.js');
    let result: string | null;
    try {
      result = writeAutoAcceptPlanMode(input);
    } finally {
      leaveGraphModule();
      endGraphContext();
    }

    expect(result).not.toBeNull();
    expect(result).toContain(
      ';globalThis.__tweakccPlanAccept=()=>Ar((Dn??Xo?.[0]?.value??"yes-accept-edits-keep-context"));'
    );
    expect(result!.indexOf('globalThis.__tweakccPlanAccept=')).toBeGreaterThan(
      result!.indexOf('title:"Exit plan mode?"')
    );
    expect(result).toMatch(/,250\)\}return r\(ao,\{onKeyDown:Vr,/);
    expect(result).toContain(
      'ready to execute. The plan is approved automatically.'
    );
  });
});
