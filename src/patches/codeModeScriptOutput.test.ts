import { describe, expect, it } from 'vitest';

import { writeCodeModeScriptOutput } from './codeModeScriptOutput';

// ScriptSourceRow and its sanitizer from CC 2.1.332 (chunk-x3dt93az.js).
const ROW =
  'var J=6,O=/\\r\\n?/g,Q=/[\\u2028\\u2029]/g,Eo=/[\\p{Cs}\\p{Co}\\p{Cn}\\u2800\\u{E0020}-\\u{E007F}]|(?!\\u0020)\\p{Zs}/gu,Ao=/[\\uFE0E\\uFE0F\\u200D]{2,}/g,wo=/^[\\uFE0E\\uFE0F]?\\u200D?/;function Mo(s){let t=k(65),{tool:r,toolUseId:_,input:b,toolLabel:z,output:d,shouldAnimate:B,isUnresolved:V,isError:f,addMargin:j}=s,i=Se(oOn),{columns:H}=Ge(),h=Se(xF),p=fu("transcript:toggleShowAll","Transcript","ctrl+e"),uo;if(t[0]!==i||t[1]!==_)uo=i!==null&&(i.all||i.keys.has(Uor(_))),t[0]=i,t[1]=_,t[2]=uo;else uo=t[2];let[Z,m]=jD(uo),F,S,C,E,A,w,q,M,T,R,D,L,N,P,v;if(t[3]!==j||t[4]!==i||t[5]!==Z||t[6]!==h||t[7]!==b||t[8]!==f||t[9]!==V||t[10]!==d||t[11]!==B||t[12]!==p||t[13]!==r||t[14]!==z){q=Jn;Qo:{let po=sOn(b);if(i===null||po===void 0){q=null;break Qo}let mo=kT(r,b);let G=mo.success?mo.data:void 0;let fo=G===void 0?null:r.getToolUseSummary?.(G)??null;w=U(po.replace(O,`\n`).replace(Q,`$&\n`)).trimEnd();A=At(w,`\n`)+1;let c;if(t[30]!==d)c=Pe(d)&&d.asyncDispatched===!0,t[30]=d,t[31]=c;else c=t[31];let ho=c;let u;if(t[32]!==h||t[33]!==p)u=!h?p&&`${p} to show`:iN()==="full"?"click to show":"[ to show",t[32]=h,t[33]=p,t[34]=u;else u=t[34];E=u;C=g;L=Z;N="column";P=j?1:0;v="100%";S=g;T="row";const l=B&&!ho;const a=V||ho;if(t[35]!==f||t[36]!==l||t[37]!==a)R=e(Roe,{shouldAnimate:l,isUnresolved:a,isError:f}),t[35]=f,t[36]=l,t[37]=a,t[38]=R;else R=t[38];D=e(g,{flexShrink:0,children:e(yv,{bold:!0,wrap:"truncate-end",children:z??r.userFacingName(G)})});F=n;M=fo!==null&&`(${U(fo)})`}t[3]=j,t[4]=i,t[5]=Z,t[6]=h,t[7]=b,t[8]=f,t[9]=V,t[10]=d,t[11]=B,t[12]=p,t[13]=r,t[14]=z,t[15]=F,t[16]=S,t[17]=C,t[18]=E,t[19]=A,t[20]=w,t[21]=q,t[22]=M,t[23]=T,t[24]=R,t[25]=D,t[26]=L,t[27]=N,t[28]=P,t[29]=v}else F=t[15],S=t[16],C=t[17],E=t[18],A=t[19],w=t[20],q=t[21],M=t[22],T=t[23],R=t[24],D=t[25],L=t[26],N=t[27],P=t[28],v=t[29];if(q!==Jn)return q;let c;if(t[39]!==m||t[40]!==E||t[41]!==A)c=!m&&o(n,{dimColor:!0,children:[` \\xB7 ${A} ${x(A,"line")}`,E&&` (${E})`]}),t[39]=m,t[40]=E,t[41]=A,t[42]=c;else c=t[42];let u;if(t[43]!==F||t[44]!==c||t[45]!==M)u=o(F,{children:[M,c]}),t[43]=F,t[44]=c,t[45]=M,t[46]=u;else u=t[46];let l;if(t[47]!==S||t[48]!==u||t[49]!==T||t[50]!==R||t[51]!==D)l=o(S,{flexDirection:T,children:[R,D,u]}),t[47]=S,t[48]=u,t[49]=T,t[50]=R,t[51]=D,t[52]=l;else l=t[52];let a;if(t[53]!==H||t[54]!==m||t[55]!==w)a=m&&e(Qn,{children:e(YT,{code:w,filePath:"script.js",width:H-J,lineNumbers:!1})}),t[53]=H,t[54]=m,t[55]=w,t[56]=a;else a=t[56];let go;if(t[57]!==C||t[58]!==l||t[59]!==a||t[60]!==L||t[61]!==N||t[62]!==P||t[63]!==v)go=o(C,{ref:L,flexDirection:N,marginTop:P,width:v,children:[l,a]}),t[57]=C,t[58]=l,t[59]=a,t[60]=L,t[61]=N,t[62]=P,t[63]=v,t[64]=go;else go=t[64];return go}function U(s){return y1(s).replace(Eo,co).replace(Ao,To)}function To(s){let r=wo.exec(s)?.[0]??"";return`${r}${Array.from(s.slice(r.length),co).join("")}`}function co(s){return`\\\\u{${(s.codePointAt(0)??0).toString(16).toUpperCase()}}`}';

