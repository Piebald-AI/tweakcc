import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  writeSkipDevChannelsDialog,
  writeSkipDevChannelsDialogModules,
} from './skipDevChannelsDialog';

// Excerpt of the development channels chunk in Claude Code 2.1.291, with its
// React plumbing replaced by stubs.
const CHUNK =
  'function R(p){return`server:${p.name}`}' +
  'function k(D){let o=w(13),{channels:m,onAccept:h}=D,f;' +
  'f=function a(L){F:switch(L){case"accept":{h();break F}}};' +
  'return{title:"WARNING: Loading development channels",onConfirm:()=>f("accept")}}';

/** Evaluates the chunk and renders the dialog once. */
const render = async (source: string) => {
  const calls: string[] = [];
  const k = new Function('w', `${source};return k;`)(() => []);
  const rendered = k({
    channels: [{ name: 'whatsapp' }],
    onAccept: () => calls.push('onAccept'),
  });
  await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
  return { rendered, calls };
};

describe('writeSkipDevChannelsDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts and closes without drawing', async () => {
    const { rendered, calls } = await render(
      writeSkipDevChannelsDialog(CHUNK)!
    );
    expect(rendered).toBeNull();
    expect(calls).toEqual(['onAccept']);
  });

  it('draws the dialog when unpatched', async () => {
    const { rendered, calls } = await render(CHUNK);
    expect(rendered).not.toBeNull();
    expect(calls).toEqual([]);
  });

  it('is idempotent', () => {
    const patched = writeSkipDevChannelsDialog(CHUNK)!;
    expect(writeSkipDevChannelsDialog(patched)).toBe(patched);
  });

  it('matches identifiers containing `$`', () => {
    const input =
      'function $k($D){let o=w(13),{channels:m$,onAccept:$h}=$D,f;return"Loading development channels"}';
    expect(writeSkipDevChannelsDialog(input)).toContain(
      'return queueMicrotask($D.onAccept),null;'
    );
  });
});

describe('writeSkipDevChannelsDialogModules', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('patches only the module holding the dialog', () => {
    const other = 'export const x=1;';
    const patched = writeSkipDevChannelsDialogModules([CHUNK, other])!;
    expect(patched[0]).toBe(writeSkipDevChannelsDialog(CHUNK));
    expect(patched[1]).toBe(other);
  });

  it('fails when no module holds the dialog', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeSkipDevChannelsDialogModules(['export const x=1;'])).toBeNull();
  });
});
