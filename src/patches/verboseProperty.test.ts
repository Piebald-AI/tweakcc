import { describe, expect, it } from 'vitest';

import { writeVerboseProperty } from './verboseProperty';

// Spinner element props used by the primary anchor's lookaheads.
const spinnerProps =
  'mode:e,responseLengthRef:o,spinnerSuffix:d,verbose:p,columns:f,thinkingStatus:m,isCompacting:h';

describe('writeVerboseProperty', () => {
  it('forces verbose:true on the JSX automatic-runtime form (jsx)', () => {
    const input = `const a=1;Q.jsx(HJa,{${spinnerProps}});const b=2;`;
    const result = writeVerboseProperty(input);
    expect(result).not.toBeNull();
    expect(result).toContain('verbose:true');
    expect(result).not.toContain('verbose:p');
  });

  it('forces verbose:true on the JSX automatic-runtime form (jsxs)', () => {
    const input = `Q.jsxs(HJa,{${spinnerProps}})`;
    const result = writeVerboseProperty(input);
    expect(result).not.toBeNull();
    expect(result).toContain('verbose:true');
  });

  it('still handles the legacy createElement form', () => {
    const input = `R.createElement(HJa,{${spinnerProps}})`;
    const result = writeVerboseProperty(input);
    expect(result).not.toBeNull();
    expect(result).toContain('verbose:true');
  });

  it('handles the legacy spinnerTip/overrideMessage fallback (jsx)', () => {
    const input =
      'Q.jsx(Sp,{foo:1,spinnerTip:t,overrideMessage:m,verbose:p})';
    const result = writeVerboseProperty(input);
    expect(result).not.toBeNull();
    expect(result).toContain('verbose:true');
  });

  it('returns null when no spinner element is present', () => {
    expect(writeVerboseProperty('const x=1;Q.jsx(Other,{foo:1})')).toBeNull();
  });
});
