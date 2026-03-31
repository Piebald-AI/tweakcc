import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeCustomTools } from './customTools';
import {
  findBuildToolFunc,
  getCwdFuncName,
  clearReactVarCache,
  clearRequireFuncNameCache,
} from './helpers';
import type { CustomTool } from '../types';

// ============================================================================
// SHARED FIXTURES
// ============================================================================

// Minimal synthetic minified bundle satisfying all helpers writeCustomTools uses.
// Each piece is crafted to match exactly one helper's detection pattern.
const MOCK_BASE =
  // getModuleLoaderFunction (NPM bundle): shortest 3-param arrow function
  'var T=(H,$,A)=>{A=H!=null?' +
  // getReactModuleNameNonBun: var X=Y((Z)=>{var W=Symbol.for("react.element")
  'var rM=X((Z)=>{var W=Symbol.for("react.element")' +
  // getReactVar non-bun: [^$\w]R=T(rM(),1)  — semicolon is the non-word prefix
  ';R=T(rM(),1)' +
  // findTextComponent: function NAME({color:A,backgroundColor:B,dimColor:C=!1,bold:D=!1,...})
  'function Tx({color:a,backgroundColor:b,dimColor:c=!1,bold:d=!1}){}' +
  // findBoxComponent method 2: function NAME({children:T,flexWrap:F...}){...createElement("ink-box"...}
  'function Bx({children:ch,flexWrap:fw}){return R.createElement("ink-box",null,ch)}' +
  // getCwdFuncName three-step chain
  'var ST={cwd:"/tmp"};' +
  'function gCS(){return ST.cwd}' +
  'function pwdF(){return gCS()}' +
  'function getCwdFn(){try{return pwdF()}catch(e){return"/"}}' +
  // findBuildToolFunc: function NAME(PARAM){return{...DEFAULTS,userFacingName:()=>PARAM.name,...PARAM}}
  'const DEF={isEnabled:()=>!0};function bT(D1){return{...DEF,userFacingName:()=>D1.name,...D1}}';

// Strategy B fixture: original one-liner tool aggregation
const MOCK_STRATEGY_B = MOCK_BASE + 'let TOOLS=agg(ctx,state.tools,opts),x=1;';

// Strategy A fixture: toolsets patch has already rewritten into if/else
const MOCK_STRATEGY_A =
  MOCK_BASE +
  'if(ts){TOOLS=agg(ctx,state.tools,opts).filter(t=>ts.includes(t.name));' +
  '} else {TOOLS=agg(ctx,state.tools,opts);}let REST=1;';

const MINIMAL_TOOL: CustomTool = {
  name: 'MyTool',
  description: 'A test tool',
  parameters: {
    msg: { type: 'string', description: 'The message', required: true },
  },
  command: 'echo {{msg}}',
};

const OPTIONAL_PARAM_TOOL: CustomTool = {
  name: 'OptTool',
  description: 'Tool with optional param',
  parameters: {
    flag: { type: 'boolean', description: 'A flag', required: false },
  },
  command: 'run --flag={{flag}}',
  shell: 'bash',
  timeout: 5000,
  workingDir: '/tmp/work',
  env: { MY_VAR: 'hello' },
};

// ============================================================================
// HELPER TESTS
// ============================================================================

describe('findBuildToolFunc', () => {
  it('detects buildTool in the mock bundle', () => {
    expect(findBuildToolFunc(MOCK_BASE)).toBe('bT');
  });

  it('handles different variable names', () => {
    const code =
      'function xY$(p1){return{...DEFS,userFacingName:()=>p1.name,...p1}}';
    expect(findBuildToolFunc(code)).toBe('xY$');
  });

  it('returns undefined when absent', () => {
    expect(findBuildToolFunc('const x=1;')).toBeUndefined();
  });
});

