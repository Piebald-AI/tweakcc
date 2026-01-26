import { describe, it, expect } from 'vitest';
import {
  detectSwarmModeState,
  writeSwarmMode,
  getSwarmGateInfo,
} from './swarmMode';

describe('swarmMode patch', () => {
  // Realistic gate function pattern from Claude Code 2.1.17
  const UNPATCHED_GATE = `function i8(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return xK("tengu_brass_pebble",!1)}`;

  // Simulated CLI content with the gate function
  const makeCliContent = (gate: string) =>
    `var someCode=123;${gate}var moreCode=456;function teammate(){return i8()&&doStuff()}`;

  describe('detectSwarmModeState', () => {
    it('returns disabled when unpatched gate function is found', () => {
      const content = makeCliContent(UNPATCHED_GATE);
      expect(detectSwarmModeState(content)).toBe('disabled');
    });

    it('returns unknown when no marker is found', () => {
      const content = 'function foo(){return!0}var bar=123;';
      expect(detectSwarmModeState(content)).toBe('unknown');
    });

    it('returns unknown when marker exists but no gate function pattern', () => {
      // Has the marker string but not the full gate function pattern
      const content = 'var x="tengu_brass_pebble";function foo(){return!1}';
      expect(detectSwarmModeState(content)).toBe('unknown');
    });

    it('returns enabled when swarm code exists but marker is gone', () => {
      // Swarm-related code but no tengu_brass_pebble marker
      const content =
        'function foo(){return!0}var TeammateTool={};var bar=123;';
      expect(detectSwarmModeState(content)).toBe('enabled');
    });
  });

  describe('writeSwarmMode', () => {
    it('patches the gate function to return true', () => {
      const content = makeCliContent(UNPATCHED_GATE);
      const result = writeSwarmMode(content);

      expect(result).not.toBeNull();
      expect(result).toContain('function i8(){return!0}');
      expect(result).not.toContain('tengu_brass_pebble');
    });

    it('returns null when already patched (marker gone)', () => {
      // Content with TeammateTool (indicates swarm feature present) but no gate
      const content =
        'function foo(){return!0}var TeammateTool={};var bar=123;';
      const result = writeSwarmMode(content);

      expect(result).toBeNull();
    });

    it('returns null when gate not found and no swarm features', () => {
      const content = 'function foo(){return!0}var bar=123;';
      const result = writeSwarmMode(content);

      expect(result).toBeNull();
    });

    it('handles different function names', () => {
      const gateWithDifferentName = `function xY7(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return xK("tengu_brass_pebble",!1)}`;
      const content = `var a=1;${gateWithDifferentName}var b=2;`;
      const result = writeSwarmMode(content);

      expect(result).not.toBeNull();
      expect(result).toContain('function xY7(){return!0}');
    });

    it('handles function names with $ character', () => {
      const gateWithDollar = `function $8(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return xK("tengu_brass_pebble",!1)}`;
      const content = `var a=1;${gateWithDollar}var b=2;`;
      const result = writeSwarmMode(content);

      expect(result).not.toBeNull();
      expect(result).toContain('function $8(){return!0}');
    });

    it('preserves surrounding code', () => {
      const content = makeCliContent(UNPATCHED_GATE);
      const result = writeSwarmMode(content);

      expect(result).not.toBeNull();
      expect(result).toContain('var someCode=123;');
      expect(result).toContain('var moreCode=456;');
      expect(result).toContain('function teammate(){return i8()&&doStuff()}');
    });
  });

  describe('getSwarmGateInfo', () => {
    it('returns gate info when found', () => {
      const content = makeCliContent(UNPATCHED_GATE);
      const info = getSwarmGateInfo(content);

      expect(info.found).toBe(true);
      expect(info.fnName).toBe('i8');
      expect(info.state).toBe('disabled');
    });

    it('returns not found when gate is missing', () => {
      const content = 'function foo(){return!0}';
      const info = getSwarmGateInfo(content);

      expect(info.found).toBe(false);
      expect(info.state).toBe('unknown');
    });

    it('returns correct function name for different names', () => {
      const gateWithDifferentName = `function abc123(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return xK("tengu_brass_pebble",!1)}`;
      const content = `var a=1;${gateWithDifferentName}var b=2;`;
      const info = getSwarmGateInfo(content);

      expect(info.found).toBe(true);
      expect(info.fnName).toBe('abc123');
      expect(info.state).toBe('disabled');
    });
  });

  describe('real CLI content patterns', () => {
    it('handles whitespace variations in gate function', () => {
      // Sometimes minifiers add/remove whitespace differently
      const gateWithSpace = `function i8(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return xK("tengu_brass_pebble",!1)}`;
      const content = makeCliContent(gateWithSpace);
      const result = writeSwarmMode(content);

      expect(result).not.toBeNull();
      expect(result).toContain('function i8(){return!0}');
    });

    it('handles different helper function names', () => {
      // Different minified names for the helper functions (Yz, xK)
      const gateWithDifferentHelpers = `function i8(){if(aB(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return cD("tengu_brass_pebble",!1)}`;
      const content = `var a=1;${gateWithDifferentHelpers}var b=2;`;
      const result = writeSwarmMode(content);

      expect(result).not.toBeNull();
      expect(result).toContain('function i8(){return!0}');
    });
  });
});
