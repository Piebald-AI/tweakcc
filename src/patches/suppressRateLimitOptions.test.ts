import { describe, it, expect } from 'vitest';
import { writeSuppressRateLimitOptions } from './suppressRateLimitOptions';

describe('writeSuppressRateLimitOptions', () => {
  it('nulls the callback at both renderer call sites (with and without agentDefinitions)', () => {
    const input =
      'X.jsx(A,{screen:st,streamingToolUses:cs,showAllInTranscript:vt,agentDefinitions:oe,onOpenRateLimitOptions:Ern,isLoading:Se});' +
      'X.jsx(B,{agentDefinitions:oe,streamingToolUses:Fhr,showAllInTranscript:vt,onOpenRateLimitOptions:Ern,isLoading:Se});';
    const result = writeSuppressRateLimitOptions(input);
    expect(result).not.toBeNull();
    expect(
      (result!.match(/onOpenRateLimitOptions:\(\)=>\{\}/g) || []).length
    ).toBe(2);
    expect(result).not.toContain('onOpenRateLimitOptions:Ern');
  });

  it('nulls call sites but preserves the props destructuring definition', () => {
    const def =
      'function C(e){let t=z.c(37),{screen:n,showAllInTranscript:u=!1,agentDefinitions:d,onOpenRateLimitOptions:p,hideLogo:f=!1}=e}';
    const call =
      'X.jsx(A,{showAllInTranscript:vt,agentDefinitions:oe,onOpenRateLimitOptions:Ern,isLoading:Se})';
    const result = writeSuppressRateLimitOptions(def + ';' + call);
    expect(result).not.toBeNull();
    expect(result).toContain('onOpenRateLimitOptions:p,hideLogo:f=!1');
    expect(
      (result!.match(/onOpenRateLimitOptions:\(\)=>\{\}/g) || []).length
    ).toBe(1);
  });

  it('is render-agnostic (matches a legacy createElement call site)', () => {
    const input =
      'A.createElement(B,{showAllInTranscript:u,agentDefinitions:d,onOpenRateLimitOptions:cb})';
    const result = writeSuppressRateLimitOptions(input);
    expect(result).not.toBeNull();
    expect(result).toContain('onOpenRateLimitOptions:()=>{}');
  });

  it('matches minified $-prefixed identifiers', () => {
    const input =
      'X.jsx($A,{showAllInTranscript:$vt,agentDefinitions:$oe,onOpenRateLimitOptions:$ne,isLoading:$se})';
    const result = writeSuppressRateLimitOptions(input);
    expect(result).not.toBeNull();
    expect(result).toContain('onOpenRateLimitOptions:()=>{}');
    expect(result).not.toContain('onOpenRateLimitOptions:$ne');
  });

  it('returns null when no call site is present', () => {
    expect(writeSuppressRateLimitOptions('no relevant content')).toBeNull();
  });

  it('nulls the CC 2.1.295 context-object opener but not the memo deps', () => {
    // Real CC 2.1.295 excerpt (chunk-7ytk1pm2): the message row reads the
    // opener from the prompt host; the memo cache compares the same member.
    const input =
      'if(ue[205]!==D?.armRateLimitAutoContinue||ue[206]!==D?.openRateLimitOptions)xx=(Ln,Un)=>e(Ns,{' +
      'sToolUseIDs:h,streamingToolUseIDs:jl,screen:C,canAnimate:Tp,onOpenRateLimitOptions:D?.openRateLimitOptions,onRateLimitAutoQueueContinue:D?.armRateLimitAutoContinue,latestBashOutput' +
      '},Mx);ue[206]=D?.openRateLimitOptions,ue[209]=xx;';
    const result = writeSuppressRateLimitOptions(input);
    expect(result).not.toBeNull();
    expect(result).toContain(
      'canAnimate:Tp,onOpenRateLimitOptions:()=>{},onRateLimitAutoQueueContinue:D?.armRateLimitAutoContinue,'
    );
    expect(result).toContain('ue[206]!==D?.openRateLimitOptions)');
    expect(result).toContain('ue[206]=D?.openRateLimitOptions,');
  });
});
