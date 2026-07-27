import { describe, expect, it } from 'vitest';
import { writeDisableServerManagedSettings } from './disableServerManagedSettings';

const makeEligibilityGate = (
  delimiter = '}',
  names = {
    fn: 'cEe',
    cache: 'lEe',
    overridePath: 'JOe',
    recordDecision: 'XOe',
    provider: 'Hn',
    gatewayConfig: 'Cy',
    isGatewayEnabled: 'B5e',
  }
) =>
  `${delimiter}function ${names.fn}(){if(${names.cache}!==void 0)return ${names.cache};if(${names.overridePath}())return ${names.cache}=${names.recordDecision}(!0);if(${names.provider}()==="gateway")return ${names.cache}=${names.recordDecision}(${names.isGatewayEnabled}(${names.gatewayConfig}()));if(${names.provider}()!=="firstParty")return ${names.cache}=${names.recordDecision}(!1);return ${names.cache}=${names.recordDecision}(!1)}`;

describe('writeDisableServerManagedSettings', () => {
  it('disables the Claude Code 2.1.220 remote settings eligibility gate', () => {
    const input =
      makeEligibilityGate() +
      'function JUs(){if(cEe())Pmt=new Promise(e=>{})}' +
      'function Vu_(){return `${Rs().BASE_API_URL}/api/claude_code/settings`}';

    const result = writeDisableServerManagedSettings(input);

    expect(result).not.toBeNull();
    expect(result).toContain('function cEe(){return !1;if(lEe!==void 0)');
    expect(result).toContain('function JUs(){if(cEe())');
    expect(result).toContain('/api/claude_code/settings');
  });

  it('supports the formatted Claude Code 2.1.220 syntax', () => {
    const input = `}
  function cEe() {
    if (lEe !== void 0) return lEe;
    if (JOe()) return (lEe = XOe(!0));
    if (Hn() === "gateway") return (lEe = XOe(B5e(Cy())));
    if (Hn() !== "firstParty") return (lEe = XOe(!1));
    return (lEe = XOe(!1));
  }
`;

    const result = writeDisableServerManagedSettings(input);

    expect(result).not.toBeNull();
    expect(result).toMatch(/function cEe\(\) \{\s*return !1;/);
  });

  it('matches independently of minified identifier names', () => {
    const input = makeEligibilityGate(';', {
      fn: '$a',
      cache: 'B$2',
      overridePath: 'Q0',
      recordDecision: 'r$9',
      provider: 'zZ',
      gatewayConfig: 'C$y',
      isGatewayEnabled: 'm4',
    });

    const result = writeDisableServerManagedSettings(input);

    expect(result).not.toBeNull();
    expect(result).toContain('function $a(){return !1;if(B$2!==void 0)');
  });

  it('returns the file unchanged when already patched', () => {
    const patched = writeDisableServerManagedSettings(makeEligibilityGate())!;

    expect(writeDisableServerManagedSettings(patched)).toBe(patched);
  });

  it('supports all efficient boundary delimiters', () => {
    for (const delimiter of [',', ';', '}', '{']) {
      const result = writeDisableServerManagedSettings(
        makeEligibilityGate(delimiter)
      );
      expect(result).not.toBeNull();
      expect(result).toContain('(){return !1;if(');
    }
  });

  it('does not patch a generic memoized boolean helper', () => {
    const input =
      '}function other(){if(cache!==void 0)return cache;if(hasOverride())return cache=record(!0);return cache=record(!1)}';

    expect(writeDisableServerManagedSettings(input)).toBeNull();
  });

  it('returns null for a partial remote settings gate', () => {
    const input =
      '}function cEe(){if(lEe!==void 0)return lEe;if(JOe())return lEe=XOe(!0);if(Hn()==="gateway")return true}';

    expect(writeDisableServerManagedSettings(input)).toBeNull();
  });
});
