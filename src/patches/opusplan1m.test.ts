import { describe, expect, it } from 'vitest';
import { writeOpusplan1m } from './opusplan1m';

describe('opusplan1m.ts', () => {
  // Mock CLI content that simulates the structure we're patching
  const mockCliContent = `
    function K8A() { return "opusplan"; }
    function q8A() { return "opus-model"; }
    function jk() { return "sonnet-model"; }
    
    function bF(A) {
      let { permissionMode: K, mainLoopModel: q, exceeds200kTokens: Y = !1 } = A;
      if (K8A() === "opusplan" && K === "plan" && !Y) return q8A();
      if (K8A() === "haiku" && K === "plan") return jk();
      return q;
    }
    
    function Zm3(A) {
      if (A === "opusplan") return "Opus 4.5 in plan mode, else Sonnet 4.5";
      return "other";
    }
    
    function Tq4(A) {
      if (A === "opusplan") return "Opus Plan";
      if (h16(A)) return A.charAt(0).toUpperCase() + A.slice(1);
      return sj(A);
    }
    
    function getOptions(K) {
      if (K === "opusplan") return [...A, Mm3()];
      return A;
    }
    
    var k0A = ["sonnet", "opus", "haiku", "sonnet[1m]", "opusplan"];
  `;

  it('should patch the mode switching function to handle opusplan[1m]', () => {
    const result = writeOpusplan1m(mockCliContent);
    expect(result).not.toBeNull();
    expect(result).toContain('K8A()==="opusplan"||K8A()==="opusplan[1m]"');
  });

  it('should add opusplan[1m] to the model aliases list', () => {
    const result = writeOpusplan1m(mockCliContent);
    expect(result).not.toBeNull();
    expect(result).toContain('"opusplan[1m]"');
    expect(result).toContain(
      '["sonnet","opus","haiku","sonnet[1m]","opusplan","opusplan[1m]"]'
    );
  });

  it('should add opusplan[1m] case to description function', () => {
    const result = writeOpusplan1m(mockCliContent);
    expect(result).not.toBeNull();
    expect(result).toContain(
      'if(A==="opusplan[1m]")return"Opus 4.5 in plan mode, else Sonnet 4.5 (1M context)"'
    );
  });

  it('should add opusplan[1m] case to label function', () => {
    const result = writeOpusplan1m(mockCliContent);
    expect(result).not.toBeNull();
    expect(result).toContain('if(A==="opusplan[1m]")return"Opus Plan 1M"');
  });

  it('should add opusplan[1m] case to model selector', () => {
    const result = writeOpusplan1m(mockCliContent);
    expect(result).not.toBeNull();
    expect(result).toContain(
      'if(K==="opusplan[1m]")return[...A,{value:"opusplan[1m]"'
    );
  });

  it('should preserve original opusplan functionality', () => {
    const result = writeOpusplan1m(mockCliContent);
    expect(result).not.toBeNull();
    // Original opusplan checks should still exist
    expect(result).toContain('K8A()==="opusplan"');
    expect(result).toContain('A === "opusplan"');
    expect(result).toContain('K === "opusplan"');
  });
});
