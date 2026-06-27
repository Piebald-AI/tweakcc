import { describe, expect, it, vi } from 'vitest';

import { writeChannelsMode } from './channelsMode';

// Minimal synthetic bundle carrying the four anchors the channels-mode patch
// still relies on (the two flag gates, the gate-function capability check, and
// the server dev-flag warning). The "Experimental" notice banner is omitted to
// mirror CC 2.1.193+.
const GATES =
  'function a(){return F("tengu_harbor",!1)};' +
  'function g(){return{reason:"server did not declare claude/channel capability"}};' +
  'function b(){return F("tengu_harbor_permissions",!1)};' +
  'if(!x.dev)y.push({entry:x,why:"server: entries need --dangerously-load-development-channels"});';

describe('writeChannelsMode', () => {
  it('applies without logging a failure when the removed ChannelsNotice banner is absent (CC 2.1.193+)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = writeChannelsMode(GATES);

    expect(result).not.toBeNull();
    expect(result).toContain('return !0;return F("tengu_harbor",!1)');
    expect(result).toContain('return{action:"register"};');
    expect(result).not.toContain('server: entries need');
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('still neutralizes the ChannelsNotice warning when present (older Claude Code)', () => {
    const input =
      GATES +
      'Experimental \xb7 inbound messages will be pushed into this session, ' +
      'this carries prompt injection risks. Restart Claude Code without F to disable.';

    const result = writeChannelsMode(input);

    expect(result).not.toBeNull();
    expect(result).toContain('Channels active. Restart Claude Code without ');
    expect(result).not.toContain('carries prompt injection risks');
  });
});
