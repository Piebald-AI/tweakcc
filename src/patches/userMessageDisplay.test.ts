import { describe, expect, it } from 'vitest';

import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { writeUserMessageDisplay } from './userMessageDisplay';
import type { UserMessageDisplayConfig } from '../types';

const config: UserMessageDisplayConfig = {
  format: ' > {} ',
  styling: ['bold'],
  foregroundColor: 'default',
  backgroundColor: null,
  borderStyle: 'none',
  borderColor: 'rgb(255,255,255)',
  paddingX: 0,
  paddingY: 0,
  fitBoxToContent: false,
};

// Trimmed from real Claude Code 2.1.295 chunks: the user prompt row
// (chunk-88x0yy2z), Ink's Text and themed Box (chunk-m969rmvk) and a chalk
// consumer (chunk-56n0ak5v).
const graph = {
  '/user.js':
    'import{s,n}from"/ink.js";function Yo(m){let b=w(19),{text:l}=m.param,{messageId:g,origin:f,isExpanded:h}=m,M=f?.kind==="plugin"?f.name:void 0,C;if(b[0]!==m||b[1]!==M||b[2]!==l)C=(E)=>e(Wp,{...m,addMargin:M===void 0&&m.addMargin,param:E===l?m.param:{...m.param,text:E}}),b[0]=m,b[1]=M,b[2]=l,b[3]=C;else C=b[3];let v;if(b[4]!==h||b[5]!==g||b[6]!==f||b[7]!==C||b[8]!==l)v={messageId:g,stored:f,text:l,isExpanded:h,draw:C},b[4]=h,b[5]=g,b[6]=f,b[7]=C,b[8]=l,b[9]=v;else v=b[9];let U=Mq.useUserMessageSite(v);if(M===void 0){return U}const B=m.addMargin&&!m.followsSpeakerLabel&&!m.followsInboundLabel?1:0;let j;if(b[10]===S)j=r(n,{"aria-hidden":!0,children:[te.pointerSmall," "]}),b[10]=j;else j=b[10];let O;if(b[11]!==M)O=mle(M),b[11]=M,b[12]=O;else O=b[12];let A;if(b[13]!==O)A=r(n,{dimColor:!0,children:[j,"Prompt from the ",O," plugin"]}),b[13]=O,b[14]=A;else A=b[14];let K;if(b[15]!==U||b[16]!==B||b[17]!==A)K=r(s,{flexDirection:"column",marginTop:B,children:[A,U]}),b[15]=U,b[16]=B,b[17]=A,b[18]=K;else K=b[18];return K}function Wp(m){let K=w(23),{addMargin:l,param:g,isTranscriptMode:f,timestamp:h,messageId:M,followsSpeakerLabel:b,followsInboundLabel:C}=m,{text:E}=g,v=b===void 0?!1:b,U=C===void 0?!1:C,B=Bp(M),j=V(hA),O=V(TA),A=a.CLAUDE_CODE_BRIEF,W;if(K[0]!==j||K[1]!==f||K[2]!==O)W=J1()&&(A||k("tengu_kairos_brief",!1))&&j&&!f&&!O,K[0]=j,K[1]=f,K[2]=O,K[3]=W;else W=K[3];let q=W,H;if(K[4]!==E)H=MC()?FCo(E,QEe()):E,K[4]=E,K[5]=H;else H=K[5];let Q;if(K[6]!==H)Q=GLt(H),K[6]=H,K[7]=Q;else Q=K[7];let Z=Q;if(!E){return c(Error("No content found in user prompt message")),null}if(U){let z;if(K[8]!==E)z=e(WR,{text:E}),K[8]=E,K[9]=z;else z=K[9];return z}if(v){let z;if(K[10]!==B||K[11]!==Z)z=e(s,{flexDirection:"column",children:e(VLt,{text:Z,bodyOnly:!0,awaitingModel:B})}),K[10]=B,K[11]=Z,K[12]=z;else z=K[12];return z}const z=l?1:0,re=q?void 0:"userMessageBackground",X=q?0:1,me=q?h:void 0;let ce;if(K[13]!==B||K[14]!==Z||K[15]!==me||K[16]!==q)ce=e(VLt,{text:Z,useBriefLayout:q,timestamp:me,awaitingModel:B}),K[13]=B,K[14]=Z,K[15]=me,K[16]=q,K[17]=ce;else ce=K[17];let oe;if(K[18]!==ce||K[19]!==z||K[20]!==re||K[21]!==X)oe=e(s,{flexDirection:"column",marginTop:z,backgroundColor:re,paddingRight:X,children:ce}),K[18]=ce,K[19]=z,K[20]=re,K[21]=X,K[22]=oe;else oe=K[22];return oe}',
  '/ink.js':
    'function n(o){let r=w(31),l,u,c,p,m,b,C,h,x,v,E;if(r[0]!==o)({color:c,backgroundColor:l,dimColor:m,bold:b,italic:C,underline:h,strikethrough:x,inverse:v,wrap:E,children:u,...p}=o),r[0]=o,r[1]=l,r[2]=u,r[3]=c,r[4]=p,r[5]=m,r[6]=b,r[7]=C,r[8]=h,r[9]=x,r[10]=v,r[11]=E;else l=r[1],u=r[2],c=r[3],p=r[4],m=r[5],b=r[6],C=r[7],h=r[8],x=r[9],v=r[10],E=r[11];let A=m===void 0?!1:m,T=b===void 0?!1:b,M=C===void 0?!1:C,B=h===void 0?!1:h,O=x===void 0?!1:x,D=v===void 0?!1:v,L=E===void 0?"wrap":E,_=zb(),W=Te(hXe),U;if(r[12]!==c||r[13]!==A||r[14]!==W||r[15]!==_)U=A&&!W?_.inactive:G(c,_),r[12]=c,r[13]=A,r[14]=W,r[15]=_,r[16]=U;else U=r[16];let I=U,H;if(r[17]!==l||r[18]!==_)H=G(l,_),r[17]=l,r[18]=_,r[19]=H;else H=r[19];let z=H,te;if(r[20]!==T||r[21]!==u||r[22]!==p||r[23]!==D||r[24]!==M||r[25]!==z||r[26]!==I||r[27]!==O||r[28]!==B||r[29]!==L)te=e(wd,{color:I,backgroundColor:z,bold:T,italic:M,underline:B,strikethrough:O,inverse:D,wrap:L,...p,children:u}),r[20]=T,r[21]=u,r[22]=p,r[23]=D,r[24]=M,r[25]=z,r[26]=I,r[27]=O,r[28]=B,r[29]=L,r[30]=te;else te=r[30];return te}function kt(o){let r=zb();return e(ld,{...o,borderColor:j(o.borderColor,r),borderTopColor:j(o.borderTopColor,r),borderBottomColor:j(o.borderBottomColor,r),borderLeftColor:j(o.borderLeftColor,r),borderRightColor:j(o.borderRightColor,r),backgroundColor:j(o.backgroundColor,r)})}var s=kt;export{s,n};',
  '/styles.js':
    'import{ge}from"/chalk.js";var oye=(r,i,e)=>{if(i.startsWith("#"))return e==="foreground"?ge.hex(i)(r):ge.bgHex(i)(r);if(i.startsWith("ansi256")){let n=y.exec(i);if(!n)return r;let o=Number(n[1]);return e==="foreground"?ge.ansi256(o)(r):ge.bgAnsi256(o)(r)}if(i.startsWith("rgb")){let n=k.exec(i);if(!n)return r;let o=Number(n[1]),g=Number(n[2]),t=Number(n[3]);return e==="foreground"?ge.rgb(o,g,t)(r):ge.bgRgb(o,g,t)(r)}return r};function wqe(r,i){let e=r;if(i.inverse)e=D7(e);if(i.strikethrough)e=ge.strikethrough(e);if(i.underline)e=ge.underline(e);if(i.italic)e=ge.italic(e);if(i.bold)e=ge.bold(e);if(i.dim)e=ge.dim(e);if(i.color)e=oye(e,i.color,"foreground");if(i.backgroundColor)e=oye(e,i.backgroundColor,"background");return e}',
  '/chalk.js': 'var ge={};export{ge};',
};

