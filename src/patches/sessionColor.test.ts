import { describe, it, expect } from 'vitest';
import { writeSessionColor } from './sessionColor';

const makeCLIState = () =>
  'effortValue:oR(w.effort),' +
  'activeOverlays:new Set,fastMode:cP8(N5),' +
  '...(uF()&&d1&&{advisorModel:d1})';

const makeDefaultState = () =>
  'effortValue:void 0,' + 'activeOverlays:new Set,fastMode:!1}';

const makeBoth = () =>
  'first{' + makeDefaultState() + 'second{' + makeCLIState();

describe('sessionColor', () => {
  describe('writeSessionColor', () => {
    it('should inject into CLI initialState', () => {
      const result = writeSessionColor(makeCLIState());
      expect(result).not.toBeNull();
      expect(result).toContain('TWEAKCC_SESSION_COLOR');
      expect(result).toContain('{name:"",color:__c}');
    });

    it('should inject into default app state', () => {
      const result = writeSessionColor(makeDefaultState());
      expect(result).not.toBeNull();
      expect(result).toContain('TWEAKCC_SESSION_COLOR');
    });

    it('should patch both locations when both present', () => {
      const result = writeSessionColor(makeBoth())!;
      expect(result).not.toBeNull();
      const count = (result.match(/TWEAKCC_SESSION_COLOR/g) || []).length;
      expect(count).toBe(2);
    });

    it('should validate color against allowed list', () => {
      const result = writeSessionColor(makeCLIState())!;
      expect(result).toContain('.includes(__c)');
      expect(result).toContain('"green"');
      expect(result).toContain('"cyan"');
    });

    it('should be idempotent', () => {
      const first = writeSessionColor(makeBoth())!;
      const second = writeSessionColor(first)!;
      expect(second).toBe(first);
    });

    it('should return null when no pattern found', () => {
      const result = writeSessionColor('not a valid file');
      expect(result).toBeNull();
    });
  });
});
