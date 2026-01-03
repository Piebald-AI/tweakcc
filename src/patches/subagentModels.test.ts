import { describe, it, expect } from 'vitest';
import { writeSubagentModels } from './subagentModels';

describe('subagentModels patch', () => {
  it('should patch Plan agent model', () => {
    const oldFile = `
      {
        agentType: "Plan",
        model: "claude-3-5-sonnet-20241022"
      }
    `;
    const config = {
      plan: 'haiku',
      explore: null,
      generalPurpose: null,
    };
    const newFile = writeSubagentModels(oldFile, config);
    expect(newFile).toContain('agentType: "Plan"');
    expect(newFile).toContain('model: "haiku"');
  });

  it('should patch Explore agent model', () => {
    const oldFile = `
      {
        agentType: "Explore",
        model: "claude-3-5-sonnet-20241022"
      }
    `;
    const config = {
      plan: null,
      explore: 'sonnet',
      generalPurpose: null,
    };
    const newFile = writeSubagentModels(oldFile, config);
    expect(newFile).toContain('agentType: "Explore"');
    expect(newFile).toContain('model: "sonnet"');
  });

  it('should patch general-purpose agent model (updating existing)', () => {
    const oldFile = `const gp = {agentType: "general-purpose", model: "sonnet"};`;
    const config = {
      plan: null,
      explore: null,
      generalPurpose: 'haiku',
    };
    const newFile = writeSubagentModels(oldFile, config);
    expect(newFile).toContain('agentType: "general-purpose"');
    expect(newFile).toContain('model: "haiku"');
  });

  it('should patch general-purpose agent model (adding new)', () => {
    const oldFile = `const gp = {agentType: "general-purpose"};`;
    const config = {
      plan: null,
      explore: null,
      generalPurpose: 'haiku',
    };
    const newFile = writeSubagentModels(oldFile, config);
    expect(newFile).toContain('agentType: "general-purpose"');
    expect(newFile).toContain('model:"haiku"');
  });

  it('should return null if no changes needed', () => {
    const oldFile = `
      {
        agentType: "Plan",
        model: "claude-3-5-sonnet-20241022"
      }
    `;
    const config = {
      plan: null,
      explore: null,
      generalPurpose: null,
    };
    const newFile = writeSubagentModels(oldFile, config);
    expect(newFile).toBeNull();
  });
});
