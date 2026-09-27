import { describe, it, expect } from 'vitest';
import { writeSubagentModels } from './subagentModels';
import { SubagentModelsConfig } from '../types';

const EMPTY: SubagentModelsConfig = {
  plan: null,
  explore: null,
  generalPurpose: null,
  claudeCodeGuide: null,
  statuslineSetup: null,
};

// CC 2.1.283 style - the agent type is hoisted into a constant
const guideMock =
  'm7n="https://claude.com/docs/claude-tag/overview.md",b_r="claude-code-guide";' +
  'function g7n(){return`You are the Claude guide`}' +
  'var Y7n={agentType:b_r,whenToUse:`Use this agent when the user asks questions ("Can Claude...") about models: sonnet, haiku`,' +
  'get tools(){return[ro,$r]},source:"built-in",baseDir:"built-in",model:"haiku",permissionMode:"dontAsk",' +
  'getSystemPrompt(){return g7n()}};';

const statuslineMock =
  'var K7n={agentType:"statusline-setup",whenToUse:"Use this agent to configure the user\'s Claude Code status line setting.",' +
  'tools:["Read","Edit"],source:"built-in",baseDir:"built-in",model:"sonnet",color:"orange",getSystemPrompt:()=>q7n()};';

describe('subagentModels patch', () => {
  it('patches the claude-code-guide model through its hoisted constant', () => {
    const result = writeSubagentModels(guideMock, {
      ...EMPTY,
      claudeCodeGuide: 'sonnet',
    });
    expect(result).not.toBeNull();
    expect(result).toContain('baseDir:"built-in",model:"sonnet"');
    expect(result).not.toContain('model:"haiku"');
    expect(result).toContain('b_r="claude-code-guide"');
  });

  it('handles $ in the hoisted constant name', () => {
    const mock = guideMock.replaceAll('b_r', '$gr');
    const result = writeSubagentModels(mock, {
      ...EMPTY,
      claudeCodeGuide: 'opus',
    });
    expect(result).toContain('model:"opus"');
  });

  it('patches the claude-code-guide model when the literal is inlined', () => {
    const mock = guideMock
      .replace('b_r="claude-code-guide";', '')
      .replace('agentType:b_r', 'agentType:"claude-code-guide"');
    const result = writeSubagentModels(mock, {
      ...EMPTY,
      claudeCodeGuide: 'sonnet[1m]',
    });
    expect(result).toContain('model:"sonnet[1m]"');
  });

  it('patches the statusline-setup model', () => {
    const result = writeSubagentModels(statuslineMock, {
      ...EMPTY,
      statuslineSetup: 'haiku',
    });
    expect(result).toContain('baseDir:"built-in",model:"haiku",color:"orange"');
  });

  it('leaves other agents untouched', () => {
    const file = guideMock + statuslineMock;
    const result = writeSubagentModels(file, {
      ...EMPTY,
      statuslineSetup: 'opus',
    });
    expect(result).toContain('model:"haiku",permissionMode');
    expect(result).toContain('model:"opus",color:"orange"');
  });

  it('returns null when the claude-code-guide agent is missing', () => {
    const result = writeSubagentModels(statuslineMock, {
      ...EMPTY,
      claudeCodeGuide: 'sonnet',
    });
    expect(result).toBeNull();
  });

  it('does nothing when no models are configured', () => {
    const file = guideMock + statuslineMock;
    expect(writeSubagentModels(file, EMPTY)).toBe(file);
  });
});
