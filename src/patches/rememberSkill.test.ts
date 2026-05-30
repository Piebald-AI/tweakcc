import { describe, expect, it } from 'vitest';

import { writeRememberSkill } from './rememberSkill';

describe('writeRememberSkill', () => {
  it('inserts modern bundled remember skill inside the unconditional bundled skill initializer', () => {
    const input =
      'function O3(H){let{files:$}=H,q,K=H.getPromptForCommand;dU4.push(H)}' +
      'var dU4=[];' +
      'function yO9(){O3({name:"update-config",description:"Config",userInvocable:!0})}' +
      'function if9(){O3({name:"claude-in-chrome",description:"Chrome",userInvocable:!0})}' +
      'function Aw9(){yO9();if(iH$())if9()}';

    const result = writeRememberSkill(input);

    expect(result).not.toBeNull();
    expect(result).toContain('name:"remember"');
    expect(result).toContain('function yO9(){O3({name:"remember",description:');
    expect(result).toContain(
      '});O3({name:"update-config",description:"Config"'
    );
    expect(result).not.toContain('function if9(){O3({name:"remember"');
    expect(result).not.toContain('tweakccRegisterRememberSkill');
  });

  it('inserts remember skill in the legacy session-memory initializer path', () => {
    const input =
      '{reg({name:"claude-in-chrome",description:"Chrome"})}' +
      'function loadMemories(A){return []}function initRemember(){return}' +
      'var skillData=`# Remember Skill\nLegacy`;';

    const result = writeRememberSkill(input);

    expect(result).not.toBeNull();
    expect(result).toContain('name: "remember"');
    expect(result).toContain('let sessionMemFiles = loadMemories(null);');
    expect(result).toContain('return}var skillData=`# Remember Skill');
  });

  it('returns null when no skill registration anchor is present', () => {
    const result = writeRememberSkill('function unrelated(){return null}');

    expect(result).toBeNull();
  });
});
