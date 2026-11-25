import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeStableEventNonces } from './stableEventNonces';

// The nonce key and the re-mint function from CC 2.1.332 (chunk-89607rrd.js).
const NONCES =
  'var O=6,M=9+Math.ceil(O*4/3);function LYi(e){switch(e){case"element":return M;case"json":return 2*M}}function sMr(){return B(O).toString("base64url")}var V;function eDs(e){return V??=B(32),q("sha256",V).update(e).digest().subarray(0,O).toString("base64url")}var P=/^<event nonce="([A-Za-z0-9_-]+)"/;function f4n(e,n){let t=P.exec(e)?.[1];if(t===void 0)return e;let o=eDs(`remint:${t}`),r=e.replace(P,`<event nonce="${o}"`);switch(n){case"element":return r;case"json":return r.replace(x,`</event nonce="${o}">`)}}';

// Each call is a fresh "process": new module state, same config directory.
const remint = (code: string) =>
  new Function(
    'B',
    'q',
    `${code};return f4n('<event nonce="abc" kind="repl-eval">x</event>',"element");`
  )(randomBytes, createHmac) as string;

describe('writeStableEventNonces', () => {
  let saved: string | undefined;
  let dir: string;

  beforeEach(() => {
    saved = process.env.CLAUDE_CONFIG_DIR;
    dir = mkdtempSync(path.join(tmpdir(), 'tweakcc-nonce-'));
    process.env.CLAUDE_CONFIG_DIR = dir;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  });

  it('re-mints differently in every process without the patch', () => {
    expect(remint(NONCES)).not.toBe(remint(NONCES));
  });

  it('re-mints the same way in every process with the patch', () => {
    const patched = writeStableEventNonces(NONCES)!;
    const first = remint(patched);
    expect(first).toMatch(/^<event nonce="[A-Za-z0-9_-]{8}" kind="repl-eval">/);
    expect(remint(patched)).toBe(first);

    const keyFile = path.join(dir, '.event-nonce-key');
    expect(readFileSync(keyFile)).toHaveLength(32);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
  });

  it('returns null when the key code is not there', () => {
    expect(writeStableEventNonces('let x=1;')).toBeNull();
    expect(writeStableEventNonces(NONCES.replace('remint:', ''))).toBeNull();
  });
});
