import { describe, expect, it, vi } from 'vitest';

import { writeTitleVisibilityToggle } from './titleVisibility';

const cmds = Array.from({ length: 32 }, (_, i) => `c${i}`).join(',');
const MOCK_SLASH_COMMANDS = `var commands=()=>[${cmds}]`;

const MOCK_NAME_EXTRACT =
  'function Yy9(_){if(_$())return;return _.standaloneAgentContext?.name}';

const buildMockFile = (opts?: { noNameExtract?: boolean }) => {
  return (
    MOCK_SLASH_COMMANDS +
    (opts?.noNameExtract ? '' : MOCK_NAME_EXTRACT)
  );
};

describe('titleVisibility', () => {
  it('applies all steps successfully', () => {
    const file = buildMockFile();
    const result = writeTitleVisibilityToggle(file);

    expect(result).not.toBeNull();
    expect(result).toContain('let TWEAKCC_HIDE_TITLE=!1;');
    expect(result).toContain('name: "session-title"');
    expect(result).toContain('if(TWEAKCC_HIDE_TITLE)return;');
  });

  it('adds the /session-title slash command', () => {
    const file = buildMockFile();
    const result = writeTitleVisibilityToggle(file);

    expect(result).not.toBeNull();
    expect(result).toContain('name: "session-title"');
  });

  it('declares the TWEAKCC_HIDE_TITLE variable', () => {
    const file = buildMockFile();
    const result = writeTitleVisibilityToggle(file);

    expect(result).not.toBeNull();
    expect(result).toContain('let TWEAKCC_HIDE_TITLE=!1;');
  });

  it('adds hide title check to name extract function', () => {
    const file = buildMockFile();
    const result = writeTitleVisibilityToggle(file);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'if(TWEAKCC_HIDE_TITLE)return;return _.standaloneAgentContext?.name'
    );
  });

  it('returns null when name extract function is missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = buildMockFile({ noNameExtract: true });
    const result = writeTitleVisibilityToggle(file);

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
