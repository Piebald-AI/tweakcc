import { describe, it, expect } from 'vitest';
import { writeAllowCustomAgentModels } from './allowCustomAgentModels';

// CC 2.1.69 style - realistic mock based on actual extracted JS
// Patch 1 target: ,model:u.enum(oEH).optional()
// Patch 2 target: ");let J=K&&typeof K==="string"&&oEH.includes(K)
const mockContent69 =
  'prompt:u.string().min(1,"Prompt cannot be empty"),' +
  'model:u.enum(oEH).optional(),' +
  'effort:u.union([u.enum($OH),u.number().int()]).optional()' +
  "console.warn(`Agent file ${H} has invalid isolation value '${Y}'. " +
  'Valid options: ${z.join(", ")}`);' +
  'let J=K&&typeof K==="string"&&oEH.includes(K);' +
  'if(K&&typeof K==="string"&&!J){' +
  'let $H=`Agent file ${H} has invalid model`}' +
  'return{...obj,...J?{model:K}:{}}';

// CC 2.1.70 style - different minified variable names
const mockContent70 =
  'prompt:u.string().min(1,"Prompt cannot be empty"),' +
  'model:u.enum(yjH).optional(),' +
  'effort:u.union([u.enum(WOH),u.number().int()]).optional()' +
  "console.warn(`Agent file ${H} has invalid isolation value '${Y}'. " +
  'Valid options: ${z.join(", ")}`);' +
  'let X=K&&typeof K==="string"&&yjH.includes(K);' +
  'if(K&&typeof K==="string"&&!X){' +
  'let s=`Agent file ${H} has invalid model`}' +
  'return{...obj,...X?{model:K}:{}}';

// Mock with } boundary (original patch expected this)
const mockContentBraces =
  'let A=x1();' +
  '{description:M,color:K,model:x.enum(hWH).optional(),' +
  'background:x.string().optional()}' +
  'let E=A.model;' +
  '}let _=E&&typeof E==="string"&&hWH.includes(E);' +
  'return{...obj,..._?{model:E}:{}}';

// FALSE POSITIVE SCENARIO: a structurally similar pattern using a DIFFERENT
// array variable appears BEFORE the real model validation pattern.
// With the unfixed regex, String.match() would grab the first match
// (otherArr), missing the real target (oEH).
const mockWithFalsePositiveBefore =
  'someSetup();' +
  ';let $c=F&&typeof F==="string"&&otherArr.includes(F);' +
  'someMoreCode();' +
  'prompt:u.string().min(1,"Prompt cannot be empty"),' +
  'model:u.enum(oEH).optional(),' +
  'effort:u.union([u.enum($OH),u.number().int()]).optional()' +
  'console.warn(`done`);' +
  'let J=K&&typeof K==="string"&&oEH.includes(K);' +
  'return{...obj,...J?{model:K}:{}}';

// Only Zod pattern, validation missing
const mockOnlyZod =
  'prompt:u.string(),' +
  'model:u.enum(oEH).optional(),' +
  'effort:u.string().optional()';

// Only validation pattern, Zod missing
const mockOnlyValidation =
  'let E=A.model;' +
  ';let _=E&&typeof E==="string"&&oEH.includes(E);' +
  'return{...obj,..._?{model:E}:{}}';

describe('allowCustomAgentModels', () => {
  describe('writeAllowCustomAgentModels', () => {
    it('should replace Zod enum with string (CC 2.1.69)', () => {
      const result = writeAllowCustomAgentModels(mockContent69);
      expect(result).not.toBeNull();
      expect(result).toContain('model:u.string().optional()');
      expect(result).not.toContain('enum(oEH)');
    });

    it('should remove includes check from validation flag (CC 2.1.69)', () => {
      const result = writeAllowCustomAgentModels(mockContent69);
      expect(result).not.toBeNull();
      expect(result).toContain(';let J=K&&typeof K==="string"');
      expect(result).not.toContain('oEH.includes(K)');
    });

    it('should preserve the ternary model injection', () => {
      const result = writeAllowCustomAgentModels(mockContent69)!;
      expect(result).toContain('J?{model:K}:{}');
    });

    it('should work with CC 2.1.70 variable names', () => {
      const result = writeAllowCustomAgentModels(mockContent70);
      expect(result).not.toBeNull();
      expect(result).toContain('model:u.string().optional()');
      expect(result).not.toContain('enum(yjH)');
      expect(result).not.toContain('yjH.includes(K)');
    });

    it('should handle } boundary character before let', () => {
      const result = writeAllowCustomAgentModels(mockContentBraces);
      expect(result).not.toBeNull();
      expect(result).toContain('}let _=E&&typeof E==="string"');
      expect(result).not.toContain('hWH.includes(E)');
    });

    it('should return null when no patterns found', () => {
      const result = writeAllowCustomAgentModels(
        'totally unrelated code with no patterns'
      );
      expect(result).toBeNull();
    });

    it('should return null when only Zod pattern found', () => {
      const result = writeAllowCustomAgentModels(mockOnlyZod);
      expect(result).toBeNull();
    });

    it('should return null when only validation pattern found', () => {
      const result = writeAllowCustomAgentModels(mockOnlyValidation);
      expect(result).toBeNull();
    });

    it('should not match a false positive with different array variable', () => {
      const result = writeAllowCustomAgentModels(mockWithFalsePositiveBefore);
      expect(result).not.toBeNull();
      // The otherArr pattern must be left untouched
      expect(result).toContain('otherArr.includes(F)');
      // The real oEH pattern must be modified
      expect(result).not.toContain('oEH.includes(K)');
      // Zod pattern must also be modified
      expect(result).toContain('model:u.string().optional()');
    });
  });
});