const onGraph = (c: UserMessageDisplayConfig) => {
  const sources = new Map(Object.entries(graph));
  const out = applyPatchImplementationsToGraph(
    sources,
    { p: { fn: s => writeUserMessageDisplay(s, c) } },
    [{ id: 'p', name: 'p', group: PatchGroup.MISC_CONFIGURABLE }]
  );
  return { sources, result: out.results[0] };
};

describe('writeUserMessageDisplay on CC 2.1.295', () => {
  it('replaces the memoised prompt row and drops the theme background', () => {
    const { sources, result } = onGraph(config);
    expect(result).toMatchObject({ applied: true, failed: false });
    const user = sources.get('/user.js')!;
    expect(user).toContain(
      'ce=e(globalThis.__tweakccExports.ink_js__s,{children:e(globalThis.__tweakccExports.ink_js__n,{children:globalThis.__tweakccExports.chalk_js__ge.bold(` > ${(typeof Z=="object"?Z.head+"\\n\\u2026 +"+Z.hiddenChars+" chars\\n"+Z.tail:Z)} `)})}),K[13]=B'
    );
    expect(user).toContain('re=q?void 0:void 0,');
    expect(user).not.toContain('e(VLt,{text:Z,useBriefLayout');
  });

  it('keeps the theme background for the default background', () => {
    const { sources } = onGraph({ ...config, backgroundColor: 'default' });
    expect(sources.get('/user.js')).toContain(
      're=q?void 0:"userMessageBackground"'
    );
  });
});
