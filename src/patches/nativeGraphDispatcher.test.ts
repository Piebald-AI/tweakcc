import { describe, expect, it } from 'vitest';

import type { NativeBunGraph, NativeBunModule } from '../nativeInstallation';
import { findChalkVar, findTextComponent, getReactVar } from './helpers';
import { PatchGroup } from './index';
import {
  applyPatchImplementationsToGraph,
  changedModuleSources,
  javaScriptModuleSources,
  textModuleSources,
} from './nativeGraphDispatcher';

const HEADER = '// @bun @bytecode\n// Version: 2.1.281\n';

const def = (id: string) => ({ id, name: id, group: PatchGroup.FEATURES });

const sources = (entries: Record<string, string>) =>
  new Map(Object.entries(entries));

describe('applyPatchImplementationsToGraph', () => {
  it('applies a writer to exactly the modules it rewrites', () => {
    const src = sources({
      '/a.js': 'var x="target";',
      '/b.js': 'var y="other";',
    });
    const out = applyPatchImplementationsToGraph(
      src,
      {
        demo: {
          fn: s =>
            s.includes('target') ? s.replace('target', 'patched') : null,
        },
      },
      [def('demo')]
    );
    expect(src.get('/a.js')).toBe('var x="patched";');
    expect(src.get('/b.js')).toBe('var y="other";');
    expect(out.results[0]).toMatchObject({ applied: true, failed: false });
    expect(out.owners.get('demo')).toEqual(['/a.js']);
  });

  it('fails only when no module matches, and treats "already patched" as success', () => {
    const src = sources({ '/a.js': 'done' });
    const out = applyPatchImplementationsToGraph(
      src,
      {
        missing: { fn: () => null },
        satisfied: { fn: s => s },
        throws: {
          fn: () => {
            throw new Error('boom');
          },
        },
      },
      [def('missing'), def('satisfied'), def('throws')]
    );
    expect(out.results[0]).toMatchObject({ applied: false, failed: true });
    expect(out.results[1]).toMatchObject({ applied: false, failed: false });
    expect(out.results[2]).toMatchObject({ applied: false, failed: true });
  });

  it('reports filtered and condition=false patches as skipped', () => {
    const src = sources({ '/a.js': 'x' });
    const out = applyPatchImplementationsToGraph(
      src,
      { a: { fn: s => s + '!' }, b: { fn: s => s + '?', condition: false } },
      [def('a'), def('b')],
      ['b']
    );
    expect(out.results.map(r => r.skipped)).toEqual([true, true]);
    expect(src.get('/a.js')).toBe('x');
  });

  it('runs entry-only patches against the entry module alone', () => {
    const src = sources({ '/chunk.js': 'a', '/cli': 'b' });
    applyPatchImplementationsToGraph(
      src,
      { prepend: { fn: s => 'START;' + s } },
      [def('prepend')],
      null,
      { entryModule: '/cli', entryOnly: new Set(['prepend']) }
    );
    expect(src.get('/chunk.js')).toBe('a');
    expect(src.get('/cli')).toBe('START;b');
  });

  it('silences writer console noise from non-owning modules', () => {
    const logged: unknown[] = [];
    const saved = console.error;
    console.error = (...args: unknown[]) => logged.push(args);
    try {
      applyPatchImplementationsToGraph(
        sources({ '/a.js': 'x', '/b.js': 'y' }),
        {
          noisy: {
            fn: () => {
              console.error('patch: noisy: failed to find pattern');
              return null;
            },
          },
        },
        [def('noisy')]
      );
    } finally {
      console.error = saved;
    }
    expect(logged).toHaveLength(0);
  });
});

