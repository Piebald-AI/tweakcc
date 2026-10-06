import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  writeSkipTrustDialog,
  writeSkipTrustDialogModules,
} from './skipTrustDialog';

// Excerpt of the trust dialog chunk in Claude Code 2.1.291, with its imports
// and React plumbing replaced by stubs that record what the dialog does.
const CHUNK =
  'function zo(mr){return{...mr,hasTrustDialogAccepted:!0}}' +
  'function Uo($o,t){let{onDone:M}=$o,ge="storage",lo=t.trusted,rr=t.backstop;' +
  'let mo=function l(cr){let fo=mT();if(y("onboarding_trust_dialog"),' +
  'i("tengu_trust_dialog_accept",{isHomeDir:fo,hasMcpServers:!1}),fo)MH(!0),WLe(!0);else lm(zo,ge);M()};' +
  'let Ho={context:"Confirmation"};if(Ve("confirm:no",mo,Ho),lo&&!rr){return queueMicrotask(M),null}' +
  'return"dialog"}';

/** Evaluates the chunk with recording stubs and renders the dialog once. */
const render = async (
  source: string,
  { homeDir = false, trusted = false, backstop = false } = {}
) => {
  const calls: string[] = [];
  const Uo = new Function(
    'mT',
    'MH',
    'WLe',
    'lm',
    'y',
    'i',
    'Ve',
    `${source};return Uo;`
  )(
    () => homeDir,
    (v: boolean) => calls.push(`MH(${v})`),
    (v: boolean) => calls.push(`WLe(${v})`),
    (fn: (c: object) => object, storage: string) =>
      calls.push(`lm(${JSON.stringify(fn({}))},${storage})`),
    () => {},
    () => {},
    () => {}
  );
  const rendered = Uo(
    { onDone: () => calls.push('onDone') },
    { trusted, backstop }
  );
  await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
  return { rendered, calls };
};

describe('writeSkipTrustDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves project trust and closes without drawing', async () => {
    const { rendered, calls } = await render(writeSkipTrustDialog(CHUNK)!);
    expect(rendered).toBeNull();
    expect(calls).toEqual([
      'lm({"hasTrustDialogAccepted":true},storage)',
      'onDone',
    ]);
  });

  it('trusts only the session in the home directory', async () => {
    const { calls } = await render(writeSkipTrustDialog(CHUNK)!, {
      homeDir: true,
    });
    expect(calls).toEqual(['MH(true)', 'WLe(true)', 'onDone']);
  });

  it('accepts when a trusted folder asks for a second confirmation', async () => {
    const { rendered, calls } = await render(writeSkipTrustDialog(CHUNK)!, {
      trusted: true,
      backstop: true,
    });
    expect(rendered).toBeNull();
    expect(calls).toContain('onDone');
  });

  it('draws the dialog when unpatched', async () => {
    const { rendered } = await render(CHUNK);
    expect(rendered).toBe('dialog');
  });

  it('is idempotent', () => {
    const patched = writeSkipTrustDialog(CHUNK)!;
    expect(writeSkipTrustDialog(patched)).toBe(patched);
  });

  it('returns null when the dialog is missing', () => {
    expect(writeSkipTrustDialog('function a(){}')).toBeNull();
  });
});

describe('writeSkipTrustDialogModules', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('patches only the module holding the dialog', () => {
    const other = 'export const x=1;';
    const patched = writeSkipTrustDialogModules([other, CHUNK])!;
    expect(patched[0]).toBe(other);
    expect(patched[1]).toBe(writeSkipTrustDialog(CHUNK));
  });

  it('fails when no module holds the dialog', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeSkipTrustDialogModules(['export const x=1;'])).toBeNull();
  });
});
