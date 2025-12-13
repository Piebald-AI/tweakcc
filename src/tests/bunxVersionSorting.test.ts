import { describe, it, expect } from 'vitest';
import { extractVersionFromPath } from '../installationDetection.js';
import { compareSemverVersions } from '../utils.js';

describe('extractVersionFromPath', () => {
  it('should extract version from a bunx cache path with forward slashes', () => {
    const path =
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.60@@@1/cli.js';
    expect(extractVersionFromPath(path)).toEqual([2, 0, 60]);
  });

  it('should extract version from a bunx cache path with backslashes (Windows)', () => {
    const path =
      'C:\\Users\\user\\.bun\\install\\cache\\@anthropic-ai\\claude-code@1.5.30@@@1\\cli.js';
    expect(extractVersionFromPath(path)).toEqual([1, 5, 30]);
  });

  it('should return null for non-bunx paths', () => {
    expect(
      extractVersionFromPath(
        '/usr/local/lib/node_modules/@anthropic-ai/claude-code'
      )
    ).toBeNull();
  });

  it('should return null for paths without version', () => {
    expect(extractVersionFromPath('/home/user/.claude/code')).toBeNull();
  });

  it('should extract version with large numbers', () => {
    const path =
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@10.20.300@@@1/cli.js';
    expect(extractVersionFromPath(path)).toEqual([10, 20, 300]);
  });

  it('should extract version from path with hash suffix', () => {
    const path =
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.67@@@abc123/cli.js';
    expect(extractVersionFromPath(path)).toEqual([2, 0, 67]);
  });
});

describe('compareSemverVersions', () => {
  it('should return positive when a > b (major)', () => {
    expect(compareSemverVersions([2, 0, 0], [1, 9, 9])).toBeGreaterThan(0);
  });

  it('should return positive when a > b (minor)', () => {
    expect(compareSemverVersions([2, 1, 0], [2, 0, 9])).toBeGreaterThan(0);
  });

  it('should return positive when a > b (patch)', () => {
    expect(compareSemverVersions([2, 0, 67], [2, 0, 60])).toBeGreaterThan(0);
  });

  it('should return negative when a < b', () => {
    expect(compareSemverVersions([2, 0, 60], [2, 0, 67])).toBeLessThan(0);
  });

  it('should return 0 when versions are equal', () => {
    expect(compareSemverVersions([2, 0, 60], [2, 0, 60])).toBe(0);
  });
});

describe('bunx path sorting', () => {
  it('should sort bunx cache paths with newest version first', () => {
    const paths = [
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.60@@@1/cli.js',
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.67@@@1/cli.js',
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.65@@@1/cli.js',
    ];

    const sortedPaths = [...paths].sort((a, b) => {
      const versionA = extractVersionFromPath(a);
      const versionB = extractVersionFromPath(b);

      if (versionA && versionB) {
        return compareSemverVersions(versionB, versionA); // Descending order
      }

      if (versionA) return -1;
      if (versionB) return 1;
      return 0;
    });

    expect(sortedPaths).toEqual([
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.67@@@1/cli.js',
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.65@@@1/cli.js',
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.60@@@1/cli.js',
    ]);
  });

  it('should place versioned paths before non-versioned paths', () => {
    const paths = [
      '/usr/local/lib/node_modules/@anthropic-ai/claude-code',
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.60@@@1/cli.js',
      '/home/user/.npm/_npx/some-hash',
    ];

    const sortedPaths = [...paths].sort((a, b) => {
      const versionA = extractVersionFromPath(a);
      const versionB = extractVersionFromPath(b);

      if (versionA && versionB) {
        return compareSemverVersions(versionB, versionA);
      }

      if (versionA) return -1;
      if (versionB) return 1;
      return 0;
    });

    expect(sortedPaths[0]).toBe(
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.60@@@1/cli.js'
    );
  });

  it('should maintain relative order for non-versioned paths', () => {
    const paths = [
      '/path/a',
      '/path/b',
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.60@@@1/cli.js',
      '/path/c',
    ];

    const sortedPaths = [...paths].sort((a, b) => {
      const versionA = extractVersionFromPath(a);
      const versionB = extractVersionFromPath(b);

      if (versionA && versionB) {
        return compareSemverVersions(versionB, versionA);
      }

      if (versionA) return -1;
      if (versionB) return 1;
      return 0;
    });

    // Versioned path should come first
    expect(sortedPaths[0]).toBe(
      '/home/user/.bun/install/cache/@anthropic-ai/claude-code@2.0.60@@@1/cli.js'
    );

    // Non-versioned paths should maintain their relative order after the versioned one
    const nonVersionedPaths = sortedPaths.slice(1);
    expect(nonVersionedPaths).toEqual(['/path/a', '/path/b', '/path/c']);
  });
});
