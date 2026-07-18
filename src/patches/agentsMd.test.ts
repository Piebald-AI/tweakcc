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
      // shared helper path: the patched reader must still parse
      expect(() => new Function(`return (${result})`)).not.toThrow();
    });

    // CC 2.1.212+ (verified on 2.1.212 and 2.1.214) refactored the reader to delegate
    // stat/isFile/size/readFile to a helper, adding an isDirectory() callback and
    // oversize telemetry. Shape (real minified names from the 2.1.214 bundle):
    //   let n=Yt(),o=!1,i=await Yq(n,e,Mlu,(s)=>{o=s.isDirectory()});
    //   if(i===null){ ...Be(...telemetry)... return{info:null,includePaths:[]} }
    //   return TAg(i,e,t,r)  ... catch(n){return CAg(n,e),{info:null,includePaths:[]}}
    // A missing CLAUDE.md throws ENOENT from the helper's stat() and lands in the
    // catch, so the reroute must be injected there (like the 2.1.199 matcher).
    const asyncReader214 =
      'async function Wlu(e,t,r){try{let n=Yt(),o=!1,i=await Yq(n,e,Mlu,(s)=>{o=s.isDirectory()});' +
      'if(i===null){if(T(`[CLAUDE.md] skipping ${e}: not a regular file or exceeds ${Mlu} byte limit`),!Nlu&&!o)Nlu=!0,Be("context_claude_md_load","file_skipped_special_or_oversize");return{info:null,includePaths:[]}}' +
      'return TAg(i,e,t,r)}catch(n){return CAg(n,e),{info:null,includePaths:[]}}}';

    it('handles the CC 2.1.214 helper-delegated async reader (reroute injected into catch)', () => {
      const result = writeAgentsMd(asyncReader214, altNames);
      expect(result).not.toBeNull();
      expect(result).toContain('async function Wlu(e,t,r,didReroute)');
      expect(result).toContain('endsWith("/CLAUDE.md")');
      expect(result).toContain('AGENTS.md');
      // recursion passes the extra params through + didReroute=true
      expect(result).toContain('await Wlu(altPath,t,r,true)');
      // original success + skip branches are preserved untouched
      expect(result).toContain('return TAg(i,e,t,r)');
      expect(result).toContain('if(i===null){');
      expect(result).toContain('o=s.isDirectory()');
      // reroute sits before the original error-handler return in the catch
      const catchIdx = result!.indexOf('catch(n){');
      const rerouteIdx = result!.indexOf('!didReroute', catchIdx);
      const errReturnIdx = result!.indexOf('return CAg(n,e)', catchIdx);
      expect(rerouteIdx).toBeGreaterThan(catchIdx);
      expect(rerouteIdx).toBeLessThan(errReturnIdx);
    });

    it('produces syntactically valid JS for the 2.1.214 reader (both branches parse)', () => {
      const result = writeAgentsMd(asyncReader214, altNames)!;
      expect(result).not.toBeNull();
      // The patched reader must parse (guards against the string-crash class).
      expect(() => new Function(`return (${result})`)).not.toThrow();
    });

    // Behavioral tests: actually EXECUTE the patched 2.1.214 reader against a stubbed
    // fs, mirroring the real reader/helper shape. `Yq` models the real helper exactly
    // (`await fs.stat(p)` — which throws ENOENT for a missing file, so the reroute in
    // the catch is the branch that fires). `TAg` returns a truthy `info` on success.
    interface FsStub {
      stat: (p: string) => Promise<{ isFile: () => boolean; size: number }>;
      readFile: (p: string) => Promise<string>;
    }
    type Reader = (
      p: string,
      t: string,
      r: string,
      didReroute?: boolean
    ) => Promise<{ info: unknown; includePaths: string[] }>;

    const buildPatchedReader = (fsStub: FsStub): Reader => {
      const patched = writeAgentsMd(asyncReader214, altNames)!;
      const body =
        'let Nlu=false;' +
        'const Mlu=1048576;' +
        'const T=()=>{};' +
        'const Be=()=>{};' +
        'const CAg=()=>{};' +
        'const TAg=(content,pathArg)=>({info:{content,path:pathArg},includePaths:[]});' +
        'const Yt=()=>fs;' +
        'async function Yq(fsObj,p,limit,cb){let st=await fsObj.stat(p);' +
        'if(!st.isFile()||st.size>limit){if(cb)cb(st);return null}' +
        'return await fsObj.readFile(p,{encoding:"utf8"})}' +
        patched +
        'return Wlu;';
      return new Function('fs', body)(fsStub) as Reader;
    };

    const enoent = () => {
      const e = new Error('ENOENT') as Error & { code: string };
      e.code = 'ENOENT';
      throw e;
    };

    it('reroutes to the first EXISTING alt when CLAUDE.md is missing (executes)', async () => {
      // CLAUDE.md and AGENTS.md missing, GEMINI.md present — proves the reroute fires,
      // slice(0,-9) builds the right path, and the load-bearing `if(_r.info)` check
      // skips the null AGENTS.md result and continues to GEMINI.md.
      const reader = buildPatchedReader({
        stat: async (p: string) =>
          p.endsWith('GEMINI.md') ? { isFile: () => true, size: 3 } : enoent(),
        readFile: async () => 'GEM',
      });
      const res = await reader('/proj/CLAUDE.md', 'ty', 'rt');
      expect(res.info).toEqual({ content: 'GEM', path: '/proj/GEMINI.md' });
    });

    it('returns null and terminates when CLAUDE.md and all alts are missing (no infinite recursion)', async () => {
      const reader = buildPatchedReader({
        stat: async () => enoent(),
        readFile: async () => '',
      });
      const res = await reader('/proj/CLAUDE.md', 'ty', 'rt');
      expect(res.info).toBeNull();
      expect(res.includePaths).toEqual([]);
    });

    it('does NOT reroute when the missing file is not CLAUDE.md', async () => {
      const statCalls: string[] = [];
      const reader = buildPatchedReader({
        stat: async (p: string) => {
          statCalls.push(p);
          return enoent();
        },
        readFile: async () => '',
      });
      const res = await reader('/proj/OTHER.md', 'ty', 'rt');
      expect(res.info).toBeNull();
      // no alt filename was ever probed
      expect(statCalls).toEqual(['/proj/OTHER.md']);
    });

    it('returns CLAUDE.md content untouched when it exists (no reroute)', async () => {
      const statCalls: string[] = [];
      const reader = buildPatchedReader({
        stat: async (p: string) => {
          statCalls.push(p);
          return { isFile: () => true, size: 3 };
        },
        readFile: async () => 'CLA',
      });
      const res = await reader('/proj/CLAUDE.md', 'ty', 'rt');
      expect(res.info).toEqual({ content: 'CLA', path: '/proj/CLAUDE.md' });
      expect(statCalls).toEqual(['/proj/CLAUDE.md']);
    });
  });
});
