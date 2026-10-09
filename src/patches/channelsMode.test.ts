import { describe, expect, it, vi } from 'vitest';

import { writeChannelsMode } from './channelsMode';
import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';

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

  describe('code-split CC 2.1.295', () => {
    // Trimmed from real CC 2.1.295 chunks.
    const modules = {
      '/dncbxpx7.js':
        'function WN(){return on("allow_channels")&&k("tengu_harbor",!1)}function Pht(){if(!k("tengu_harbor",!1))return!0;let e=rm("allow_channels");return e!==null&&e!=="cache_miss"&&e!=="route_missing"}',
      '/256jjx4m.js':
        'function xht(e,i,n,r){if(!EQe(i))return{action:"skip",kind:"capability",reason:"server did not declare claude/channel capability"};if(r==="modern")return{action:"skip",kind:"era",reason:"connection negotiated a modern protocol revision with no unsolicited notification path"};}',
      '/8wehjd7t.js':
        'function Sjo(){return k("tengu_harbor_permissions",!1)}function q(){return Vr("tengu_quiet_elephant",!0)}',
      '/7ytk1pm2.js':
        'for(let _ of l){if(_.kind==="server"){if(!f.has(_.name))C.push({entry:_,why:"no MCP server configured with that name"});if(!_.dev)C.push({entry:_,why:"server: entries need --dangerously-load-development-channels"});continue}}',
    };
    const onGraph = (sources: Map<string, string>) =>
      applyPatchImplementationsToGraph(
        sources,
        { p: { fn: writeChannelsMode } },
        [{ id: 'p', name: 'p', group: PatchGroup.FEATURES }]
      ).results[0];

    it('forces both tengu_harbor checks in the module that defines them', () => {
      const sources = new Map(Object.entries(modules));

      expect(onGraph(sources)).toMatchObject({ applied: true, failed: false });
      expect(sources.get('/dncbxpx7.js')).toContain(
        'function WN(){return !0;return on("allow_channels")'
      );
      expect(sources.get('/dncbxpx7.js')).toContain(
        'function Pht(){return!1;if(!k("tengu_harbor",!1))'
      );
      expect(sources.get('/256jjx4m.js')).toContain(
        'capability"};return{action:"register"};if(r==="modern")'
      );
      expect(sources.get('/8wehjd7t.js')).toContain(
        'function Sjo(){return !0;return k('
      );
      expect(sources.get('/7ytk1pm2.js')).not.toContain('server: entries need');
    });

    it('fails when the tengu_harbor master gate is missing', () => {
      const sources = new Map(
        Object.entries(modules).filter(([name]) => name !== '/dncbxpx7.js')
      );

      expect(onGraph(sources)).toMatchObject({ applied: false, failed: true });
    });
  });
});
