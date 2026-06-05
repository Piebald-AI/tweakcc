import { describe, expect, it } from 'vitest';

import { writeKeybindingCustomization } from './keybindingCustomization';

describe('keybindingCustomization', () => {
  it('bypasses the keybinding customization gate', () => {
    const file =
      'const x=1;' +
      'function lE(){return u$("tengu_keybinding_customization_release",!1)}' +
      'function DLK(H){let $=new Date()}';

    const result = writeKeybindingCustomization(file);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'function lE(){return !0;return u$("tengu_keybinding_customization_release",!1)}'
    );
  });

  it('returns unchanged file when already patched', () => {
    const file =
      'const x=1;' +
      'function lE(){return !0;return u$("tengu_keybinding_customization_release",!1)}' +
      'function DLK(H){let $=new Date()}';

    const result = writeKeybindingCustomization(file);

    expect(result).toBe(file);
  });

  it('returns null when the gate pattern is absent', () => {
    expect(writeKeybindingCustomization('const x=1;')).toBeNull();
  });
});
