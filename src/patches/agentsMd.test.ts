import { describe, it, expect } from 'vitest';
import { writeAgentsMd } from './agentsMd';

const altNames = ['AGENTS.md', 'GEMINI.md', 'QWEN.md'];

// CC ≤2.1.69: single function with existsSync/isFile and "Skipping non-text file"
const legacyMockFunction =
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

// CC ≥2.1.80: separate sync reader, async reader, content processor, error handler
const newSyncReader =
  'function Rx9(A,q){try{let _=w8().readFileSync(A,{encoding:"utf-8"});return U94(_,A,q)}catch(K){return Q94(K,A),null}}';

const newAsyncReader =
  'async function BE1(A,q){try{let _=await w8().readFile(A,{encoding:"utf-8"});return U94(_,A,q)}catch(K){return Q94(K,A),null}}';

const newMockFunction = newSyncReader + newAsyncReader;

describe('agentsMd', () => {
  describe('writeAgentsMd - new pattern (CC ≥2.1.80)', () => {
    it('should patch both sync and async reader functions', () => {
      const result = writeAgentsMd(newMockFunction, altNames);
      expect(result).not.toBeNull();
      expect(result).toContain('didReroute');
      expect(result).toContain('endsWith("/CLAUDE.md")');
      expect(result).toContain('AGENTS.md');
    });

    it('should add didReroute parameter to sync function signature', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      expect(result).toContain('function Rx9(A,q,didReroute)');
    });

    it('should add didReroute parameter to async function signature', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      expect(result).toContain('async function BE1(A,q,didReroute)');
    });

    it('should check ENOENT error code in sync fallback', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      const syncPart = result.slice(0, result.indexOf('async function'));
      expect(syncPart).toContain('K.code==="ENOENT"');
    });

    it('should check ENOENT error code in async fallback', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      const asyncPart = result.slice(result.indexOf('async function'));
      expect(asyncPart).toContain('K.code==="ENOENT"');
    });

    it('should pass didReroute=true in sync recursive calls', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      const syncPart = result.slice(0, result.indexOf('async function'));
      expect(syncPart).toContain('Rx9(altPath,q,true)');
    });

    it('should use await in async recursive calls', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      const asyncPart = result.slice(result.indexOf('async function'));
      expect(asyncPart).toContain('await BE1(altPath,q,true)');
    });

    it('should preserve error handler call', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      expect(result).toContain('return Q94(K,A),null');
    });

    it('should preserve content processor call', () => {
      const result = writeAgentsMd(newMockFunction, altNames)!;
      expect(result).toContain('return U94(_,A,q)');
    });
  });

  describe('writeAgentsMd - legacy pattern (CC ≤2.1.69)', () => {
    it('should inject fallback at early return null when CLAUDE.md is missing', () => {
      const result = writeAgentsMd(legacyMockFunction, altNames);
      expect(result).not.toBeNull();
      expect(result).toContain('didReroute');
      expect(result).toContain('endsWith("/CLAUDE.md")');
      expect(result).toContain('AGENTS.md');
      expect(result).toMatch(/\.isFile\(\)\)\{.*?return null;\}/);
    });

    it('should preserve CLAUDE.md content when present', () => {
      const result = writeAgentsMd(legacyMockFunction, altNames)!;
      const returnIdx = result.indexOf('return{path:');
      expect(returnIdx).toBeGreaterThan(-1);
      const beforeReturn = result.slice(
        Math.max(0, returnIdx - 50),
        returnIdx
      );
      expect(beforeReturn).not.toContain('didReroute');
    });

    it('should pass didReroute=true in recursive calls', () => {
      const result = writeAgentsMd(legacyMockFunction, altNames)!;
      expect(result).toContain('return _t7(altPath,q,true)');
    });

    it('should return null when no alternatives are found', () => {
      const result = writeAgentsMd(legacyMockFunction, altNames)!;
      expect(result).toMatch(/\}return null;\}/);
    });

    it('should add didReroute parameter to function signature', () => {
      const result = writeAgentsMd(legacyMockFunction, altNames)!;
      expect(result).toContain('function _t7(A,q,didReroute)');
    });

    it('should use the correct fs expression', () => {
      const result = writeAgentsMd(legacyMockFunction, altNames)!;
      expect(result).toContain('K.existsSync(altPath)');
      expect(result).toContain('K.statSync(altPath)');
    });
  });

  describe('writeAgentsMd - error cases', () => {
    it('should return null when no pattern matches', () => {
      const result = writeAgentsMd('not a valid file', altNames);
      expect(result).toBeNull();
    });
  });
});
