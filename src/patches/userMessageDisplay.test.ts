import { describe, it, expect } from 'vitest';
import { writeUserMessageDisplay } from './userMessageDisplay';
import { UserMessageDisplayConfig } from '../types';

const baseConfig: UserMessageDisplayConfig = {
  format: ' > {} ',
  styling: [],
  foregroundColor: 'default',
  backgroundColor: null,
  borderStyle: 'none',
  borderColor: 'rgb(255,255,255)',
  paddingX: 0,
  paddingY: 0,
  fitBoxToContent: false,
};

// CC 2.1.138-style single bundle: Ink and chalk are defined in the same file.
const makeSingleBundle = () =>
  'function T({color:A,backgroundColor:B,dimColor:C=!1,bold:D=!1}){}' +
  'Bx.displayName="Box";CH.bold("a");CH.red("b");' +
  'function Up(A){let K=s(9),{text:w}=A.param;' +
  'if(!w)return KA(Error("No content found in user prompt message")),null;' +
  'let X;if(K[0]!==w)X=Q.jsx(Sub,{text:w,useBriefLayout:q,timestamp:t}),K[0]=w,K[1]=X;else X=K[1];' +
  'return Q.jsx(Bx,{flexDirection:"column",children:X})}';

// Real excerpt of CC 2.1.295 chunk-88x0yy2z.js: Text `n`, Box `s` and jsx `e`
// are imported aliases; chalk is not in scope.
const makeChunk295 = () =>
  'import{Ii,sn,tt,jq,UNt,s,n,jt,Ho,iu,oa}from"/$bunfs/root/chunk-m969rmvk.js";' +
  EXCERPT_295;

const EXCERPT_295 =
  'function Yo(m){let b=w(19),{text:l}=m.param,{messageId:g,origin:f,isExpanded:h}=m,M=f?.kind==="plugin"?f.name:void 0,C;if(b[0]!==m||b[1]!==M||b[2]!==l)C=(E)=>e(Wp,{...m,addMargin:M===void 0&&m.addMargin,param:E===l?m.param:{...m.param,text:E}}),b[0]=m,b[1]=M,b[2]=l,b[3]=C;else C=b[3];let v;if(b[4]!==h||b[5]!==g||b[6]!==f||b[7]!==C||b[8]!==l)v={messageId:g,stored:f,text:l,isExpanded:h,draw:C},b[4]=h,b[5]=g,b[6]=f,b[7]=C,b[8]=l,b[9]=v;else v=b[9];let U=Mq.useUserMessageSite(v);if(M===void 0){return U}const B=m.addMargin&&!m.followsSpeakerLabel&&!m.followsInboundLabel?1:0;let j;if(b[10]===S)j=r(n,{"aria-hidden":!0,children:[te.pointerSmall," "]}),b[10]=j;else j=b[10];let O;if(b[11]!==M)O=mle(M),b[11]=M,b[12]=O;else O=b[12];let A;if(b[13]!==O)A=r(n,{dimColor:!0,children:[j,"Prompt from the ",O," plugin"]}),b[13]=O,b[14]=A;else A=b[14];let K;if(b[15]!==U||b[16]!==B||b[17]!==A)K=r(s,{flexDirection:"column",marginTop:B,children:[A,U]}),b[15]=U,b[16]=B,b[17]=A,b[18]=K;else K=b[18];return K}function Wp(m){let K=w(23),{addMargin:l,param:g,isTranscriptMode:f,timestamp:h,messageId:M,followsSpeakerLabel:b,followsInboundLabel:C}=m,{text:E}=g,v=b===void 0?!1:b,U=C===void 0?!1:C,B=Bp(M),j=V(hA),O=V(TA),A=a.CLAUDE_CODE_BRIEF,W;if(K[0]!==j||K[1]!==f||K[2]!==O)W=J1()&&(A||k("tengu_kairos_brief",!1))&&j&&!f&&!O,K[0]=j,K[1]=f,K[2]=O,K[3]=W;else W=K[3];let q=W,H;if(K[4]!==E)H=MC()?FCo(E,QEe()):E,K[4]=E,K[5]=H;else H=K[5];let Q;if(K[6]!==H)Q=GLt(H),K[6]=H,K[7]=Q;else Q=K[7];let Z=Q;if(!E){return c(Error("No content found in user prompt message")),null}if(U){let z;if(K[8]!==E)z=e(WR,{text:E}),K[8]=E,K[9]=z;else z=K[9];return z}if(v){let z;if(K[10]!==B||K[11]!==Z)z=e(s,{flexDirection:"column",children:e(VLt,{text:Z,bodyOnly:!0,awaitingModel:B})}),K[10]=B,K[11]=Z,K[12]=z;else z=K[12];return z}const z=l?1:0,re=q?void 0:"userMessageBackground",X=q?0:1,me=q?h:void 0;let ce;if(K[13]!==B||K[14]!==Z||K[15]!==me||K[16]!==q)ce=e(VLt,{text:Z,useBriefLayout:q,timestamp:me,awaitingModel:B}),K[13]=B,K[14]=Z,K[15]=me,K[16]=q,K[17]=ce;else ce=K[17];let oe;if(K[18]!==ce||K[19]!==z||K[20]!==re||K[21]!==X)oe=e(s,{flexDirection:"column",marginTop:z,backgroundColor:re,paddingRight:X,children:ce}),K[18]=ce,K[19]=z,K[20]=re,K[21]=X,K[22]=oe;else oe=K[22];return oe}';

describe('writeUserMessageDisplay', () => {
  it('returns null for modules without the user prompt component', () => {
    expect(
      writeUserMessageDisplay('function f(){return 1}', baseConfig)
    ).toBeNull();
  });

  it('patches the memoized jsx child in single-bundle CC with chalk', () => {
    const result = writeUserMessageDisplay(makeSingleBundle(), {
      ...baseConfig,
      styling: ['bold'],
    });
    expect(result).toContain(
      'X=Q.jsx(Bx,{children:Q.jsx(T,{children:CH.bold(` > ${(typeof w=="object"'
    );
    expect(result).not.toContain('Q.jsx(Sub,');
  });

  it('patches the CC 2.1.295 chunk with Text props', () => {
    const result = writeUserMessageDisplay(makeChunk295(), {
      ...baseConfig,
      format: '\u276f {}',
      styling: ['bold'],
      foregroundColor: 'rgb(1,2,3)',
      backgroundColor: 'rgb(4,5,6)',
      borderStyle: 'round',
    })!;
    expect(result).toContain(
      'ce=e(s,{borderStyle:"round",borderColor:"rgb(255,255,255)",children:e(n,{color:"rgb(1,2,3)",backgroundColor:"rgb(4,5,6)",bold:!0,children:`\\u276f ${(typeof Z=="object"?Z.head+"\\n\\u2026 +"+Z.hiddenLines+" lines\\n"+Z.tail:Z)}`})}),K[13]=B'
    );
    expect(result).toContain('re=q?void 0:void 0,');
    expect(result).not.toContain('e(VLt,{text:Z,useBriefLayout');
  });

  it('keeps the theme background for the default background', () => {
    const result = writeUserMessageDisplay(makeChunk295(), {
      ...baseConfig,
      backgroundColor: 'default',
    })!;
    expect(result).toContain('re=q?void 0:"userMessageBackground"');
    expect(result).toContain('ce=e(s,{children:e(n,{children:` > ${');
  });
});
