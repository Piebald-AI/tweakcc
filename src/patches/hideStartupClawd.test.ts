import { describe, expect, it, vi } from 'vitest';

import { writeHideStartupClawd } from './hideStartupClawd';

describe('writeHideStartupClawd', () => {
  it('nulls the wrapper that renders the inner component via the JSX runtime (CC 2.1.195+)', () => {
    const input =
      'function Inner(e){return X.jsx("text",{children:"▛███▜"})}' +
      'function Wrap(e){if(t)return X.jsx(Inner,{pose:o});return X.jsx("art",{})}';

    const result = writeHideStartupClawd(input);

    expect(result).not.toBeNull();
    expect(result).toContain('function Wrap(e){return null;');
    // The inner component is left untouched; the pre-fix bug nulled it instead,
    // hiding only the Apple-Terminal branch while the ASCII art still rendered.
    expect(result).not.toContain('function Inner(e){return null;');
  });

  it('still nulls a legacy createElement wrapper (older Claude Code)', () => {
    const input =
      'function Inner(e){return X.createElement("text",null,"▛███▜")}' +
      'function Wrap(e){return X.createElement(Inner,{pose:o})}';

    const result = writeHideStartupClawd(input);

    expect(result).not.toBeNull();
    expect(result).toContain('function Wrap(e){return null;');
  });

  it('matches an inner component name containing `$` (regex-escaped)', () => {
    const input =
      'function $f(e){return X.jsx("text",{children:"▛███▜"})}' +
      'function Wrap(e){return X.jsx($f,{pose:o})}';

    const result = writeHideStartupClawd(input);

    expect(result).not.toBeNull();
    expect(result).toContain('function Wrap(e){return null;');
  });

  it('returns null when no Clawd art is present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = writeHideStartupClawd('function f(){return 1}');

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
