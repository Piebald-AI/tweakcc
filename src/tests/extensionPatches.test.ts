import { describe, it, expect } from 'vitest';

import {
  patchThinkingVerbs,
  patchRemoveThinkingSpinner,
  patchExpandThinkingBlocks,
  patchConversationTitle,
  patchRemoveNewSessionShortcut,
  patchTableFormat,
  patchSwarmMode,
  patchTokenCountRounding,
} from '@/vscode/patches';
import { TweakccConfig } from '@/types';

describe('VS Code Extension Patches', () => {
  const createMockConfig = (settings: unknown): TweakccConfig => ({
    ccVersion: '1.0.0',
    lastModified: new Date().toISOString(),
    changesApplied: false,
    settings: settings as unknown as TweakccConfig['settings'],
  });

  describe('patchThinkingVerbs', () => {
    it('should replace default thinking verb', () => {
      const content = 'const verb = "Thinking…";';
      const config = createMockConfig({
        thinkingVerbs: {
          enabled: true,
          format: '{}',
          verbs: ['Baking', 'Cooking', 'Preparing'],
        },
      });

      const result = patchThinkingVerbs(content, config);
      expect(result).toMatch(/(Baking|Cooking|Preparing)/);
    });

    it('should not patch if disabled or no verbs', () => {
      const content = 'const verb = "Thinking…";';
      const config = createMockConfig({
        thinkingVerbs: {
          enabled: false,
          format: '{}',
          verbs: ['Baking'],
        },
      });

      const result = patchThinkingVerbs(content, config);
      expect(result).toBe(content);
    });
  });

  describe('patchRemoveThinkingSpinner', () => {
    it('should remove spinner emoji if hideSpinner is true', () => {
      const content = 'const spinner = "⏳";';
      const config = createMockConfig({
        thinkingStyle: {
          hideSpinner: true,
          phases: [],
          updateInterval: 100,
          reverseMirror: false,
        },
      });

      const result = patchRemoveThinkingSpinner(content, config);
      expect(result).toBe('const spinner = "";');
    });

    it('should not patch if hideSpinner is false', () => {
      const content = 'const spinner = "⏳";';
      const config = createMockConfig({
        thinkingStyle: {
          hideSpinner: false,
          phases: [],
          updateInterval: 100,
          reverseMirror: false,
        },
      });

      const result = patchRemoveThinkingSpinner(content, config);
      expect(result).toBe(content);
    });
  });

  describe('patchExpandThinkingBlocks', () => {
    it('should change collapsed state to expanded', () => {
      const content = 'expanded:false';
      const config = createMockConfig({
        misc: {
          expandThinkingBlocks: true,
        },
      });
      const result = patchExpandThinkingBlocks(content, config);
      expect(result).toBe('expanded:true');
    });

    it('should not modify already expanded state', () => {
      const content = 'expanded:true';
      const config = createMockConfig({
        misc: {
          expandThinkingBlocks: true,
        },
      });
      const result = patchExpandThinkingBlocks(content, config);
      expect(result).toBe('expanded:true');
    });
  });

  describe('patchConversationTitle', () => {
    it('should inject /title command if not present', () => {
      const content = 'vscode.commands.registerCommand("test", () => {});';
      const config = createMockConfig({
        misc: {
          enableConversationTitle: true,
        },
      });
      const result = patchConversationTitle(content, config);
      expect(result).toContain('claudeCode.title');
      expect(result).toContain('showInputBox');
    });

    it('should not inject if /title already exists', () => {
      const content =
        'vscode.commands.registerCommand("claudeCode.title", () => {});';
      const config = createMockConfig({
        misc: {
          enableConversationTitle: true,
        },
      });
      const result = patchConversationTitle(content, config);
      expect(result).toBe(content);
    });
  });

  describe('patchRemoveNewSessionShortcut', () => {
    it('should replace Cmd+K shortcut', () => {
      const content = 'const shortcut = "Cmd+K";';
      const config = createMockConfig({
        misc: {
          removeNewSessionShortcut: true,
        },
      });
      const result = patchRemoveNewSessionShortcut(content, config);
      expect(result).toContain('Cmd+Shift+T');
    });

    it('should replace Ctrl+K shortcut', () => {
      const content = 'const shortcut = "Ctrl+K";';
      const config = createMockConfig({
        misc: {
          removeNewSessionShortcut: true,
        },
      });
      const result = patchRemoveNewSessionShortcut(content, config);
      expect(result).toContain('Cmd+Shift+T');
    });
  });

  describe('patchTableFormat', () => {
    it('should apply ascii format', () => {
      const content = 'tableBorder:"│",rowSeparator:true,topBottomBorder:true';
      const config = createMockConfig({
        misc: {
          tableFormat: 'ascii',
        },
      });

      const result = patchTableFormat(content, config);
      expect(result).toContain('tableBorder:"|"');
      expect(result).toContain('rowSeparator:false');
      expect(result).toContain('topBottomBorder:false');
    });

    it('should apply clean format', () => {
      const content = 'tableBorder:"│",rowSeparator:true,topBottomBorder:true';
      const config = createMockConfig({
        misc: {
          tableFormat: 'clean',
        },
      });

      const result = patchTableFormat(content, config);
      expect(result).toContain('rowSeparator:false');
      expect(result).toContain('topBottomBorder:false');
    });
  });

  describe('patchSwarmMode', () => {
    it('should enable swarm mode', () => {
      const content = 'tengu_brass_pebble:false';
      const config = createMockConfig({
        misc: {
          enableSwarmMode: true,
        },
      });
      const result = patchSwarmMode(content, config);
      expect(result).toBe('tengu_brass_pebble:true');
    });
  });

  describe('patchTokenCountRounding', () => {
    it('should apply token count rounding', () => {
      const content = 'tokenCountRounding:1000';
      const config = createMockConfig({
        misc: {
          tokenCountRounding: 500,
        },
      });

      const result = patchTokenCountRounding(content, config);
      expect(result).toContain('tokenCountRounding:500');
    });

    it('should not patch if tokenCountRounding is not set', () => {
      const content = 'tokenCountRounding:1000';
      const config = createMockConfig({});

      const result = patchTokenCountRounding(content, config);
      expect(result).toBe(content);
    });
  });
});
