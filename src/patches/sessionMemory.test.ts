import { describe, expect, it } from 'vitest';

import { writeSessionMemory } from './sessionMemory';

describe('writeSessionMemory', () => {
  // Claude Code >= 2.1.217 refactored the session-memory config: the extraction
  // gate moved to the `querySource:"extract_memories"` path, the `# Session Title`
  // landmark and the token-limit / update-threshold constants were removed, and
  // `tengu_session_memory` now survives only as telemetry event names
  // (tengu_session_memory_rated, ...). The legacy-fatal branch keys off whether
  // the *legacy extraction gate* was patched, not whether that substring appears.
  it('applies on refactored CC (new querySource path + extract-mode rewrite) even though the token-limit patterns are gone and tengu_session_memory survives as telemetry', () => {
    const input =
      // telemetry-only occurrence of the substring (the false-positive trigger)
      'O("tengu_session_memory_rated",{rating:1});' +
      // new extraction path: anchor + passport_quail gate that patchExtraction strips
      'D8({querySource:"extract_memories",forkLabel:"extract_memories"});' +
      'if(!Qz("tengu_passport_quail",!1))return;' +
      // extract-mode gate, force-enabled to {return!0} (present in real 2.1.217)
      'function JXn(){if(!Ke("tengu_passport_quail",!1))return!1;return!un()||Ke("tengu_slate_thimble",!1)}' +
      // past-sessions fallback anchor (coral_fern gate already removed upstream)
      'if(Wf("tengu_session_search_toggled",!1)){}';

    const result = writeSessionMemory(input);

    // Core feature must still apply, and both force-enable rewrites must run:
    expect(result).not.toBeNull();
    expect(result).toContain('function JXn(){return!0}');
    expect(result).not.toContain('tengu_passport_quail');
    expect(result).not.toContain('tengu_slate_thimble');
  });

  it('does not treat a telemetry event wrapped in a returning function as the legacy extraction gate', () => {
    const input =
      // near-match: a returning fn whose string is tengu_session_memory_RATED,
      // not the real gate `("tengu_session_memory",!1)`
      'function zz(){return O("tengu_session_memory_rated",{rating:1})}' +
      'D8({querySource:"extract_memories",forkLabel:"extract_memories"});' +
      'if(!Qz("tengu_passport_quail",!1))return;' +
      'if(Wf("tengu_session_search_toggled",!1)){}';

    const result = writeSessionMemory(input);

    // The near-match must not flip usedLegacyExtraction, so the missing
    // token-limit pattern stays non-fatal and the feature still applies.
    expect(result).not.toBeNull();
    expect(result).not.toContain('tengu_passport_quail');
  });

  // Legacy fixture (CC <= ~2.1.158 shapes): synthesized to satisfy the token-limit
  // and update-threshold regexes, which no longer exist in current bundles.
  it('injects the configurable env-var limits on legacy CC where the patterns are present', () => {
    const input =
      'function l28(){return $_("tengu_session_memory",!1)}' +
      'if(Wf("tengu_session_search_toggled",!1)){}' +
      'let cfg={x=2000,y=12000;z="# Session Title"};' +
      'let up={minimumMessageTokensToInit:1e4,minimumTokensBetweenUpdate:5000,toolCallsBetweenUpdates:3};';

    const result = writeSessionMemory(input);

    expect(result).not.toBeNull();
    expect(result).toContain('CC_SM_PER_SECTION_TOKENS');
    expect(result).toContain(
      'minimumMessageTokensToInit:Number(process.env.CC_SM_MINIMUM_MESSAGE_TOKENS_TO_INIT'
    );
    expect(result).toContain(
      'toolCallsBetweenUpdates:Number(process.env.CC_SM_TOOL_CALLS_BETWEEN_UPDATES'
    );
    // the consumed object delimiters must be restored, keeping the literal valid:
    // `...??1e4),minimumTokensBetweenUpdate...??3)}` (comma between props, closing brace)
    expect(result).toContain('??1e4),minimumTokensBetweenUpdate:Number(');
    expect(result).toContain('??5000),toolCallsBetweenUpdates:Number(');
    expect(result).toContain('??3)}');
  });

  it('stays fatal on genuine legacy CC extraction gate when the token-limit pattern is absent', () => {
    const input =
      // legacy extraction fn-gate (patchExtraction branch 1)
      'function l28(){return $_("tengu_session_memory",!1)}' +
      'if(Wf("tengu_session_search_toggled",!1)){}';

    // Legacy bundles are expected to carry the token-limit pattern; its absence
    // here is a real breakage and must remain fatal (preserves #761 behavior).
    expect(writeSessionMemory(input)).toBeNull();
  });

  it('returns null when no session-memory extraction anchor is present', () => {
    expect(writeSessionMemory('function foo(){return 1}')).toBeNull();
  });

  // CC 2.1.218 replaced the old `toolCallsBetweenUpdates:3` config field with a
  // GrowthBook-gated cadence `getFlag("tengu_bramble_lintel",null)??1`. It is the
  // one update-cadence knob that survived the memory-model refactor, so the
  // CC_SM_TOOL_CALLS_BETWEEN_UPDATES env var must re-anchor onto it (preserving
  // the flag's precedence and its numeric default).
  it('re-anchors CC_SM_TOOL_CALLS_BETWEEN_UPDATES onto the 2.1.218 tengu_bramble_lintel cadence flag', () => {
    const input =
      // refactored extraction path (keeps usedLegacyExtraction false)
      'D8({querySource:"extract_memories",forkLabel:"extract_memories"});' +
      'if(!Qz("tengu_passport_quail",!1))return;' +
      'function JXn(){if(!Ke("tengu_passport_quail",!1))return!1;return!un()||Ke("tengu_slate_thimble",!1)}' +
      'if(Wf("tengu_session_search_toggled",!1)){}' +
      // new cadence construct (the surviving knob)
      'let g=Xe("tengu_bramble_lintel",null)??1,y=mvo(p);';

    const result = writeSessionMemory(input);

    expect(result).not.toBeNull();
    // flag precedence preserved; only the numeric default becomes env-configurable.
    // Assert through the trailing continuation so a comma-eating mutation is caught.
    expect(result).toContain(
      'Xe("tengu_bramble_lintel",null)??Number(process.env.CC_SM_TOOL_CALLS_BETWEEN_UPDATES??1),y=mvo(p)'
    );
  });

  it('preserves the upstream cadence default when re-anchoring the tengu_bramble_lintel flag', () => {
    // A future bundle could ship a different numeric default; the patch must
    // carry it through rather than hard-coding 1.
    const input =
      'D8({querySource:"extract_memories",forkLabel:"extract_memories"});' +
      'if(!Qz("tengu_passport_quail",!1))return;' +
      'if(Wf("tengu_session_search_toggled",!1)){}' +
      'let g=Xe("tengu_bramble_lintel",null)??4,y=mvo(p);';

    const result = writeSessionMemory(input);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'Xe("tengu_bramble_lintel",null)??Number(process.env.CC_SM_TOOL_CALLS_BETWEEN_UPDATES??4),y=mvo(p)'
    );
  });

  it('re-anchors only tengu_bramble_lintel, leaving other GrowthBook cadence flags untouched', () => {
    // Guards against over-broadening the flag literal: an unrelated
    // `("tengu_*",null)??<n>` read must not be rewritten.
    const input =
      'D8({querySource:"extract_memories",forkLabel:"extract_memories"});' +
      'if(!Qz("tengu_passport_quail",!1))return;' +
      'if(Wf("tengu_session_search_toggled",!1)){}' +
      'let h=Xe("tengu_unrelated_flag",null)??2,g=Xe("tengu_bramble_lintel",null)??1;';

    const result = writeSessionMemory(input);

    expect(result).not.toBeNull();
    // the unrelated flag keeps its raw default
    expect(result).toContain('Xe("tengu_unrelated_flag",null)??2,');
    expect(result).not.toContain(
      'tengu_unrelated_flag",null)??Number(process.env'
    );
    // and the real cadence flag is still re-anchored
    expect(result).toContain(
      'Xe("tengu_bramble_lintel",null)??Number(process.env.CC_SM_TOOL_CALLS_BETWEEN_UPDATES??1)'
    );
  });

  it('does not re-anchor a tengu_bramble_lintel cadence with a non-integer default', () => {
    // The lookahead `(?![\d.eExX])` must reject float/exponent/hex defaults
    // rather than splitting them (e.g. `??1.5` -> `??Number(...??1).5`).
    const input =
      'D8({querySource:"extract_memories",forkLabel:"extract_memories"});' +
      'if(!Qz("tengu_passport_quail",!1))return;' +
      'if(Wf("tengu_session_search_toggled",!1)){}' +
      'let g=Xe("tengu_bramble_lintel",null)??1.5,y=mvo(p);';

    const result = writeSessionMemory(input);

    expect(result).not.toBeNull();
    // left untouched: no partial-number corruption
    expect(result).toContain('Xe("tengu_bramble_lintel",null)??1.5,');
    expect(result).not.toContain('CC_SM_TOOL_CALLS_BETWEEN_UPDATES');
  });
});
