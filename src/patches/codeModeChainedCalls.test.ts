import { describe, expect, it } from 'vitest';

import { writeCodeModeChainedCalls } from './codeModeChainedCalls';

// The REPL runner's late phase after a script returned with calls still
// running, from CC 2.1.332 (chunk-j03wwfcm.js).
const LATE_PHASE =
  'let g=()=>{},h=new Promise((D)=>{g=D,te.onIdle=D}),F=Et(Di,()=>{Qt=!0,ft?.()},zue),W=h.then(()=>(vt(),F(),te.ranOut=!J.signal.aborted,J.abort(AZo),me.scriptChecks.ended(pt.record),jn()));';

// Runs the late phase for a script that left one command running and chained
// a write on it, as `$`suite`.then(r => write(...))` does. `call` stands in
// for the script's call wrapper (chunk-h3f56h75.js): it counts the call, and
// when the count drops to 0 after the script ended it fires the idle hook,
// before the call's own promise resolves.
const runChainedWrite = async (code: string) => {
  const te: { pendingCalls: number; onIdle?: () => void } = {
    pendingCalls: 0,
  };
  const J = new AbortController();
  const idle = new Function(
    'te',
    'J',
    'Et',
    'Di',
    'zue',
    'vt',
    'jn',
    'me',
    'pt',
    'AZo',
    `${code};return W;`
  )(
    te,
    J,
    () => () => {},
    'tag',
    0,
    () => {},
    () => {},
    { scriptChecks: { ended: () => {} } },
    { record: {} },
    undefined
  ) as Promise<void>;

  const calls: string[] = [];
  const call = async (name: string, work: () => Promise<void>) => {
    if (J.signal.aborted) {
      calls.push(`${name}: refused`);
      return;
    }
    te.pendingCalls++;
    try {
      await work();
      calls.push(`${name}: ran`);
    } finally {
      te.pendingCalls--;
      if (te.pendingCalls === 0) te.onIdle?.();
    }
  };

  let finishSuite!: () => void;
  const suite = new Promise<void>(resolve => (finishSuite = resolve));
  const chained = call('suite', () => suite)
    .then(() => undefined)
    .then(() => call('write', () => Promise.resolve()));

  finishSuite();
  await chained;
  await idle;
  return { calls, aborted: J.signal.aborted };
};

describe('writeCodeModeChainedCalls', () => {
  it('refuses the chained call without the patch', async () => {
    expect(await runChainedWrite(LATE_PHASE)).toEqual({
      calls: ['suite: ran', 'write: refused'],
      aborted: true,
    });
  });

  it('runs the chained call, then ends the script, with the patch', async () => {
    const patched = writeCodeModeChainedCalls(LATE_PHASE)!;
    expect(patched).toContain('te.onIdle=()=>setImmediate(');
    expect(await runChainedWrite(patched)).toEqual({
      calls: ['suite: ran', 'write: ran'],
      aborted: true,
    });
  });

  it('returns null when the idle hook is not there', () => {
    expect(writeCodeModeChainedCalls('let x=1;')).toBeNull();
    expect(
      writeCodeModeChainedCalls(LATE_PHASE.replace('te.onIdle=D', 'te.idle=D'))
    ).toBeNull();
  });
});
