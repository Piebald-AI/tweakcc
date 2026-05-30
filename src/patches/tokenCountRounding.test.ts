import { describe, expect, it } from 'vitest';

import { writeTokenCountRounding } from './tokenCountRounding';

describe('writeTokenCountRounding', () => {
  it('wraps only the token count expression in modern spinner code', () => {
    const input =
      'let FH=$?ZH:SH.current,lH=H7(zH),QH=J8(lH),aH=L&&!L.isIdle?L.progress?.tokenCount??0:AH+X,M$=M9(aH),dH=J?`${M$} tokens`:`${$$.arrowDown} ${M$} tokens`,xH=J8(dH),B$=[J9.createElement(k,{key:"tokens"},M$," tokens")];';

    const result = writeTokenCountRounding(input, 1000);

    expect(result).toContain('M$=M9(Math.round((aH)/1000)*1000)');
    expect(result).toContain('dH=J?`${M$} tokens`');
    expect(result).not.toContain('M9(Math.round((aH),dH=');
  });

  it('accepts the current config object shape without emitting object strings', () => {
    const input =
      'let FH=$?ZH:SH.current,lH=H7(zH),QH=J8(lH),aH=L&&!L.isIdle?L.progress?.tokenCount??0:AH+X,M$=M9(aH),dH=J?`${M$} tokens`:`${$$.arrowDown} ${M$} tokens`,xH=J8(dH),B$=[J9.createElement(k,{key:"tokens"},M$," tokens")];';

    const result = writeTokenCountRounding(input, {
      threshold: 1000,
    });

    expect(result).toContain('M$=M9(Math.round((aH)/1000)*1000)');
    expect(result).not.toContain('[object Object]');
  });

  it('defaults object config to 1000 when threshold is omitted', () => {
    const input =
      'let FH=$?ZH:SH.current,lH=H7(zH),QH=J8(lH),aH=L&&!L.isIdle?L.progress?.tokenCount??0:AH+X,M$=M9(aH),dH=J?`${M$} tokens`:`${$$.arrowDown} ${M$} tokens`,xH=J8(dH),B$=[J9.createElement(k,{key:"tokens"},M$," tokens")];';

    const result = writeTokenCountRounding(input, {});

    expect(result).toContain('M$=M9(Math.round((aH)/1000)*1000)');
    expect(result).not.toContain('[object Object]');
  });

  it('does not match across comma-separated initializers', () => {
    const input =
      'let M$=M9(aH),dH=J?`${M$} tokens`:`${$$.arrowDown} ${M$} tokens`,xH=J8(dH),tH=V&&R.current!==null&&(q||B.current!==null&&Z===null),j$=tH?H7(Math.max(1000,(q?C:B.current??C)-R.current)):null,D$=fr_(OH),uH=tH?`${q?"running":"ran"} tool for ${j$}`:Z==="thinking"?`${D$}${W}`:null,B$=[J9.createElement(k,{key:"tokens"},M$," tokens")];';

    const result = writeTokenCountRounding(input, 1000);

    expect(result).toBeTruthy();
    expect(result).not.toContain('D$=fr_(OH)/1000)*1000)');
    expect(result).toContain('D$=fr_(OH)');
  });
});
