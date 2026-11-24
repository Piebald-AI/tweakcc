import { describe, expect, it } from 'vitest';

import { writeAgentModelChoice } from './agentModelChoice';

// The Agent tool's `model` field from CC 2.1.331 (chunk-tzxxm05j.js).
const MODEL_FIELD =
  'model:U(wHl).optional().describe(`Optional model override for this agent. Takes precedence over the agent definition\'s model frontmatter and the configured default subagent model. If omitted, uses the agent definition\'s model, else the default (inherits from the parent unless a default subagent model is configured). Ignored for subagent_type: "fork" \\u2014 forks always inherit the parent model.`+(El()?s.CLAUDE_CODE_COORDINATOR_FORCE_WORKER_INHERIT_MODEL?" Unavailable on this session: this parameter is ignored \\u2014 do not set it.":" Set this only when EXPLICITLY asked by the user for a specific model, never because the task seems small, simple, or cheap; otherwise omit it so the worker uses the default (the session model, unless a default subagent model is configured).":""))';

const describeModel = (
  code: string,
  coordinator: boolean,
  forceInherit = false
) =>
  new Function(
    'U',
    'wHl',
    'El',
    's',
    `let d;U=()=>({optional:()=>({describe:t=>(d=t)})});let x={${code}};return d;`
  )(undefined, [], () => coordinator, {
    CLAUDE_CODE_COORDINATOR_FORCE_WORKER_INHERIT_MODEL: forceInherit,
  });

describe('writeAgentModelChoice', () => {
  const patched = writeAgentModelChoice(MODEL_FIELD)!;

  it('adds the guidance outside coordinator mode', () => {
    expect(describeModel(MODEL_FIELD, false)).not.toContain('"haiku" for');
    const text = describeModel(patched, false);
    expect(text).toMatch(/^Optional model override for this agent\./);
    expect(text).toContain('Pick it yourself, on your own judgment');
  });

  it('leaves the coordinator-mode text alone', () => {
    expect(describeModel(patched, true)).toBe(describeModel(MODEL_FIELD, true));
    expect(describeModel(patched, true, true)).toBe(
      describeModel(MODEL_FIELD, true, true)
    );
  });

  it('returns null without the field', () => {
    expect(writeAgentModelChoice('let x=1;')).toBeNull();
  });
});
