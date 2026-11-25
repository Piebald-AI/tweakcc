import { afterEach, describe, expect, it } from 'vitest';

import { writeCodeModeAsyncScriptOutput } from './codeModeAsyncScriptOutput';

// The async lane's settle from CC 2.1.332 (chunk-j03wwfcm.js), after the
// PostToolUse hooks.
const SETTLE =
  '{output:Ze,rewritten:Ae,withheld:je,said:ct}=await vo({dispatchCtx:k,replToolUseID:L,parentMessage:s,input:n},z.data,Date.now()-pe,"settle",N.evalId);if(je)A();let st={...Ze,refusedCalls:je?void 0:z.data.refusedCalls}';

const settled = () =>
  (globalThis as { __tweakccSettledReplOutputs?: Map<string, unknown> })
    .__tweakccSettledReplOutputs;

const AsyncFunction = (async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

// Runs the settle for REPL call `id`; the hook pass returns `output`.
const settle = (code: string, id: string, output: object, withheld = false) =>
  new AsyncFunction('vo,A,k,L,s,n,z,pe,N', `let ${code};return st`)(
    async () => ({ output, rewritten: false, withheld, said: [] }),
    () => {},
    {},
    id,
    {},
    {},
    { data: {} },
    Date.now(),
    { evalId: 1 }
  );

describe('writeCodeModeAsyncScriptOutput', () => {
  afterEach(() => {
    delete (globalThis as { __tweakccSettledReplOutputs?: unknown })
      .__tweakccSettledReplOutputs;
  });

  const patched = writeCodeModeAsyncScriptOutput(SETTLE)!;
  const output = { code: 'return 1', stdout: 'hi', stderr: '', result: '1' };

  it('records nothing without the patch', async () => {
    await settle(SETTLE, 'toolu_1', output);
    expect(settled()).toBeUndefined();
  });

  it('records the settled output by REPL call and keeps the settle as is', async () => {
    expect(await settle(patched, 'toolu_1', output)).toEqual({
      ...output,
      refusedCalls: undefined,
    });
    expect(settled()?.get('toolu_1')).toBe(output);
  });

  it('records nothing when a hook withheld the output', async () => {
    await settle(patched, 'toolu_1', output, true);
    expect(settled()?.has('toolu_1')).toBeFalsy();
  });

  it('keeps the last 100 settles', async () => {
    for (let i = 0; i <= 100; i++) await settle(patched, `toolu_${i}`, output);
    expect(settled()?.size).toBe(100);
    expect(settled()?.has('toolu_0')).toBe(false);
    expect(settled()?.has('toolu_100')).toBe(true);
  });

  it('returns null when the settle is not there', () => {
    expect(writeCodeModeAsyncScriptOutput('let x=1;')).toBeNull();
    expect(
      writeCodeModeAsyncScriptOutput(SETTLE.replace('"settle"', '"result"'))
    ).toBeNull();
  });
});
