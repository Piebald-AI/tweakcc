import { describe, it, expect } from 'vitest';
import { writeAgentsMd } from './agentsMd';

const mockFunction =
  'function _t7(A,q){try{let K=x1();' +
  'if(!K.existsSync(A)||!K.statSync(A).isFile())return null;' +
  'let Y=UL9(A).toLowerCase();' +
  'if(Y&&!dL9.has(Y))' +
  'return(I(`Skipping non-text file in @include: ${A}`),null);' +
  'let z=K.readFileSync(A,{encoding:"utf-8"}),' +
  '{content:w,paths:H}=cL9(z);' +
  'return{path:A,type:q,content:w,globs:H};' +
  '}catch(K){' +
  'if(K instanceof Error&&K.message.includes("EACCES"))' +
  'n("tengu_claude_md_permission_error",{is_access_error:1});' +
  '}return null;}';

const altNames = ['AGENTS.md', 'GEMINI.md', 'QWEN.md'];

describe('agentsMd', () => {
  describe('writeAgentsMd', () => {
    it('should inject fallback at early return null when CLAUDE.md is missing', () => {
      const result = writeAgentsMd(mockFunction, altNames);
      expect(result).not.toBeNull();
      expect(result).toContain('didReroute');
      expect(result).toContain('endsWith("/CLAUDE.md")');
      expect(result).toContain('AGENTS.md');
      expect(result).toMatch(/\.isFile\(\)\)\{.*?return null;\}/);
    });

    it('should preserve CLAUDE.md content when present', () => {
      const result = writeAgentsMd(mockFunction, altNames)!;
      const returnIdx = result.indexOf('return{path:');
      expect(returnIdx).toBeGreaterThan(-1);
      const beforeReturn = result.slice(Math.max(0, returnIdx - 50), returnIdx);
      expect(beforeReturn).not.toContain('didReroute');
    });

    it('should pass didReroute=true in recursive calls', () => {
      const result = writeAgentsMd(mockFunction, altNames)!;
      expect(result).toContain('return _t7(altPath,q,true)');
    });

    it('should return null when no alternatives are found', () => {
      const result = writeAgentsMd(mockFunction, altNames)!;
      expect(result).toMatch(/\}return null;\}/);
    });

    it('should add didReroute parameter to function signature', () => {
      const result = writeAgentsMd(mockFunction, altNames)!;
      expect(result).toContain('function _t7(A,q,didReroute)');
    });

    it('should use the correct fs expression', () => {
      const result = writeAgentsMd(mockFunction, altNames)!;
      expect(result).toContain('K.existsSync(altPath)');
      expect(result).toContain('K.statSync(altPath)');
    });

    it('should return null when function pattern is not found', () => {
      const result = writeAgentsMd('not a valid file', altNames);
      expect(result).toBeNull();
    });

    // CC 2.1.199 refactored the async reader: the read moved into a helper
    // (aN, which stats then readFiles) and a regular-file/size guard was added.
    // A missing CLAUDE.md makes aN's stat throw ENOENT → the reader's catch, so
    // the AGENTS.md reroute must be injected there.
    const asyncReader199 =
      'async function aya(e,t,n){try{let r=Vt(),o=await aN(r,e,Ypo);' +
      'if(o===null)return T(`[CLAUDE.md] skipping ${e}: not a regular file or exceeds ${Ypo} byte limit`),{info:null,includePaths:[]};' +
      'return FHp(o,e,t,n)}catch(r){return jHp(r,e),{info:null,includePaths:[]}}}';

    it('handles the CC 2.1.199 async reader (reroute injected into catch)', () => {
      const result = writeAgentsMd(asyncReader199, altNames);
      expect(result).not.toBeNull();
      expect(result).toContain('async function aya(e,t,n,didReroute)');
      expect(result).toContain('endsWith("/CLAUDE.md")');
      expect(result).toContain('AGENTS.md');
      // recursion passes the extra params through + didReroute=true
      expect(result).toContain('await aya(altPath,t,n,true)');
      // original success + skip branches are preserved
      expect(result).toContain('return FHp(o,e,t,n)');
      expect(result).toContain('if(o===null)return T(');
      // reroute sits before the original error-handler return in the catch
      const catchIdx = result!.indexOf('catch(r){');
      const rerouteIdx = result!.indexOf('!didReroute', catchIdx);
      const errReturnIdx = result!.indexOf('return jHp(r,e)', catchIdx);
      expect(rerouteIdx).toBeGreaterThan(catchIdx);
      expect(rerouteIdx).toBeLessThan(errReturnIdx);
    });
  });
});
