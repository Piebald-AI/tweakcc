import { describe, it, expect } from 'vitest';
import { writeSuppressNativeInstallerWarning } from './suppressNativeInstallerWarning';

describe('writeSuppressNativeInstallerWarning', () => {
  const winPush =
    's.push({message:`Native installation exists but ${p} is not in your PATH. Add it by opening: System Properties.`,userActionRequired:!0,type:"path"})';
  const unixPush =
    's.push({message:`Native installation exists but ~/.local/bin is not in your PATH. Run: echo X >> ${g} && source ${g}`,userActionRequired:!0,type:"path"})';

  it('removes both the Windows and Unix startup warning pushes', () => {
    const input =
      'if(u){let p=a;' + winPush + '}else{let p=b,g=c;' + unixPush + '}';
    const result = writeSuppressNativeInstallerWarning(input);
    expect(result).not.toBeNull();
    expect(result).toBe('if(u){let p=a;}else{let p=b,g=c;}');
    expect(result).not.toContain('Native installation exists but');
  });

  it('removes the legacy npm-to-native startup banner', () => {
    const input =
      'log("Claude Code has switched from npm to native installer. Run `claude install` or see https://docs.anthropic.com/en/docs/claude-code/getting-started for more options.")';
    const result = writeSuppressNativeInstallerWarning(input);
    expect(result).not.toBeNull();
    expect(result).not.toContain('switched from npm to native installer');
  });

  it('returns null when no native installer warning is present', () => {
    expect(writeSuppressNativeInstallerWarning('unrelated content')).toBeNull();
  });
});
