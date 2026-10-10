import { describe, it, expect } from 'vitest';
import { writeTableFormat } from '../patches/tableFormat';

describe('tableFormat patch', () => {
  // Simulate the MINIFIED cli.js table code - using the actual pattern from cli.js
  // This is the real minified pattern from the CLI
  const testCliCode = `function T(S){let[g,b,Q,F]={top:["┌","─","┬","┐"],middle:["├","─","┼","┤"],bottom:["└","─","┴","┘"]}[S],B=g;return V.forEach((d,o)=>{B+=b.repeat(d+2),B+=o<V.length-1?Q:F}),B}function N(S,g){let b=S.map((d,o)=>{let l=H(d.tokens),e=V[o];return kT6(l,e)}),Q=Math.max(...b.map((d)=>d.length),1),F=b.map((d)=>Math.floor((Q-d.length)/2)),B=[];for(let d=0;d<Q;d++){let o="│";for(let l=0;l<S.length;l++){let e=b[l],XA=F[l],GA=d-XA,WA=GA>=0&&GA<e.length?e[GA]:"",ZA=V[l],t=g?"center":A.align?.[l]??"left",$A=p7(WA),VA=Math.max(0,ZA-$A),MA;if(t==="center"){let SA=Math.floor(VA/2),BA=VA-SA;MA=" ".repeat(SA)+WA+" ".repeat(BA)}else if(t==="right")MA=" ".repeat(VA)+WA;else MA=WA+" ".repeat(VA);o+=" "+MA+" │"}B.push(o)}return B}if(P)return JG1.default.createElement(t3,null,k());let R=[];if(R.push(T("top")),R.push(...N(A.header,!0)),R.push(T("middle")),A.rows.forEach((S,g)=>{if(R.push(...N(S,!1)),g<A.rows.length-1)R.push(T("middle"))}),R.push(T("bottom")),Math.max(...R.map((S)=>p7(AH(S))))>w-UtY)return JG1.default.createElement(t3,null,k());`;

  describe('default format', () => {
    it('should return null and not modify anything', () => {
      const result = writeTableFormat(testCliCode, 'default');
      expect(result).toBeNull();
    });
  });

  describe('ascii format', () => {
    it('should patch table borders to ASCII characters', () => {
      const result = writeTableFormat(testCliCode, 'ascii');
      expect(result).not.toBeNull();
      expect(result).toContain('middle:["|","-","|","|"]');
    });

    it('should patch vertical border characters', () => {
      const result = writeTableFormat(testCliCode, 'ascii');
      expect(result).not.toBeNull();
      expect(result).toContain('o+=" "+MA+" |"');
    });

    it('should remove inter-row separators', () => {
      const result = writeTableFormat(testCliCode, 'ascii');
      expect(result).not.toBeNull();
      // The original has: if(R.push(...N(S,!1)),g<A.rows.length-1)R.push(T("middle"))
      // After patch it should just have: R.push(...N(S,!1))
      expect(result).not.toContain('g<A.rows.length-1');
    });

    it('should remove T("top") and T("bottom") pushes to prevent blank lines', () => {
      const result = writeTableFormat(testCliCode, 'ascii');
      expect(result).not.toBeNull();
      expect(result).not.toContain('R.push(T("top"))');
      expect(result).not.toContain('R.push(T("bottom"))');
    });
  });

  describe('clean format', () => {
    it('should patch table borders with empty top/bottom', () => {
      const result = writeTableFormat(testCliCode, 'clean');
      expect(result).not.toBeNull();
      expect(result).toContain('top:["","","",""]');
      expect(result).toContain('bottom:["","","",""]');
    });

    it('should keep box-drawing middle border', () => {
      const result = writeTableFormat(testCliCode, 'clean');
      expect(result).not.toBeNull();
      expect(result).toContain('middle:["├","─","┼","┤"]');
    });

    it('should remove inter-row separators', () => {
      const result = writeTableFormat(testCliCode, 'clean');
      expect(result).not.toBeNull();
      expect(result).not.toContain('g<A.rows.length-1');
    });

    it('should remove T("top") and T("bottom") pushes to prevent blank lines', () => {
      const result = writeTableFormat(testCliCode, 'clean');
      expect(result).not.toBeNull();
      // Original has: R.push(T("top")),R.push(...
      // Should be removed to prevent blank lines
      expect(result).not.toContain('R.push(T("top"))');
      expect(result).not.toContain('R.push(T("bottom"))');
    });
  });

  describe('clean-top-bottom format', () => {
    it('should keep original table borders', () => {
      const result = writeTableFormat(testCliCode, 'clean-top-bottom');
      expect(result).not.toBeNull();
      expect(result).toContain('top:["┌","─","┬","┐"]');
      expect(result).toContain('bottom:["└","─","┴","┘"]');
      expect(result).toContain('middle:["├","─","┼","┤"]');
    });

    it('should remove inter-row separators', () => {
      const result = writeTableFormat(testCliCode, 'clean-top-bottom');
      expect(result).not.toBeNull();
      expect(result).not.toContain('g<A.rows.length-1');
    });
  });

  // CC 2.1.195 refactored the compact-table renderer: the cell value became a
  // call expression with nested parens, and the vertical bar uses │
  // escapes. This mirrors the real bundle so the widened locator is exercised.
  describe('ascii format — 2.1.195 compact renderer (call-form cell value)', () => {
    const jsxRendererCode = `function Wq6(I,A){let N=[];for(let B=0;B<L;B++){let $="\\u2502";for(let q=0;q<D.length;q++){let W=O[q],V=M[q],Y=B-V,z=Y>=0&&Y<W.length?W[Y]:"",K=_[q],Z=P?"center":e.align?.[q]??"left";$+=" "+_6n(z,rn(z),K,Z)+" \\u2502"}N.push($)}return N}`;

    it('converts the call-form cell separator to ASCII while preserving the call', () => {
      const result = writeTableFormat(jsxRendererCode, 'ascii');
      expect(result).not.toBeNull();
      expect(result).toContain('+_6n(z,rn(z),K,Z)+" |"');
      expect(result).not.toContain('+_6n(z,rn(z),K,Z)+" \\u2502"');
    });

    // Leaving the row-leading `│` rendered rows as `│ A | B |` instead of the
    // documented `| A | B |`.
    it('converts the row-leading bar too, so rows read | A | B |', () => {
      const result = writeTableFormat(jsxRendererCode, 'ascii');
      expect(result).not.toBeNull();
      expect(result).toContain('let $="|"');
      expect(result).not.toContain('\\u2502');
    });
  });

  // Real CC 2.1.295 excerpt (chunk-6eyyxvtm.js): the rows array is hoisted
  // into `d`, borders are \u escapes, and the bottom push ends a statement.
  describe('ascii format — CC 2.1.295 renderer', () => {
    const cc295 = String.raw`function ee(H,M){let B=H.map((Q,se)=>{let oe=g(Q.tokens),xe=W[se];return fe(oe,xe,{hard:_})}),j=Math.max(...B.map((Q)=>Q.length),1),X=B.map((Q)=>Math.floor((j-Q.length)/2)),re=[];for(let Q=0;Q<j;Q++){let se="\u2502";for(let oe=0;oe<H.length;oe++){let xe=B[oe],G=X[oe],z=Q-G,ne=z>=0&&z<xe.length?xe[z]:"",ye=W[oe],pe=M?"center":o.align?.[oe]??"left";se+=" "+S4n(ne,ae(ne),ye,pe)+" \u2502"}re.push(se)}return re}function Z(H){let[M,B,j,X]={top:["\u250C","\u2500","\u252C","\u2510"],middle:["\u251C","\u2500","\u253C","\u2524"],bottom:["\u2514","\u2500","\u2534","\u2518"]}[H],re=M;return W.forEach((Q,se)=>{re+=B.repeat(Q+2),re+=se<W.length-1?j:X}),re}if(q)return Y();let V=[];V.push(Z("top")),V.push(...ee(o.header,!0)),V.push(Z("middle")),d.forEach((H,M)=>{if(V.push(...ee(H,!1)),M<d.length-1)V.push(Z("middle"))}),V.push(Z("bottom"));let ie=0;for(let H of V){let M=ae(dn(H));if(M>ie)ie=M}if(ie>i-Pe)return Y();`;

    it('drops the top and bottom border rows instead of rendering empty lines', () => {
      const result = writeTableFormat(cc295, 'ascii');
      expect(result).not.toBeNull();
      expect(result).toContain(
        'let V=[];V.push(...ee(o.header,!0)),V.push(Z("middle")),d.forEach((H,M)=>{V.push(...ee(H,!1))});let ie=0;'
      );
      expect(result).toContain('let se="|"');
      expect(result).toContain('+S4n(ne,ae(ne),ye,pe)+" |"');
    });
  });
});
