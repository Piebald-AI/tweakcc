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
});
