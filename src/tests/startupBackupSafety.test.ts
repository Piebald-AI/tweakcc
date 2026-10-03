import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('native backup safety', () => {
  it('does not overwrite an existing native backup from stale config version metadata', () => {
    const startupSource = fs.readFileSync(
      new URL('../startup.ts', import.meta.url),
      'utf8'
    );
    const branchStart = startupSource.indexOf(
      'if (realVersion !== backedUpVersion)'
    );
    const versionMismatchBranch = startupSource.slice(
      branchStart,
      startupSource.indexOf('return {', branchStart)
    );

    expect(branchStart).toBeGreaterThan(-1);
    expect(versionMismatchBranch).not.toContain(
      'await fs.unlink(NATIVE_BINARY_BACKUP_FILE)'
    );
    expect(versionMismatchBranch).not.toContain(
      'await backupNativeBinary(ccInstInfo)'
    );
  });
});
