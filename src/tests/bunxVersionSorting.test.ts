import { describe, it, expect } from 'vitest';
import { compareSemverVersions } from '../utils';

describe('compareSemverVersions', () => {
  it('should return positive when a > b (major)', () => {
    expect(compareSemverVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('should return positive when a > b (minor)', () => {
    expect(compareSemverVersions('2.1.0', '2.0.9')).toBeGreaterThan(0);
  });

  it('should return positive when a > b (patch)', () => {
    expect(compareSemverVersions('2.0.67', '2.0.60')).toBeGreaterThan(0);
  });

  it('should return negative when a < b', () => {
    expect(compareSemverVersions('2.0.60', '2.0.67')).toBeLessThan(0);
  });

  it('should return 0 when versions are equal', () => {
    expect(compareSemverVersions('2.0.60', '2.0.60')).toBe(0);
  });

  it('should handle versions with large numbers', () => {
    expect(compareSemverVersions('10.20.300', '10.20.299')).toBeGreaterThan(0);
    expect(compareSemverVersions('10.20.300', '10.19.999')).toBeGreaterThan(0);
    expect(compareSemverVersions('10.20.300', '9.99.999')).toBeGreaterThan(0);
  });

  it('should handle partial versions', () => {
    expect(compareSemverVersions('2.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemverVersions('2', '1.9.9')).toBeGreaterThan(0);
  });
});

describe('version sorting for candidates', () => {
  interface MockCandidate {
    path: string;
    version: string;
  }

  it('should sort candidates by version in ascending order', () => {
    const candidates: MockCandidate[] = [
      { path: '/path/to/2.0.60', version: '2.0.60' },
      { path: '/path/to/2.0.67', version: '2.0.67' },
      { path: '/path/to/2.0.65', version: '2.0.65' },
    ];

    const sorted = [...candidates].sort((a, b) =>
      compareSemverVersions(a.version, b.version)
    );

    expect(sorted.map(c => c.version)).toEqual(['2.0.60', '2.0.65', '2.0.67']);
  });

  it('should sort candidates by version in descending order', () => {
    const candidates: MockCandidate[] = [
      { path: '/path/to/2.0.60', version: '2.0.60' },
      { path: '/path/to/2.0.67', version: '2.0.67' },
      { path: '/path/to/2.0.65', version: '2.0.65' },
    ];

    const sorted = [...candidates].sort((a, b) =>
      compareSemverVersions(b.version, a.version)
    );

    expect(sorted.map(c => c.version)).toEqual(['2.0.67', '2.0.65', '2.0.60']);
  });

  it('should handle mixed major/minor/patch differences', () => {
    const candidates: MockCandidate[] = [
      { path: '/path/to/1.9.99', version: '1.9.99' },
      { path: '/path/to/2.0.1', version: '2.0.1' },
      { path: '/path/to/2.1.0', version: '2.1.0' },
      { path: '/path/to/1.10.0', version: '1.10.0' },
    ];

    const sorted = [...candidates].sort((a, b) =>
      compareSemverVersions(a.version, b.version)
    );

    expect(sorted.map(c => c.version)).toEqual([
      '1.9.99',
      '1.10.0',
      '2.0.1',
      '2.1.0',
    ]);
  });
});
