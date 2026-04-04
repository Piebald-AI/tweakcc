import { describe, it, expect } from 'vitest';
import { writeSuppressRateLimitWarning } from './suppressRateLimitWarning';

describe('writeSuppressRateLimitWarning', () => {
  const makeInput = (delimiter = '}') =>
    `function Ip8(H,$){let q=d2K(H,$)${delimiter}if(q&&q.severity==="warning")return q.message;return null}`;

  it('should replace warning message return with null', () => {
    const input = makeInput();
    const result = writeSuppressRateLimitWarning(input);
    expect(result).not.toBeNull();
    expect(result).toContain('if(q&&q.severity==="warning")return null;');
    expect(result).not.toContain('return q.message');
  });

  it('should return unchanged file when already patched', () => {
    const input = makeInput();
    const patched = writeSuppressRateLimitWarning(input)!;
    const result = writeSuppressRateLimitWarning(patched);
    expect(result).toBe(patched);
  });

  it('should return null when pattern not found', () => {
    const result = writeSuppressRateLimitWarning('no matching content here');
    expect(result).toBeNull();
  });

  it('should work with different delimiters', () => {
    for (const d of [',', ';', '}', '{']) {
      const result = writeSuppressRateLimitWarning(makeInput(d));
      expect(result).not.toBeNull();
      expect(result).toContain('severity==="warning")return null;');
    }
  });
});
