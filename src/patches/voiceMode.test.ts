import { describe, expect, it, vi } from 'vitest';

import { writeVoiceMode } from './voiceMode';

describe('voiceMode', () => {
  it('enables both voice gates using minified replacements', () => {
    const file =
      'const x=1;' +
      'function qX_(){return A9("tengu_amber_quartz",!1)}' +
      'if(A9("tengu_sotto_voce",!1))return`# Output efficiency...`';

    const result = writeVoiceMode(file, true);

    expect(result).not.toBeNull();
    expect(result).toContain('function qX_(){return !0;return A9(');
    expect(result).toContain('if(!0)return`# Output efficiency...`');
  });

  it('patches only amber quartz when enableConciseOutput is false', () => {
    const file =
      'const x=1;' +
      'function qX_(){return A9("tengu_amber_quartz",!1)}' +
      'if(A9("tengu_sotto_voce",!1))return`# Output efficiency...`';

    const result = writeVoiceMode(file, false);

    expect(result).not.toBeNull();
    expect(result).toContain('function qX_(){return !0;return A9(');
    expect(result).toContain(
      'if(A9("tengu_sotto_voce",!1))return`# Output efficiency...`'
    );
  });

  it('matches the amber quartz gate in assignment context', () => {
    const file =
      'const gate=function qX_(){return A9("tengu_amber_quartz",!1)}';

    const result = writeVoiceMode(file, false);

    expect(result).toBe(
      'const gate=function qX_(){return !0;return A9("tengu_amber_quartz",!1)}'
    );
  });

  it('returns null when the amber quartz gate is absent', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      expect(writeVoiceMode('const x=1;', false)).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'patch: voiceMode: failed to find tengu_amber_quartz gate'
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
