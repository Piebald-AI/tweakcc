import { describe, expect, it, vi } from 'vitest';

import { writeCustomSessionColors } from './customSessionColors';

const MOCK_COLOR_COMMAND =
  'async function Gs1(H,_,q){' +
  'let K=q.trim().toLowerCase();' +
  'if(Rs1.includes(K)){return H("Session color reset to default",{display:"system"}),null}' +
  'if(!aj.includes(K)){let T=aj.join(", ");return H(`Invalid color "${K}". Available colors: ${T}, default`,{display:"system"}),null}' +
  'let $=v_();return H(`Session color set to: ${K}`,{display:"system"}),null}';

const MOCK_RESOLVE =
  'function Ma_(H,_="cyan_FOR_SUBAGENTS_ONLY"){return H&&aj.includes(H)?KP[H]:_}';

const MOCK_TEXT_COMPONENT =
  'function L(H){let _=c(10),' +
  '{color:q,backgroundColor:K}=H,' +
  '[W]=jq(),Z=g2(W),' +
  'v=xV4(q,Z),y=K?Z[K]:void 0;' +
  'return createElement({color:v,backgroundColor:y})}';

const MOCK_RESET_ALIASES = 'Rs1=["default","reset","none","gray","grey"]';

const buildMockFile = (opts?: { noReject?: boolean; noReset?: boolean }) => {
  const reject = opts?.noReject
    ? ''
    : 'if(!aj.includes(K)){let T=aj.join(", ");return H(`Invalid color "${K}". Available colors: ${T}, default`,{display:"system"}),null}';

  const reset = opts?.noReset
    ? 'Rs1=["default","reset","none"]'
    : MOCK_RESET_ALIASES;

  return (
    'var aj=["red","blue"];var KP={red:"red_FOR_SUBAGENTS_ONLY"};' +
    `${reset};` +
    `async function Gs1(H,_,q){let K=q.trim().toLowerCase();` +
    `if(Rs1.includes(K)){return null}` +
    `${reject}` +
    `return null}` +
    MOCK_RESOLVE +
    MOCK_TEXT_COMPONENT
  );
};

describe('customSessionColors', () => {
  it('produces syntactically valid JS', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, {
      gray: '#808080',
      grey: '#808080',
    });

    expect(result).not.toBeNull();
    expect(() => new Function(result!)).not.toThrow();
  });

  it('removes the invalid color rejection branch', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, { gray: '#808080' });

    expect(result).not.toBeNull();
    expect(result).not.toContain('Invalid color');
  });

  it('injects custom color map into resolve function', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, { gray: '#808080' });

    expect(result).not.toBeNull();
    expect(result).toContain('"gray":"#808080"');
  });

  it('preserves built-in color resolution', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, { gray: '#808080' });

    expect(result).not.toBeNull();
    expect(result).toContain('aj.includes(H)?KP[H]');
  });

  it('passes through hex values', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, {});

    expect(result).not.toBeNull();
    expect(result).toContain('[0]==="#"');
  });

  it('passes through rgb values', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, {});

    expect(result).not.toBeNull();
    expect(result).toContain('.startsWith("rgb(")');
  });

  it('patches backgroundColor in Text component', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, {});

    expect(result).not.toBeNull();
    expect(result).toContain('y=K?xV4(K,Z):void 0');
    expect(result).not.toContain('y=K?Z[K]:void 0');
  });

  it('removes gray/grey from reset aliases when present', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, {});

    expect(result).not.toBeNull();
    expect(result).toContain('["default","reset","none"]');
    expect(result).not.toContain('"gray","grey"');
  });

  it('works when reset aliases already lack gray/grey', () => {
    const file = buildMockFile({ noReset: true });
    const result = writeCustomSessionColors(file, {});

    expect(result).not.toBeNull();
  });

  it('returns null when rejection pattern is missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = buildMockFile({ noReject: true });
    const result = writeCustomSessionColors(file, {});

    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('handles empty custom color map', () => {
    const file = buildMockFile();
    const result = writeCustomSessionColors(file, {});

    expect(result).not.toBeNull();
    expect(() => new Function(result!)).not.toThrow();
  });
});
