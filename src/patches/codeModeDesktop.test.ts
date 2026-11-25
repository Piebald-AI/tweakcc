import { describe, expect, it } from 'vitest';

import { writeCodeModeDesktop } from './codeModeDesktop';
import { writeCodeModeHeadlessHosts } from './codeModeHeadlessHosts';
import { KNOWN, OPT_IN, settle } from './codeModeOptIn.fixture';

const desktop = { entrypoint: 'claude-desktop' };

describe('writeCodeModeDesktop', () => {
  it('refuses the Desktop app without the patch', async () => {
    expect(await settle(KNOWN + OPT_IN, desktop)).toEqual({
      state: 'refused',
      why: 'entrypoint',
    });
  });

  it('turns Code Mode on in the Desktop app', async () => {
    const patched = writeCodeModeDesktop(KNOWN + OPT_IN)!;
    expect(await settle(patched, desktop)).toEqual({
      state: 'on',
      source: 'flagSettings',
    });
    expect(await settle(patched, { entrypoint: 'claude-vscode' })).toEqual({
      state: 'refused',
      why: 'entrypoint',
    });
    expect(
      await settle(patched, { ...desktop, source: 'userSettings' })
    ).toEqual({ state: 'refused', why: 'not_passed' });
  });

  it('takes the opt-in from user settings with the headless hosts patch', async () => {
    for (const patched of [
      writeCodeModeHeadlessHosts(writeCodeModeDesktop(KNOWN + OPT_IN)!)!,
      writeCodeModeDesktop(writeCodeModeHeadlessHosts(KNOWN + OPT_IN)!)!,
    ]) {
      expect(
        await settle(patched, { ...desktop, source: 'userSettings' })
      ).toEqual({ state: 'on', source: 'userSettings' });
    }
  });

  it('returns null when the set is not there', () => {
    expect(writeCodeModeDesktop('let x=1;')).toBeNull();
    expect(
      writeCodeModeDesktop(OPT_IN.replace('return"runtime"', 'return"x"'))
    ).toBeNull();
  });
});
