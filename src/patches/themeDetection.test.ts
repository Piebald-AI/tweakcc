import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeThemeDetection } from './themeDetection';
import { clearCaches } from './helpers';

// Synthetic COLORFGBG detect function from CC v2.1.89
const DETECT_V289 =
  'function uG4(){let H=process.env.COLORFGBG;if(!H)return;' +
  'let _=H.split(";"),q=_[_.length-1];' +
  'if(q===void 0||q==="")return;' +
  'let K=Number(q);if(!Number.isInteger(K)||K<0||K>15)return;' +
  'return K<=6||K===8?"dark":"light"}';

// Bun-style prefix for getRequireFuncName to resolve to "require"
const BUN_PREFIX =
  'var j=(H,$,A)=>{A=H!=null?H:$};' +
  'var n7L=($)=>{var W=Symbol.for("react.transitional.element")};';

function buildInput(detectFunc: string = DETECT_V289): string {
  return BUN_PREFIX + 'var Xv6;' + detectFunc + 'var other=1;';
}

describe('themeDetection', () => {
  beforeEach(() => {
    clearCaches();
  });

  it('replaces COLORFGBG detection with cross-platform detection', () => {
    const result = writeThemeDetection(buildInput());

    expect(result).not.toBeNull();
    expect(result).toContain('defaults read -g AppleInterfaceStyle');
    expect(result).toContain('org.freedesktop.appearance color-scheme');
    expect(result).toContain('AppsUseLightTheme');
    // COLORFGBG preserved as fallback
    expect(result).toContain('process.env.COLORFGBG');
  });

  it('preserves the original function name', () => {
    const result = writeThemeDetection(buildInput());

    expect(result).not.toBeNull();
    expect(result).toContain('function uG4(){try{');
  });

  it('handles different function names (v2.1.87)', () => {
    const detect87 =
      'function MR4(){let H=process.env.COLORFGBG;if(!H)return;' +
      'let _=H.split(";"),q=_[_.length-1];' +
      'if(q===void 0||q==="")return;' +
      'let K=Number(q);if(!Number.isInteger(K)||K<0||K>15)return;' +
      'return K<=6||K===8?"dark":"light"}';

    const result = writeThemeDetection(buildInput(detect87));

    expect(result).not.toBeNull();
    expect(result).toContain('function MR4(){try{');
  });

  it('returns content unchanged when already patched', () => {
    const first = writeThemeDetection(buildInput());
    expect(first).not.toBeNull();

    clearCaches();
    const second = writeThemeDetection(first!);
    expect(second).toBe(first);
  });

  it('returns null when COLORFGBG detect function is not found', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      const result = writeThemeDetection(BUN_PREFIX + 'const x = 1;');
      expect(result).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'patch: themeDetection: failed to find COLORFGBG detect function'
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