describe('graph context (cross-module identifiers)', () => {
  const inkChunk =
    HEADER +
    'function n(o){let r=w(31),l,u,d;if(r[0]!==o)({color:d,backgroundColor:l,dimColor:u}=o)}export{n};';
  const consumer = HEADER + 'import{e}from"/$bunfs/root/jsx.js";var a=1;';

  it('imports the Text component under a collision-proof alias', () => {
    const src = sources({
      '/$bunfs/root/ink.js': inkChunk,
      '/$bunfs/root/c.js': consumer,
    });
    applyPatchImplementationsToGraph(
      src,
      {
        text: {
          fn: s =>
            s.includes('var a=1;')
              ? s + `var t=${findTextComponent(s)};`
              : null,
        },
      },
      [def('text')]
    );
    const patched = src.get('/$bunfs/root/c.js')!;
    expect(patched.startsWith(HEADER)).toBe(true);
    // Bun's standalone loader ignores imports added to an existing chunk, so
    // the symbol is reached through a global bridge the owner publishes.
    expect(patched).not.toContain('import{n');
    expect(patched).toContain('var t=globalThis.__tweakccExports.ink_js__n;');
    expect(src.get('/$bunfs/root/ink.js')).toContain(
      'Object.defineProperty(globalThis.__tweakccExports,"ink_js__n",{get:()=>n,'
    );
  });

  it('executes the bridge: the consumer sees the owner binding live', () => {
    const src = sources({
      '/$bunfs/root/ink.js': inkChunk.replace('export{n};', '') + 'var n2=1;',
      '/$bunfs/root/c.js': consumer,
    });
    // Owner exports under a different local name to prove the mapping.
    src.set(
      '/$bunfs/root/ink.js',
      src.get('/$bunfs/root/ink.js')! + 'export{n as Text};'
    );
    applyPatchImplementationsToGraph(
      src,
      {
        text: {
          fn: s =>
            s.includes('var a=1;')
              ? s + `var t=${findTextComponent(s)};`
              : null,
        },
      },
      [def('text')]
    );
    const owner = src
      .get('/$bunfs/root/ink.js')!
      .replace(/export\{[^}]*\};?/, '')
      .replace(/w\(31\)/, '[]');
    const consumerCode = src
      .get('/$bunfs/root/c.js')!
      .replace(/import\{[^}]*\}from"[^"]*";/g, '');
    const run = new Function(`${owner};${consumerCode};return t;`);
    expect(typeof run()).toBe('function');
  });

  it('traces a chalk instance through the chunk it is imported from', () => {
    const calls = 'ue.red("a");ue.bold.cyan("b");'.repeat(6);
    const src = sources({
      '/$bunfs/root/chalk.js': HEADER + 'var ue={};export{ue};',
      '/$bunfs/root/user.js':
        HEADER + `import{ue}from"/$bunfs/root/chalk.js";${calls}`,
      '/$bunfs/root/c.js': consumer,
    });
    applyPatchImplementationsToGraph(
      src,
      {
        chalk: {
          fn: s =>
            s.includes('var a=1;') ? s + `${findChalkVar(s)}.red("x");` : null,
        },
      },
      [def('chalk')]
    );
    expect(src.get('/$bunfs/root/c.js')).toContain(
      'globalThis.__tweakccExports.chalk_js__ue.red("x");'
    );
    expect(src.get('/$bunfs/root/chalk.js')).toContain('{get:()=>ue,');
  });

  it('builds a getter-backed React shim from piecemeal React exports', () => {
    const react =
      HEADER +
      'var s={H:null};var g,T,Wc;D=()=>{T=function(t){return s.H.useRef(t)},g=function(t){return s.H.useState(t)},Wc=function(t,e,n){var r,o={},f=null;if(e!=null)r=1}};export{T,g,Wc};';
    const src = sources({
      '/$bunfs/root/react.js': react,
      '/$bunfs/root/c.js': consumer,
    });
    applyPatchImplementationsToGraph(
      src,
      {
        react: {
          fn: s => {
            if (!s.includes('var a=1;')) return null;
            const R = getReactVar(s);
            return s + `${R}.useState(0);${R}.createElement("b",null);`;
          },
        },
      },
      [def('react')]
    );
    const patched = src.get('/$bunfs/root/c.js')!;
    expect(patched).toContain('var $tcc_React={');
    expect(patched).toContain(
      'get useState(){return globalThis.__tweakccExports.react_js__g}'
    );
    expect(patched).toContain(
      'get createElement(){return globalThis.__tweakccExports.react_js__Wc}'
    );
    expect(src.get('/$bunfs/root/react.js')).toContain(
      '"react_js__g",{get:()=>g,'
    );
    // The shim must evaluate lazily: React's exports are assigned later.
    expect(patched).not.toMatch(/useState:globalThis/);
  });

  it('uses import.meta.require inside code-split chunks', async () => {
    const { getRequireFuncName } = await import('./helpers');
    const src = sources({ '/$bunfs/root/c.js': consumer });
    applyPatchImplementationsToGraph(
      src,
      { req: { fn: s => s + `${getRequireFuncName(s)}("fs");` } },
      [def('req')]
    );
    expect(src.get('/$bunfs/root/c.js')).toContain('import.meta.require("fs")');
  });
});

describe('graph source helpers', () => {
  const module = (
    name: string,
    source: string,
    loader: number
  ): NativeBunModule => ({
    index: 0,
    name,
    contents: Buffer.from(source),
    sourcemap: Buffer.alloc(0),
    bytecode: Buffer.alloc(0),
    moduleInfo: Buffer.alloc(0),
    bytecodeOriginPath: Buffer.alloc(0),
    encoding: 1,
    loader,
    moduleFormat: 1,
    side: 0,
    isEntryPoint: false,
  });
  const graph: NativeBunGraph = {
    modules: [
      module('/a.js', 'js', 1),
      module('/SKILL.md', '# skill', 13),
      module('/x.md.zst', 'zz', 5),
    ],
    entryPointIndex: 0,
    flags: 0,
    compileExecArgv: Buffer.alloc(0),
    moduleRecordSize: 52,
  };

  it('separates JavaScript from embedded text modules', () => {
    expect([...javaScriptModuleSources(graph).keys()]).toEqual(['/a.js']);
    expect([...textModuleSources(graph).keys()]).toEqual(['/SKILL.md']);
  });

  it('reports only modules whose source changed', () => {
    const changed = changedModuleSources(
      graph,
      new Map([
        ['/a.js', 'js'],
        ['/SKILL.md', '# edited'],
      ])
    );
    expect([...changed.keys()]).toEqual(['/SKILL.md']);
  });
});