interface Element {
  type: unknown;
  props: { children?: unknown };
}

const jsx = (type: unknown, props: object, key?: string) => ({
  type,
  props,
  key,
});

// Renders the row with stub hooks; `all` is the transcript's expand-all state.
const render = (code: string, output: unknown, all = true) =>
  new Function(
    'k,Se,oOn,xF,Ge,fu,Uor,jD,Jn,sOn,kT,At,Pe,iN,g,Roe,e,o,yv,n,x,Qn,YT,y1',
    `${code};return Mo;`
  )(
    (size: number) => Array(size).fill(Symbol('empty')),
    (context: string) => (context === 'oOn' ? { all, keys: new Set() } : false),
    'oOn',
    'xF',
    () => ({ columns: 80 }),
    () => 'ctrl+e',
    (id: string) => id,
    (expanded: boolean) => [null, expanded],
    Symbol('none'),
    (input: { code: string }) => input.code,
    (_tool: unknown, input: unknown) => ({ success: true, data: input }),
    (text: string, sep: string) => text.split(sep).length - 1,
    (value: unknown) => typeof value === 'object' && value !== null,
    () => 'full',
    'Box',
    'Spinner',
    jsx,
    jsx,
    'Name',
    'Text',
    (count: number, word: string) => (count === 1 ? word : `${word}s`),
    'Gutter',
    'Highlighted',
    // The real one shows control characters as visible symbols.
    (text: string) => text.replaceAll('\u001b', '\u241b')
  ).call(null, {
    tool: { userFacingName: () => 'Code', getToolUseSummary: () => null },
    toolUseId: 'toolu_1',
    input: { code: 'self.log("hi");\nreturn {n: 1};' },
    output,
    shouldAnimate: false,
    isUnresolved: false,
    isError: false,
    addMargin: false,
  }) as Element;

const shownText = (node: unknown): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(shownText).join('');
  if (node && typeof node === 'object' && 'props' in node)
    return shownText((node as Element).props.children);
  return '';
};

const OUTPUT = {
  code: 'self.log("hi");\nreturn {n: 1};',
  stdout: 'hi\n',
  stderr: '',
  result: '{ n: 1 }',
};

describe('writeCodeModeScriptOutput', () => {
  const patched = writeCodeModeScriptOutput(ROW)!;

  it('shows no output in the expanded row without the patch', () => {
    expect(shownText(render(ROW, OUTPUT))).not.toContain('result');
  });

  it('shows the log and the return value below the expanded source', () => {
    const text = shownText(render(patched, OUTPUT));
    expect(text).toContain('log: hi\n');
    expect(text).toContain('result: { n: 1 }');
    expect(text).not.toContain('stderr');
  });

  it('passes the output through the row sanitizer', () => {
    const text = shownText(
      render(patched, { ...OUTPUT, result: 'a\u001b[2Jb' })
    );
    expect(text).toContain('result: a\u241b[2Jb');
  });

  it('shows nothing while collapsed or for an async receipt', () => {
    expect(shownText(render(patched, OUTPUT, false))).not.toContain('result');
    expect(
      shownText(
        render(patched, {
          ...OUTPUT,
          result: '(dispatched #1)',
          asyncDispatched: true,
        })
      )
    ).not.toContain('result');
  });

  it('shows the recorded output for a settled async receipt', () => {
    const receipt = {
      code: OUTPUT.code,
      result: '(dispatched #1)',
      stdout: '',
      stderr: '',
      evalId: 1,
      asyncDispatched: true,
    };
    const store = globalThis as {
      __tweakccSettledReplOutputs?: Map<string, unknown>;
    };
    store.__tweakccSettledReplOutputs = new Map([['toolu_1', OUTPUT]]);
    try {
      expect(shownText(render(patched, receipt))).toContain('result: { n: 1 }');
    } finally {
      delete store.__tweakccSettledReplOutputs;
    }
  });

  it('returns null when the script source block is not there', () => {
    expect(writeCodeModeScriptOutput('let x=1;')).toBeNull();
    expect(
      writeCodeModeScriptOutput(ROW.replace('"script.js"', '"other.js"'))
    ).toBeNull();
  });
});
