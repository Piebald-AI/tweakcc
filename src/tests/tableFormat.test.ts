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

    it('leaves the row-leading bar untouched (out of scope)', () => {
      const result = writeTableFormat(jsxRendererCode, 'ascii');
      expect(result).not.toBeNull();
      expect(result).toContain('let $="\\u2502"');
    });
  });
});
