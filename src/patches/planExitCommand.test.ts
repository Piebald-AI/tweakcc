import { describe, expect, it } from 'vitest';

import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { writePlanExitCommand } from './planExitCommand';

// Trimmed from real CC 2.1.295 chunks.
const HANDLER =
  'function b(i){let E=w(10),{planContent:o,planPath:f,editorName:y}=i,S;if(E[0]!==f)S=e(aU,{subtitle:f,children:"Current Plan"}),E[0]=f,E[1]=S;else S=E[1];let h;if(E[2]!==o)h=e(s,{marginTop:1,children:e(n,{children:o})}),E[2]=o,E[3]=h;else h=E[3];let d;if(E[4]!==y)d=y&&r(s,{marginTop:1,children:[e(n,{dimColor:!0,children:\'"/plan open"\'}),e(n,{dimColor:!0,children:" to edit this plan in "}),e(n,{bold:!0,dimColor:!0,children:y})]}),E[4]=y,E[5]=d;else d=E[5];let c;if(E[6]!==S||E[7]!==h||E[8]!==d)c=r(s,{flexDirection:"column",children:[S,h,d]}),E[6]=S,E[7]=h,E[8]=d,E[9]=c;else c=E[9];return c}async function se(i,o,f){let{getAppState:y,setAppState:E}=o,h=y().toolPermissionContext.mode,d=h!=="plan";if(d)vpe(h,"plan"),E((a)=>({...a,toolPermissionContext:Fd($yt(a.toolPermissionContext),{type:"setMode",mode:"plan",destination:"session"})}));if(Ht()){if(!Ka())return i(d?"Enabled plan mode":"Already in plan mode."),null;let a=br(),l=f.trim();if(d&&l&&l!=="open"&&l!=="share"){try{await iHo(o.session,"plan",V)}catch(u){let P=u instanceof nVn;return m("plan_remote_query",P?"mode_push_timeout":"mode_push_rejected"),i(P?`Enabled plan mode locally, but the cloud session didn\\u2019t confirm the switch in time \\u2014 your description was not sent: ${l}. The session may be having connection trouble; once it\\u2019s responding again, send the description as a normal message.`:`The cloud session couldn\\u2019t switch to plan mode, so your description was not sent: ${l}`),null}let p=xe({content:l,origin:{kind:"human"}});if(o.setMessages((u)=>[...u,p]),!await a.sendMessage(l,{uuid:p.uuid}))return m("plan_remote_query","send_failed"),i("Enabled plan mode"),null;return g("plan_remote_query"),i("Enabled plan mode"),null}if(l.split(/\\s+/)[0]==="open")return g("plan_remote_open"),i("The plan file lives in the cloud workspace, so /plan open can\\u2019t open it in a local editor. Use /plan to view it; to change it, tell Claude what to revise, or edit the plan in the approval dialog when Claude finishes planning."),null;try{let p=await $t(a.sendControlRequest({subtype:"get_plan"}),k,"get_plan timed out");if(!p.exists||!p.content)return g("plan_remote_view"),i(d?"Enabled plan mode":"Already in plan mode. No plan written yet."),null;g("plan_remote_view");let _=co(o.session),u=p.content,P=(B)=>e(b,{planContent:dn(u).slice(0,F),planPath:p.path!==void 0&&!B?dn(p.path).replace(/[\\r\\n]/g," "):void 0,editorName:void 0}),N=await Scn(P(_),{storageV5:o.storageV5});if(!_&&co(o.session))N=await Scn(P(!0),{storageV5:o.storageV5});return i(N),null}catch(p){let _=p instanceof Error?p.message:String(p),u=_.includes("Unsupported control request subtype");return m("plan_remote_view",u?"unsupported_subtype":_.includes("get_plan timed out")?"timeout":"request_failed"),i(d?"Enabled plan mode":u?"Viewing plans in cloud sessions needs a newer session runtime.":"Couldn\\u2019t fetch the plan from the cloud session \\u2014 try again."),null}}if(d){let a=f.trim();if(a&&a!=="open"&&a!=="share")return i("Enabled plan mode",{shouldQuery:!0}),null;if(!n_e())return i("Enabled plan mode"),null}let c=gv();Wh(c);let C=await YKe(void 0,o.storageV5);if(!C)return i(d?"Enabled plan mode":"Already in plan mode. No plan written yet."),null;if(f.trim().split(/\\s+/)[0]==="open"){let a=await Aie(c);Wh(c);let l=co(o.session);if(a.error){if(l)t(`/plan open failed: ${a.error}`,{level:"error"});i(l?"Couldn\'t open the plan in the editor":a.error)}else i(l?"Opened plan in editor":`Opened plan in editor: ${c}`);return null}let R=nx(),O=R?DS(R):void 0,M=co(o.session),T=(a)=>e(b,{planContent:C,planPath:a?void 0:c,editorName:O}),A=await Scn(T(M),{storageV5:o.storageV5});if(!M&&co(o.session))A=await Scn(T(!0),{storageV5:o.storageV5});return i(A),null}export{se as call};\n';
