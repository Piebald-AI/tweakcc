import type { NativeBunGraph, NativeBunModule } from '../nativeInstallation';
import {
  beginGraphContext,
  bridgePublications,
  endGraphContext,
  enterGraphModule,
  finishGraphModule,
  leaveGraphModule,
} from './graphContext';
import { clearCaches } from './helpers';
import type { PatchResult } from './index';

/**
 * Code-split native Claude Code builds (2.1.2xx+) ship their JavaScript as
 * ~2,000 Bun modules instead of one claude.js. Each patch writer was written
 * against the single bundle and only understands a string of source, so on a
 * graph we let every writer find its own owner: it is run against each
 * JavaScript module in turn, and the modules it actually rewrites are the
 * modules it owns. A writer's own anchors (unique strings such as
 * `tengu_external_editor_hint_shown`) are therefore the single source of
 * truth for ownership; there is no second hand-written "candidate" predicate
 * to drift out of sync with the writer, which is what made the previous
 * approach report "Module ownership is ambiguous: found 64" for patches whose
 * writer only ever matches one module.
 */

/** Minimal structural view of a patch implementation. */
export interface GraphPatchImplementation {
  fn: (content: string) => string | null;
  condition?: boolean;
}

/** Minimal structural view of a patch definition. */
export interface GraphPatchDefinition {
  id: string;
  name: string;
  group: PatchResult['group'];
  description?: string;
}

/**
 * Decodes a JavaScript module by Bun's serialized string encoding:
 * 0 = UTF-8, 1 = Latin-1, 2 = UTF-16LE (Bun 1.4.1 reused tag 2 for UTF-16).
 * Replaced modules are always written back as UTF-8 with tag 0.
 */
const decodeJavaScript = (module: NativeBunModule): string => {
  if (module.encoding === 2) return module.contents.toString('utf16le');
  if (module.encoding === 1) return module.contents.toString('latin1');
  return module.contents.toString('utf8');
};

/** How a module's working source was read (text modules: UTF-8 as before). */
const decodeModule = (module: NativeBunModule): string =>
  module.loader === 1
    ? decodeJavaScript(module)
    : module.contents.toString('utf8');

/** JavaScript (loader 1) module sources of a graph, in graph order. */
export const javaScriptModuleSources = (
  graph: NativeBunGraph
): Map<string, string> =>
  new Map(
    graph.modules
      .filter(module => module.loader === 1)
      .map(module => [module.name, decodeJavaScript(module)])
  );

/**
 * Plain-text modules (Bun loader 13: skill/reference `.md` files embedded
 * uncompressed). System prompts for skills live here rather than in JS.
 * `.md.zst` modules are compressed and are not included.
 */
export const textModuleSources = (graph: NativeBunGraph): Map<string, string> =>
  new Map(
    graph.modules
      .filter(module => module.loader === 13)
      .map(module => [module.name, module.contents.toString('utf8')])
  );

/** A copy of `graph` whose module contents reflect `sources`. */
export const withModuleSources = (
  graph: NativeBunGraph,
  sources: ReadonlyMap<string, string>
): NativeBunGraph => ({
  ...graph,
  modules: graph.modules.map(module => {
    const source = sources.get(module.name);
    return source === undefined
      ? module
      : { ...module, contents: Buffer.from(source, 'utf8') };
  }),
});

/** Modules whose working source differs from the original graph (as UTF-8). */
export const changedModuleSources = (
  graph: NativeBunGraph,
  sources: ReadonlyMap<string, string>
): Map<string, Buffer> => {
  const changed = new Map<string, Buffer>();
  for (const module of graph.modules) {
    const source = sources.get(module.name);
    if (source === undefined || source === decodeModule(module)) continue;
    changed.set(module.name, Buffer.from(source, 'utf8'));
  }
  return changed;
};

/**
 * Runs `fn` with console output suppressed. Writers log "failed to find"
 * whenever their anchor is absent, which is the expected outcome for all but
 * one of ~2,000 modules; the dispatcher reports the real outcome itself.
 */
const quietly = <T>(fn: () => T): T => {
  const saved = [console.log, console.error, console.warn] as const;
  const noop = () => {};
  console.log = noop;
  console.error = noop;
  console.warn = noop;
  try {
    return fn();
  } finally {
    [console.log, console.error, console.warn] = saved;
  }
};

