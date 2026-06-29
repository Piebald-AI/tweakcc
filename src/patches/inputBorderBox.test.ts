import { describe, expect, it } from 'vitest';

import { writeInputBoxBorder } from './inputBorderBox';

describe('writeInputBoxBorder', () => {
  // The main prompt + external-editor boxes spread one hoisted props object
  // (`vie`/`TV`) whose border is borderStyle:"round" with the distinctive
  // top-only combo borderLeft:!1,borderRight:!1,borderBottom:!0.
  const hoisted =
    'let vie=hO?{}:{borderColor:(()=>{return c})(),borderStyle:"round",borderLeft:!1,borderRight:!1,borderBottom:!0};' +
    'Jsx(Box,{flexDirection:"row",...vie,width:"100%",borderText:t,children:[]});';

  it('disables the border on the hoisted props object', () => {
    const result = writeInputBoxBorder(hoisted, true);
    expect(result).not.toBeNull();
    expect(result).toContain(
      'borderStyle:undefined,borderLeft:!1,borderRight:!1,borderBottom:!0'
    );
    expect(result).not.toContain('borderStyle:"round",borderLeft:!1');
  });

  it('returns the input unchanged when removeBorder is false', () => {
    expect(writeInputBoxBorder(hoisted, false)).toBe(hoisted);
  });

  it('returns null when no input border combo is present', () => {
    // A round border without the borderLeft/Right/Bottom combo must not match.
    const other = 'let x={borderStyle:"round",marginTop:1};';
    expect(writeInputBoxBorder(other, true)).toBeNull();
  });

  it('removes the border from every box carrying the combo (older inline CC)', () => {
    const twice =
      'mainBox={borderColor:a,borderStyle:"round",borderLeft:!1,borderRight:!1,borderBottom:!0,width:"100%"};' +
      'editorBox={borderColor:b,borderStyle:"round",borderLeft:!1,borderRight:!1,borderBottom:!0,width:"100%"};';
    const result = writeInputBoxBorder(twice, true);
    expect(result).not.toBeNull();
    expect((result!.match(/borderStyle:undefined/g) || []).length).toBe(2);
    expect(result).not.toContain('borderStyle:"round"');
  });
});