const DIALOG =
  'function Bot({payload:h,answer:A,wouldTakeAnswer:L}){let H=V((Br)=>Br.toolPermissionContext),Z=Mn(),he=Sr(),{storageV5:Se,credentials:Me}=Ce(),De=su(),Oe=Fr(),{addNotification:Fe}=Eo(),[je,He]=y(""),[nt,lt]=y({}),xt=Ao(()=>[je]);P(()=>d5(()=>xt()),[]);let Pt=J(()=>br()!==null,[]),_t=(V((Br)=>Br.settings.showClearContextOnPlanAccept)}' +
  'export{Qsn,MN};';
const COMMAND =
  'var wSo={type:"local-jsx",name:"plan",description:"Enable plan mode or view the current session plan",argumentHint:"[open|<description>]",requires:{ink:!0}},LUe=wSo;';

const modules = () =>
  new Map([
    ['/$bunfs/root/chunk-0ta1k7h1.js', HANDLER],
    ['/$bunfs/root/chunk-tjhhhqzz.js', DIALOG],
    ['/$bunfs/root/chunk-53bsrq2x.js', COMMAND],
  ]);

const onGraph = (sources: Map<string, string>) =>
  applyPatchImplementationsToGraph(
    sources,
    { p: { fn: writePlanExitCommand } },
    [{ id: 'p', name: 'p', group: PatchGroup.ALWAYS_APPLIED }]
  ).results[0];

describe('writePlanExitCommand', () => {
  it('renders the plan approval dialog for /plan exit (CC 2.1.295)', () => {
    const sources = modules();

    expect(onGraph(sources)).toMatchObject({ applied: true, failed: false });
    const handler = sources.get('/$bunfs/root/chunk-0ta1k7h1.js')!;
    expect(handler).toContain(
      'd=h!=="plan";if(f.trim()==="exit"){if(d)return i("Not in plan mode."),null;let tccPath=gv(),tccPlan=await YKe(void 0,o.storageV5);'
    );
    expect(handler).toContain(
      'return e(globalThis.__tweakccExports.chunk_tjhhhqzz_js__Bot,{payload:{plan:tccPlan,planFilePath:tccPath,'
    );
    expect(handler).toContain(
      'initialMessage:{message:xe({content:"Implement the following plan:\\n\\n"'
    );
    expect(
      () => new Function(handler.replace('export{se as call};', ''))
    ).not.toThrow();
    expect(sources.get('/$bunfs/root/chunk-tjhhhqzz.js')).toContain(
      '"chunk_tjhhhqzz_js__Bot",{get:()=>Bot,'
    );
    expect(sources.get('/$bunfs/root/chunk-53bsrq2x.js')).toContain(
      'argumentHint:"[open|exit|<description>]"'
    );
  });

  it('leaves an already patched graph unchanged', () => {
    const sources = modules();
    onGraph(sources);
    const patched = new Map(sources);

    expect(onGraph(sources)).toMatchObject({ applied: false, failed: false });
    expect(sources).toEqual(patched);
  });

  it('fails when the /plan handler is missing', () => {
    const sources = modules();
    sources.delete('/$bunfs/root/chunk-0ta1k7h1.js');

    expect(onGraph(sources)).toMatchObject({ applied: false, failed: true });
  });
});
