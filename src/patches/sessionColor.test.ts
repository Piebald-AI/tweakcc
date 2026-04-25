import { describe, it, expect } from 'vitest';
import { writeSessionColor, patchSaveAgentColor } from './sessionColor';

const makeSaveAgentColor = () =>
  ';async function Mr$(H,$,q){let K=q??sT(H);' +
  'if(Hv(K,{type:"agent-color",agentColor:$,sessionId:H}),H===V$())' +
  'WA().currentSessionAgentColor=$;c("tengu_agent_color_set",{})}';

const makeCLIState = () =>
  'effortValue:oR(w.effort),' +
  'activeOverlays:new Set,fastMode:cP8(N5),' +
  '...(uF()&&d1&&{advisorModel:d1})';

const makeDefaultState = () =>
  'effortValue:void 0,' + 'activeOverlays:new Set,fastMode:!1}';

const makeBoth = () =>
  'first{' + makeDefaultState() + 'second{' + makeCLIState();

const makeFullFile = () => makeBoth() + makeSaveAgentColor();

describe('sessionColor', () => {
  describe('writeSessionColor', () => {
    it('should inject into CLI initialState and patch saveAgentColor', () => {
      const result = writeSessionColor(makeFullFile());
      expect(result).not.toBeNull();
      expect(result).toContain('TWEAKCC_SESSION_COLOR');
      expect(result).toContain('{name:"",color:__c}');
      expect(result).toContain('__tweakccSaveAgentColor');
    });

    it('should inject into default app state', () => {
      const input = makeDefaultState() + makeSaveAgentColor();
      const result = writeSessionColor(input);
      expect(result).not.toBeNull();
      expect(result).toContain('TWEAKCC_SESSION_COLOR');
    });

    it('should patch both initialState locations', () => {
      const result = writeSessionColor(makeFullFile())!;
      expect(result).not.toBeNull();
      const count = (result.match(/TWEAKCC_SESSION_COLOR/g) || []).length;
      expect(count).toBe(2);
    });

    it('should validate color against allowed list', () => {
      const result = writeSessionColor(makeFullFile())!;
      expect(result).toContain('.includes(__c)');
      expect(result).toContain('"green"');
      expect(result).toContain('"cyan"');
    });

    it('should be idempotent', () => {
      const first = writeSessionColor(makeFullFile())!;
      const second = writeSessionColor(first)!;
      expect(second).toBe(first);
    });

    it('should return null when no pattern found', () => {
      const result = writeSessionColor('not a valid file');
      expect(result).toBeNull();
    });

    it('should schedule color save via queueMicrotask', () => {
      const result = writeSessionColor(makeFullFile())!;
      expect(result).toContain('queueMicrotask');
      expect(result).toContain('__tweakccSaveAgentColor');
    });

    it('should expose saveAgentColor on globalThis', () => {
      const result = writeSessionColor(makeFullFile())!;
      expect(result).toContain(
        'globalThis.__tweakccSaveAgentColor=(c)=>Mr$(V$(),c)'
      );
    });
  });

  describe('patchSaveAgentColor', () => {
    it('should find and patch saveAgentColor', () => {
      const result = patchSaveAgentColor(makeSaveAgentColor());
      expect(result).not.toBeNull();
      expect(result).toContain('globalThis.__tweakccSaveAgentColor');
    });

    it('should return null when pattern not found', () => {
      const result = patchSaveAgentColor('no match here');
      expect(result).toBeNull();
    });

    it('should preserve original function', () => {
      const result = patchSaveAgentColor(makeSaveAgentColor())!;
      expect(result).toContain('async function Mr$');
      expect(result).toContain('type:"agent-color"');
    });
  });
});
