import { describe, it, expect } from 'vitest';
import {
  writeThinkingVisibility,
  writeThinkingVisibilityModules,
} from './thinkingVisibility';

const cc209 =
  'function Vwd(WM,dq,Ilt,fJ,nLt,up,xir){switch(WM.type){' +
  'case"thinking":{if(!Ilt&&!fJ){return null}' +
  'let I4;if(nLt[32]!==dq||nLt[35]!==fJ)I4=up.jsx(xir,{addMargin:dq,param:WM,' +
  'isTranscriptMode:Ilt,verbose:fJ}),nLt[32]=dq,nLt[36]=I4;else I4=nLt[36];return I4}' +
  'default:{return null}}}' +
  'function oTd(e,t){let r=[];if(r.length===0)return null;' +
  'return Ea.jsx(Ea.Fragment,{children:r})}' +
  'function Llt(e,{tools:t,verbose:r,inProgressToolCallCount:o,isTranscriptMode:i=!1}){' +
  'if(!e.length)return Ea.jsx(fr,{height:1,children:null});return i}';

const cc205 =
  'function R(A,B,V,I){switch(A.type){' +
  'case"thinking":if(!V&&!I)return null;' +
  'return w3.createElement(Q$Q,{addMargin:B,param:A,isTranscriptMode:V,verbose:I});' +
  'default:return null}}';

const bracedSemicolon =
  'function R(A,B,V,I){switch(A.type){' +
  'case"thinking":{if(!V&&!I){return null;}' +
  'let k;k=w3.createElement(Q$Q,{addMargin:B,param:A,isTranscriptMode:V,verbose:I});return k}' +
  'default:{return null}}}';

const unrecognisedEarlyReturn =
  'function Vwd(WM,dq,Ilt,fJ,up,xir){switch(WM.type){' +
  'case"thinking":{if(!Ilt&&!fJ){return void 0}' +
  'let I4;I4=up.jsx(xir,{addMargin:dq,isTranscriptMode:Ilt,verbose:fJ});return I4}' +
  'default:{return null}}}' +
  'function oTd(e,q,z){let r=[];if(r.length===0)return null;' +
  'return Ea.jsx(F,{children:r,isTranscriptMode:q,verbose:z})}';

describe('thinkingVisibility', () => {
  describe('writeThinkingVisibility', () => {
    it('should not produce a syntax error on the CC 2.1.209 braces shape', () => {
      const result = writeThinkingVisibility(cc209);

      expect(result).not.toBeNull();
      expect(() => new Function(result as string)).not.toThrow();
    });

    it('should force isTranscriptMode true and drop the early return on 2.1.209', () => {
      const result = writeThinkingVisibility(cc209) as string;

      expect(result).toContain('isTranscriptMode:true,verbose:fJ');
      expect(result).not.toContain('if(!Ilt&&!fJ){return null}');
    });

    it('should not delete unrelated code that follows the thinking case on 2.1.209', () => {
      const result = writeThinkingVisibility(cc209) as string;

      expect(result).toContain('function oTd(e,t)');
      expect(result).toContain('if(r.length===0)return null;');
      expect(result).toContain('isTranscriptMode:i=!1');
      expect(result).toContain('I4=up.jsx(xir,{addMargin:dq,param:WM,');
    });

    it('should still patch the CC 2.0.50 semicolon shape', () => {
      const result = writeThinkingVisibility(cc205);

      expect(result).not.toBeNull();
      expect(result as string).toContain('isTranscriptMode:true,verbose:I');
      expect(result as string).not.toContain('if(!V&&!I)return null;');
      expect(() => new Function(result as string)).not.toThrow();
    });

    it('should keep braces balanced when the early return is `{return null;}`', () => {
      const result = writeThinkingVisibility(bracedSemicolon);

      expect(result).not.toBeNull();
      const out = result as string;
      expect(out).not.toContain('case"thinking":{}');
      expect((out.match(/\{/g) ?? []).length).toBe(
        (out.match(/\}/g) ?? []).length
      );
      expect(() => new Function(out)).not.toThrow();
    });

    it('should decline to patch an unrecognised early-return shape rather than match a distant one', () => {
      expect(writeThinkingVisibility(unrecognisedEarlyReturn)).toBeNull();
    });

    it('should return null when the thinking case is absent', () => {
      expect(writeThinkingVisibility('function f(){return 1}')).toBeNull();
    });
  });
});