export interface GraphPatchOutcome {
  results: PatchResult[];
  /** Module names each applied patch rewrote, for diagnostics and tests. */
  owners: Map<string, string[]>;
}

/** Options for {@link applyPatchImplementationsToGraph}. */
export interface GraphPatchOptions {
  /** Name of the graph's entry-point module. */
  entryModule?: string;
  /**
   * Patches that install process-wide startup code at the top of whatever
   * source they are given (e.g. a stdout wrapper). On a graph they must run
   * against the entry module only, or they would be installed once per
   * module.
   */
  entryOnly?: ReadonlySet<string>;
}

/**
 * Applies `definitions` (in order) across the JavaScript modules in `sources`,
 * mutating `sources` in place. A patch:
 * - applies to every module its writer rewrites;
 * - is satisfied (applied: false, not failed) when its writer matches but the
 *   module is already in the desired state;
 * - fails only when its writer matches no module at all.
 * A writer that throws on one module is treated as not matching there.
 */
export const applyPatchImplementationsToGraph = (
  sources: Map<string, string>,
  implementations: Readonly<Record<string, GraphPatchImplementation>>,
  definitions: readonly GraphPatchDefinition[],
  patchFilter?: readonly string[] | null,
  options: GraphPatchOptions = {}
): GraphPatchOutcome => {
  const results: PatchResult[] = [];
  const owners = new Map<string, string[]>();
  beginGraphContext(sources);
  try {
    for (const def of definitions) {
      results.push(
        applyOne(sources, implementations, def, patchFilter, owners, options)
      );
    }
    // Owner modules publish the symbols that patched modules now reach
    // through the global bridge (see graphContext.ts for why not `import`).
    for (const [module, code] of bridgePublications()) {
      const source = sources.get(module);
      if (source === undefined) continue;
      // Keep a trailing `export{…};` last: other tooling (and Bun's own
      // layout) expects the export list to end the module.
      const trailingExport = source.match(/export\{[^}]*\};?\s*$/);
      sources.set(
        module,
        trailingExport?.index !== undefined
          ? source.slice(0, trailingExport.index) +
              code +
              '\n' +
              source.slice(trailingExport.index)
          : source + code
      );
    }
  } finally {
    endGraphContext();
  }
  return { results, owners };
};

const applyOne = (
  sources: Map<string, string>,
  implementations: Readonly<Record<string, GraphPatchImplementation>>,
  def: GraphPatchDefinition,
  patchFilter: readonly string[] | null | undefined,
  owners: Map<string, string[]>,
  options: GraphPatchOptions
): PatchResult => {
  {
    const impl = implementations[def.id];
    const base = {
      id: def.id,
      name: def.name,
      group: def.group,
      description: def.description,
    };
    if (
      !impl ||
      (patchFilter && !patchFilter.includes(def.id)) ||
      impl.condition === false
    ) {
      return { ...base, applied: false, skipped: true };
    }

    const entryOnly = options.entryOnly?.has(def.id) ?? false;
    if (entryOnly && !options.entryModule) {
      return {
        ...base,
        applied: false,
        failed: true,
        details: 'The entry-point module could not be identified.',
      };
    }

    const rewritten: string[] = [];
    let matched = false;
    for (const [name, source] of sources) {
      if (entryOnly && name !== options.entryModule) continue;
      clearCaches();
      enterGraphModule(name);
      let next: string | null = null;
      try {
        next = quietly(() => impl.fn(source));
        if (next !== null && next !== source) next = finishGraphModule(next);
      } catch {
        next = null;
      } finally {
        leaveGraphModule();
      }
      if (next === null) continue;
      matched = true;
      if (next !== source) {
        sources.set(name, next);
        rewritten.push(name);
      }
    }
    clearCaches();

    if (rewritten.length > 0) {
      owners.set(def.id, rewritten);
      return {
        ...base,
        applied: true,
        failed: false,
        details: `Updated ${rewritten.length} module(s).`,
      };
    }
    if (matched) return { ...base, applied: false, failed: false };
    return {
      ...base,
      applied: false,
      failed: true,
      details: 'Pattern not found in any module.',
    };
  }
};
