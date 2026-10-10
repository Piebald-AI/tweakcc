import { describe, it, expect } from 'vitest';
import { writeMcpNonBlocking, writeMcpBatchSize } from './mcpStartup';

// Real excerpt from CC 2.1.295 /$bunfs/root/chunk-rh70bbb8.js
const cc295NonBlocking =
  'function vDo(n){let{regularMcpConfigs:r,claudeaiConfigPromise:e,state:l,storageV5:d,' +
  'credentials:s,knownListings:p,dialInConnect:o,onDialStart:u,dialFirst:f}=n,m=Cr(),' +
  'g=a.MCP_CONNECTION_NONBLOCKING!==!1;ERo(g);let C=g;';

// Real excerpt from CC 2.1.295 /$bunfs/root/chunk-j1rn8qn6.js
const cc295BatchSize =
  'function Sn(){return a.MCP_SERVER_CONNECTION_BATCH_SIZE??3}' +
  'function Tn(){return a.MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE??20}';

describe('mcpStartup', () => {
  describe('writeMcpNonBlocking', () => {
    it('forces non-blocking on the old negated env check', () => {
      const old = 'if(!V9(process.env.MCP_CONNECTION_NONBLOCKING))await x();';
      expect(writeMcpNonBlocking(old)).toBe('if(false)await x();');
    });

    it('forces non-blocking on the CC 2.1.295 env triBool check', () => {
      const result = writeMcpNonBlocking(cc295NonBlocking);
      expect(result).toContain('m=Cr(),g=!0;ERo(g);');
      expect(result).not.toContain('MCP_CONNECTION_NONBLOCKING');
    });

    it('returns null for modules without the check', () => {
      expect(
        writeMcpNonBlocking('var x=["MCP_CONNECTION_NONBLOCKING"];')
      ).toBeNull();
    });
  });

  describe('writeMcpBatchSize', () => {
    it('replaces the old || default', () => {
      const old =
        'function KF1(){return parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE||"",10)||3}';
      expect(writeMcpBatchSize(old, 10)).toContain('10)||10}');
    });

    it('replaces the CC 2.1.140 >0 default', () => {
      const old =
        'function hX$(){let H=parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE||"",10);return H>0?H:3}';
      expect(writeMcpBatchSize(old, 10)).toContain('return H>0?H:10}');
    });

    it('replaces the CC 2.1.295 ?? default only for local servers', () => {
      const result = writeMcpBatchSize(cc295BatchSize, 12);
      expect(result).toContain('MCP_SERVER_CONNECTION_BATCH_SIZE??12}');
      expect(result).toContain('MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE??20}');
    });

    it('returns null for modules without the default', () => {
      expect(writeMcpBatchSize('var x=1;', 12)).toBeNull();
    });
  });
});