const cc2295Renderer =
  'function rf(m){let X=w(59),{param:l,model:g,addMargin:f,verbose:b,should' +
  'ShowDot:U,isTranscriptMode:j,messageUuid:Z}=m;switch(l.type){case"redact' +
  'ed_thinking":{if(!j&&!b){return null}let de;if(X[38]!==f)de=e(Fa,{addMar' +
  'gin:f}),X[38]=f,X[39]=de;else de=X[39];return de}case"thinking":{if(rwt(' +
  'l)){let de;if(X[40]!==f||X[41]!==Z||X[42]!==g||X[43]!==l||X[44]!==U)de=e' +
  '($a,{param:l,model:g,addMargin:f,shouldShowDot:U,messageId:Z}),X[40]=f,X' +
  '[41]=Z,X[42]=g,X[43]=l,X[44]=U,X[45]=de;else de=X[45];return de}if(!j&&!' +
  'b){return null}let de;if(X[46]!==f||X[47]!==j||X[48]!==l||X[49]!==b)de=e' +
  '(ws,{addMargin:f,param:l,isTranscriptMode:j,verbose:b}),X[46]=f,X[47]=j,' +
  'X[48]=l,X[49]=b,X[50]=de;else de=X[50];return de}default:return null}}';

const cc2295Collapse =
  'function e9r(e){let H=[],G=Mve(),Y;for(let Re=0;Re<e.length;Re++){let Ce' +
  '=e[Re],Fe=hwn(Ce);if(!1);else if(t9r(Ce)||Fe!==void 0&&swt(Fe.message))T' +
  'e(),H.push(Ce);else if(Fe!==void 0){let Ge=Fe.memo.summary??=Nr(dn(Fe.me' +
  'mo.thinking));if(Ge)G.latestThinkingSummary=Ge;if(Y!==void 0){let Je=Dat' +
  'e.parse(Ce.timestamp)-Date.parse(Y);if(Number.isFinite(Je)&&Je>0)G.thoug' +
  'htForMs+=Math.min(Je,Lor)}G.messages.push(Fe.message)}else Te(),H.push(C' +
  'e)}return H}';

const cc2295Summaries = 'function fUn(){return ft().showThinkingSummaries??!1}';

describe('thinkingVisibility on CC 2.1.295 chunks', () => {
  const modules = new Map([
    ['/$bunfs/root/chunk-88x0yy2z.js', cc2295Renderer],
    ['/$bunfs/root/chunk-53bsrq2x.js', cc2295Collapse],
    ['/$bunfs/root/chunk-sn362cnh.js', cc2295Summaries],
    ['/$bunfs/root/chunk-other.js', 'function x(){return 1}'],
  ]);

  it('should keep the narration branch and force transcript mode', () => {
    const result = writeThinkingVisibility(cc2295Renderer) as string;

    expect(result).toContain('if(rwt(l)){let de;');
    expect(result).toContain('isTranscriptMode:true,verbose:b');
    expect(result).not.toContain('if(!j&&!b){return null}let de;if(X[46]');
    expect(result).toContain(
      'case"redacted_thinking":{if(!j&&!b){return null}'
    );
    expect(() => new Function(result)).not.toThrow();
  });

  it('should patch the renderer, collapse pass and summaries default', () => {
    const changed = writeThinkingVisibilityModules(modules)!;

    expect([...changed.keys()].sort()).toEqual([
      '/$bunfs/root/chunk-53bsrq2x.js',
      '/$bunfs/root/chunk-88x0yy2z.js',
      '/$bunfs/root/chunk-sn362cnh.js',
    ]);
    expect(changed.get('/$bunfs/root/chunk-88x0yy2z.js')).toContain(
      'isTranscriptMode:true,verbose:b'
    );
    expect(changed.get('/$bunfs/root/chunk-53bsrq2x.js')).toContain(
      'else if(t9r(Ce)||Fe!==void 0)Te(),H.push(Ce);else if(Fe!==void 0)'
    );
    expect(changed.get('/$bunfs/root/chunk-sn362cnh.js')).toBe(
      'function fUn(){return ft().showThinkingSummaries??!0}'
    );
    for (const file of changed.values()) {
      expect(() => new Function(file)).not.toThrow();
    }
  });

  it('should fail when one of the chunks is missing', () => {
    const partial = new Map(modules);
    partial.delete('/$bunfs/root/chunk-53bsrq2x.js');

    expect(writeThinkingVisibilityModules(partial)).toBeNull();
  });
});
