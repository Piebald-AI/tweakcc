import { describe, expect, it } from 'vitest';

import { writeCodeModeBackgroundSessions } from './codeModeBackgroundSessions';
import { KNOWN, OPT_IN, settle } from './codeModeOptIn.fixture';

const bg = { headless: false, entrypoint: 'cli', bgSession: true };

describe('writeCodeModeBackgroundSessions', () => {
  it('refuses a background session without the patch', async () => {
    expect(await settle(KNOWN + OPT_IN, bg)).toEqual({
      state: 'refused',
      why: 'unattended',
    });
  });

  it('turns Code Mode on in a background session once the caveats were accepted', async () => {
    const patched = writeCodeModeBackgroundSessions(KNOWN + OPT_IN)!;
    expect(await settle(patched, bg)).toEqual({
      state: 'on',
      source: 'flagSettings',
    });
    expect(await settle(patched, { ...bg, caveatsAccepted: false })).toEqual({
      state: 'refused',
      why: 'unattended',
    });
    expect(
      await settle(patched, { ...bg, bgSession: false, teammate: true })
    ).toEqual({ state: 'refused', why: 'unattended' });
  });

  it('applies after the Remote Control patch removed its check', async () => {
    const patched = writeCodeModeBackgroundSessions(
      (KNOWN + OPT_IN).replace('e.teammate||e.remoteControl||', 'e.teammate||')
    )!;
    expect(await settle(patched, bg)).toEqual({
      state: 'on',
      source: 'flagSettings',
    });
  });

  it('returns null when an anchor is missing', () => {
    expect(writeCodeModeBackgroundSessions('let x=1;')).toBeNull();
    expect(
      writeCodeModeBackgroundSessions(
        OPT_IN.replace('return"unattended"', 'return"x"')
      )
    ).toBeNull();
  });
});
