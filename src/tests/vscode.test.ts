import { expect, describe, it, beforeEach } from 'vitest';
import { detectClaudeCodeExtensions } from '@/vscode/extensionDetection';
import {
  patchThinkingVerbs,
  patchConversationTitle,
  patchTableFormat,
  EXTENSION_PATCH_DEFINITIONS,
} from '@/vscode/patches';
import { TweakccConfig } from '@/types';

describe('VS Code Extension Detection', () => {
  beforeEach(() => {
    const _mockConfig = {
      ccVersion: '2.1.34',
      lastModified: new Date().toISOString(),
      changesApplied: [],
      settings: {
        systemPrompt: { enabled: true, content: 'Custom system prompt' },
        thinkingVerbs: {
          enabled: true,
          format: '{}...',
          verbs: ['Thinking', 'Baking', 'Crafting'],
        },
        thinkingStyle: {
          enabled: true,
          visibility: 'default',
          phases: ['🤔', '⚡', '✨'],
          speed: 200,
        },
        tableConfig: {
          enabled: true,
          width: 120,
          format: 'pretty',
          color: true,
        },
        miscConfig: {
          enableConversationTitle: true,
          hideStartupBanner: false,
          hideCtrlGToEdit: false,
          hideStartupClawd: false,
          removeNewSessionShortcut: false,
        },
      },
    } as unknown as TweakccConfig;
  });

  it('should detect VS Code extensions', async () => {
    const extensions = await detectClaudeCodeExtensions();
    expect(Array.isArray(extensions)).toBe(true);
  });
});

describe('Extension Patches', () => {
  const createMockConfig = (settings: unknown): TweakccConfig => ({
    ccVersion: '1.0.0',
    lastModified: new Date().toISOString(),
    changesApplied: false,
    settings: settings as unknown as TweakccConfig['settings'],
  });

  it('should register patches', () => {
    expect(EXTENSION_PATCH_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('should patch thinking verbs in webview.js', () => {
    const mockConfig = createMockConfig({
      thinkingVerbs: {
        enabled: true,
        format: '{}…',
        verbs: ['Baking', 'Fermenting', 'Noodling'],
      },
    });

    const mockContent = 'const thinkingVerb = "Thinking…";';
    const patched = patchThinkingVerbs(mockContent, mockConfig);

    expect(patched).not.toBe(mockContent);
    expect(patched).not.toContain('Thinking…');
    const hasCustomVerb = ['Baking', 'Fermenting', 'Noodling'].some(v =>
      patched.includes(v)
    );
    expect(hasCustomVerb).toBe(true);
  });

  it('should inject /title command if missing', () => {
    const mockConfig = createMockConfig({
      misc: {
        enableConversationTitle: true,
      },
    });

    const mockContent = `
vscode.commands.registerCommand('claudeCode.open', () => {});
`;

    const patched = patchConversationTitle(mockContent, mockConfig);

    expect(patched).toContain('claudeCode.title');
    expect(patched).toContain('registerCommand');
  });

  it('should not inject /title command if present', () => {
    const mockConfig = createMockConfig({
      misc: {
        enableConversationTitle: true,
      },
    });

    const mockContent = `vscode.commands.registerCommand('claudeCode.title', () => {})`;
    const patched = patchConversationTitle(mockContent, mockConfig);

    expect(patched).toEqual(mockContent);
  });

  it('should patch table format', () => {
    const mockConfig = createMockConfig({
      misc: {
        tableFormat: 'ascii',
      },
    });

    const mockContent =
      'tableBorder:"│",rowSeparator:true,topBottomBorder:true';
    const patched = patchTableFormat(mockContent, mockConfig);

    expect(patched).toContain('tableBorder:"|"');
    expect(patched).toContain('rowSeparator:false');
    expect(patched).toContain('topBottomBorder:false');
  });

  it('should not modify content if pattern not found', () => {
    const mockConfig = createMockConfig({
      misc: {
        tableFormat: 'ascii',
      },
    });

    const mockContent = 'const someOtherVar = "Hello World";';
    const patched = patchTableFormat(mockContent, mockConfig);

    expect(patched).toEqual(mockContent);
  });

  it('should patch table format with clean borders', () => {
    const mockConfig = createMockConfig({
      misc: {
        tableFormat: 'clean',
      },
    });

    const mockContent =
      'tableBorder:"│",rowSeparator:true,topBottomBorder:true';
    const patched = patchTableFormat(mockContent, mockConfig);

    expect(patched).toContain('tableBorder:"│"');
    expect(patched).toContain('rowSeparator:false');
    expect(patched).toContain('topBottomBorder:false');
  });

  it('should not modify content if pattern not found', () => {
    const mockConfig = createMockConfig({
      thinkingVerbs: {
        enabled: true,
        format: '{}…',
        verbs: ['Baking', 'Fermenting', 'Noodling'],
      },
    });

    const mockContent = 'const someOtherVar = "Hello World";';
    const patched = patchThinkingVerbs(mockContent, mockConfig);

    expect(patched).toEqual(mockContent);
  });
});