describe('getCwdFuncName', () => {
  it('detects the full three-step chain', () => {
    expect(getCwdFuncName(MOCK_BASE)).toBe('getCwdFn');
  });

  it('falls back to pwd when no try-catch wrapper exists', () => {
    const code =
      'var ST={cwd:"/x"};function gCS(){return ST.cwd}function pwdF(){return gCS()}';
    expect(getCwdFuncName(code)).toBe('pwdF');
  });

  it('falls back to getCwdState when no pwd wrapper exists either', () => {
    const code = 'var ST={cwd:"/x"};function gCS(){return ST.cwd}';
    expect(getCwdFuncName(code)).toBe('gCS');
  });

  it('returns undefined when getCwdState is absent', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(getCwdFuncName('const x=1;')).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});

// ============================================================================
// writeCustomTools TESTS
// ============================================================================

describe('writeCustomTools', () => {
  beforeEach(() => {
    clearReactVarCache();
    clearRequireFuncNameCache();
  });

  afterEach(() => {
    clearReactVarCache();
    clearRequireFuncNameCache();
  });

  describe('no-op cases', () => {
    it('returns the original file when customTools is empty', () => {
      expect(writeCustomTools(MOCK_STRATEGY_B, [])).toBe(MOCK_STRATEGY_B);
    });
  });

  describe('collision guard', () => {
    it('returns null and logs error for a built-in tool name', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [
          { ...MINIMAL_TOOL, name: 'Bash' },
        ]);
        expect(result).toBeNull();
        expect(err).toHaveBeenCalledWith(expect.stringContaining('"Bash"'));
      } finally {
        err.mockRestore();
      }
    });
  });

  describe('missing helper patterns', () => {
    it('returns null when buildTool is not found', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const noBuildTool = MOCK_STRATEGY_B.replace(
          /function bT\(D1\)\{return\{\.\.\.DEF,userFacingName:\(\)=>D1\.name,\.\.\.D1\}\}/,
          ''
        );
        expect(writeCustomTools(noBuildTool, [MINIMAL_TOOL])).toBeNull();
        expect(err).toHaveBeenCalledWith(expect.stringContaining('buildTool'));
      } finally {
        err.mockRestore();
        warn.mockRestore();
      }
    });

    it('returns null when the tool aggregation pattern is not found', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const noAgg = MOCK_BASE + 'const x=1;';
        expect(writeCustomTools(noAgg, [MINIMAL_TOOL])).toBeNull();
        expect(err).toHaveBeenCalledWith(
          expect.stringContaining('tool aggregation pattern')
        );
      } finally {
        err.mockRestore();
        warn.mockRestore();
      }
    });
  });

  describe('Strategy B — original code injection', () => {
    it('produces a non-null result', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(
          writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])
        ).not.toBeNull();
      } finally {
        warn.mockRestore();
      }
    });

    it('spreads custom tools into the tool aggregation variable', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain(
          'let TOOLS=[...agg(ctx,state.tools,opts),...['
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('calls buildTool (bT) to construct the custom tool', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain('bT({');
      } finally {
        warn.mockRestore();
      }
    });

    it('embeds the tool name in the generated object', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain('"MyTool"');
      } finally {
        warn.mockRestore();
      }
    });

    it('uses React.createElement (R) with Text (Tx) and Box (Bx) for rendering', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain('R.createElement(Bx,');
        expect(result).toContain('R.createElement(Tx,');
      } finally {
        warn.mockRestore();
      }
    });

    it('uses the detected cwd function for workingDir', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain('getCwdFn()');
      } finally {
        warn.mockRestore();
      }
    });

    it('uses explicit workingDir when provided', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [
          OPTIONAL_PARAM_TOOL,
        ])!;
        expect(result).toContain('"/tmp/work"');
      } finally {
        warn.mockRestore();
      }
    });

    it('delegates checkPermissions to BashTool', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain(
          'context.options.tools.find(t=>t.name==="Bash")'
        );
        expect(result).toContain('bashTool.checkPermissions(');
      } finally {
        warn.mockRestore();
      }
    });

    it('includes validateInput for required parameters', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain('"msg is required"');
        expect(result).toContain('"msg must be a string"');
      } finally {
        warn.mockRestore();
      }
    });

    it('does not add required check for optional params', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [
          OPTIONAL_PARAM_TOOL,
        ])!;
        expect(result).not.toContain('"flag is required"');
        expect(result).toContain('"flag must be a boolean"');
      } finally {
        warn.mockRestore();
      }
    });

    it('injects the command template into the generated code', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_B, [MINIMAL_TOOL])!;
        expect(result).toContain('"echo {{msg}}"');
      } finally {
        warn.mockRestore();
      }
    });

    it('handles multiple tools', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const tool2: CustomTool = {
          name: 'SecondTool',
          description: 'Another tool',
          parameters: {},
          command: 'ls',
        };
        const result = writeCustomTools(MOCK_STRATEGY_B, [
          MINIMAL_TOOL,
          tool2,
        ])!;
        expect(result).toContain('"MyTool"');
        expect(result).toContain('"SecondTool"');
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('Strategy A — post-toolsets injection', () => {
    it('produces a non-null result', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(
          writeCustomTools(MOCK_STRATEGY_A, [MINIMAL_TOOL])
        ).not.toBeNull();
      } finally {
        warn.mockRestore();
      }
    });

    it('appends custom tools to the toolset variable after the else block', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_A, [MINIMAL_TOOL])!;
        // The injection code TOOLS=[...TOOLS,...[...]] should appear before `let REST`
        expect(result).toContain('TOOLS=[...TOOLS,...[');
        const injectionIdx = result.indexOf('TOOLS=[...TOOLS,...[');
        const letRestIdx = result.indexOf('let REST');
        expect(injectionIdx).toBeLessThan(letRestIdx);
      } finally {
        warn.mockRestore();
      }
    });

    it('does NOT use the Strategy B pattern when Strategy A matches', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_A, [MINIMAL_TOOL])!;
        // Strategy B would produce `let TOOLS=[...agg(...` — should not appear
        expect(result).not.toContain('let TOOLS=[...agg(');
      } finally {
        warn.mockRestore();
      }
    });

    it('still uses buildTool in Strategy A', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = writeCustomTools(MOCK_STRATEGY_A, [MINIMAL_TOOL])!;
        expect(result).toContain('bT({');
      } finally {
        warn.mockRestore();
      }
    });
  });
});
