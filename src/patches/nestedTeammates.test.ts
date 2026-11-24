import { describe, expect, it } from 'vitest';

import { writeNestedTeammates } from './nestedTeammates';

const GATE_LINE =
  'if((Be||!!tA())&&O&&!zB())throw m("subagent_launch","subagent_nested_teammate"),new V("Teammates cannot spawn other teammates \\u2014 the team roster is flat. To spawn a subagent instead, omit the `name` parameter.");';
const SHORT_LINE =
  'un=vK()?"\\n- `run_in_background` and `name` are unavailable here \\u2014 only synchronous subagents.":su()?"\\n- `name` is unavailable here \\u2014 teammates cannot spawn teammates.":""';
const LONG_LINE =
  'vK()?`\n- The run_in_background and name parameters are not available in this context. Only synchronous subagents are supported.`:su()?`\n- The name parameter is not available in this context \\u2014 teammates cannot spawn other teammates. Omit it to spawn a subagent.`:""';

// Trimmed from CC 2.1.331: the Agent tool's spawn check (chunk-tzxxm05j.js)
// and the two forms of its prompt (chunk-hp8k9543.js).
const GATE_SOURCE =
  'function spawn(e,O,zB,tA,m,V){let Be=!!e.teammateContext;' +
  GATE_LINE +
  'return "spawned"}';

const SHORT_PROMPT_SOURCE = 'let ' + SHORT_LINE + ';';
const LONG_PROMPT_SOURCE = 'let p=`intro${' + LONG_LINE + '}outro`;';

const spawnAsTeammate = (code: string) =>
  new Function(
    `${code};return spawn({teammateContext:{}},"alpha",()=>false,()=>undefined,()=>{},Error);`
  )();

describe('writeNestedTeammates', () => {
  it('lets a teammate pass a name', () => {
    expect(() => spawnAsTeammate(GATE_SOURCE)).toThrow(
      'Teammates cannot spawn other teammates'
    );
    const patched = writeNestedTeammates(GATE_SOURCE)!;
    expect(patched).not.toContain('subagent_nested_teammate');
    expect(spawnAsTeammate(patched)).toBe('spawned');
  });

  it('drops the teammate line and keeps the in-process one without name', () => {
    const patched = writeNestedTeammates(SHORT_PROMPT_SOURCE)!;
    expect(patched).not.toContain('teammates cannot spawn teammates');
    const un = new Function('vK', 'su', `${patched};return un;`);
    expect(
      un(
        () => false,
        () => true
      )
    ).toBe('');
    expect(
      un(
        () => true,
        () => true
      )
    ).toBe(
      '\n- `run_in_background` is unavailable here \u2014 subagents run synchronously.'
    );
  });

  it('rewrites the long prompt form', () => {
    const patched = writeNestedTeammates(LONG_PROMPT_SOURCE)!;
    expect(patched).not.toContain('teammates cannot spawn other teammates');
    const p = new Function('vK', 'su', `${patched};return p;`);
    expect(
      p(
        () => false,
        () => true
      )
    ).toBe('introoutro');
    expect(
      p(
        () => true,
        () => true
      )
    ).toBe(
      'intro\n- The run_in_background parameter is not available in this context. Subagents run synchronously.outro'
    );
  });

  it('returns null for a module without any of the patterns', () => {
    expect(writeNestedTeammates('let x=1;')).toBeNull();
  });
});
