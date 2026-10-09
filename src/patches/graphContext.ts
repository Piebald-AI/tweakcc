/**
 * Cross-module identifier resolution for code-split native builds.
 *
 * In a code-split Claude Code build every chunk is an ES module that imports
 * the minified names it uses from other chunks. Legacy patch writers locate
 * shared symbols (Ink's Text/Box components, the chalk instance, React) by
 * scanning the file they are given. When the module being patched does not
 * itself define the symbol, the helpers ask this context to find it elsewhere
 * in the graph.
 *
 * The symbol is then reached through a global bridge rather than a new
 * `import`: Bun's standalone module loader links a chunk's imports from its
 * precompiled module records, so an `import` statement added to an existing
 * chunk parses but its binding stays undefined at runtime ("$tcc_s is not
 * defined"). Instead, the owning module publishes a getter —
 *   Object.defineProperty(globalThis.__tweakccExports,"chunk_s",{get:()=>s})
 * — and the patched module reads `globalThis.__tweakccExports.chunk_s` when
 * the patched code runs (a live binding, and immune to local shadowing).
 */

export interface GraphImport {
  /** Name the owning module exports. */
  exported: string;
  /** Module that exports it. */
  module: string;
}

/** Global object the bridge publishes into. */
export const BRIDGE = 'globalThis.__tweakccExports';

interface GraphContext {
  sources: ReadonlyMap<string, string>;
  /** Module currently being patched. */
  current: string | null;
  /** bridge key → symbol, requested while patching `current`. */
  imports: Map<string, GraphImport & { local: string }>;
  /** Snippets to place after the imports of `current`, keyed for dedupe. */
  preludes: Map<string, string>;
  /** owner module → (bridge key → owner-local name), for patched consumers. */
  publishes: Map<string, Map<string, string>>;
  /** Graph-wide lookups, computed once per context. */
  cache: Map<string, unknown>;
  exportIndex: Map<string, string> | null;
}

let context: GraphContext | null = null;

export const beginGraphContext = (sources: ReadonlyMap<string, string>) => {
  context = {
    sources,
    current: null,
    imports: new Map(),
    preludes: new Map(),
    publishes: new Map(),
    cache: new Map(),
    exportIndex: null,
  };
};

export const endGraphContext = () => {
  context = null;
};

/**
 * Publishing statements each owner module needs, so that patched consumers
 * can reach its symbols through {@link BRIDGE}. Call once, after all patches.
 */
export const bridgePublications = (): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [module, keys] of context?.publishes ?? []) {
    const defs = [...keys]
      .map(
        ([key, local]) =>
          `Object.defineProperty(${BRIDGE},${JSON.stringify(key)},{get:()=>${local},configurable:!0,enumerable:!0});`
      )
      .join('');
    out.set(module, `;${BRIDGE}||(${BRIDGE}={});${defs}`);
  }
  return out;
};

export const isGraphContextActive = (): boolean =>
  context !== null && context.current !== null;

/** Starts patching one module; clears its pending imports. */
export const enterGraphModule = (name: string) => {
  if (!context) return;
  context.current = name;
  context.imports.clear();
  context.preludes.clear();
};

export const leaveGraphModule = () => {
  if (context) context.current = null;
};

const EXPORT_LIST = /export\{([^}]*)\}/g;

/** exported name → owning module, across the whole graph. */
const exportIndex = (): Map<string, string> => {
  if (!context) return new Map();
  if (context.exportIndex) return context.exportIndex;
  const index = new Map<string, string>();
  for (const [module, source] of context.sources) {
    for (const match of source.matchAll(EXPORT_LIST)) {
      for (const item of match[1].split(',')) {
        const parts = item.trim().split(/\s+as\s+/);
        const exported = (parts[1] ?? parts[0]).trim();
        if (exported && !index.has(exported)) index.set(exported, module);
      }
    }
  }
  context.exportIndex = index;
  return index;
};

/** Local name → exported name, if `module` exports it. */
export const exportedNameOf = (
  module: string,
  local: string
): string | null => {
  const source = context?.sources.get(module);
  if (!source) return null;
  for (const match of source.matchAll(EXPORT_LIST)) {
    for (const item of match[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      if (parts[0].trim() === local) return (parts[1] ?? parts[0]).trim();
    }
  }
  return null;
};

/** The module that exports `exported`, if any. */
export const findExportOwner = (exported: string): string | null =>
  exportIndex().get(exported) ?? null;

/** Exported name → the owner's local name, from its export list. */
const localNameOf = (module: string, exported: string): string | null => {
  const source = context?.sources.get(module);
  if (!source) return null;
  for (const match of source.matchAll(EXPORT_LIST)) {
    for (const item of match[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      if ((parts[1] ?? parts[0]).trim() === exported) return parts[0].trim();
    }
  }
  return null;
};

/** Bridge key for a module's export: unique across the graph. */
export const bridgeKey = (exported: string, module: string): string =>
  `${module.replace(/^.*\//, '').replace(/[^$\w]/g, '_')}__${exported}`;

/** Kept for callers that only need a stable, collision-proof name. */
export const aliasFor = (exported: string): string =>
  `$tcc_${exported.replace(/[^$\w]/g, '_')}`;

/**
 * Requests access to `exported` of `module` from the current module and
 * returns an expression for it: the owner's local name when the current
 * module *is* the owner, otherwise a {@link BRIDGE} property that the owner
 * publishes once the patched source is kept. Returns null outside a graph.
 */
export const requestImport = (
  exported: string,
  module: string
): string | null => {
  if (!context?.current) return null;
  const local = localNameOf(module, exported) ?? exported;
  if (module === context.current) return local;
  const key = bridgeKey(exported, module);
  context.imports.set(key, { exported, module, local });
  return `${BRIDGE}.${key}`;
};

/** Adds a snippet placed after the imports of the current module. `key` must
 * be the identifier the snippet declares; it is emitted only if used. */
export const requestPrelude = (key: string, code: string) => {
  if (context?.current) context.preludes.set(key, code);
};

/** Where `module` imports `local` from, if it does. */
const importOriginOf = (module: string, local: string): GraphImport | null => {
  const source = context?.sources.get(module);
  if (!source) return null;
  for (const match of source.matchAll(/import\{([^}]*)\}from"([^"]+)"/g)) {
    for (const item of match[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      if ((parts[1] ?? parts[0]).trim() === local)
        return { exported: parts[0].trim(), module: match[2] };
    }
  }
  return null;
};

/**
 * Finds a symbol somewhere in the graph with `finder` (which runs against one
 * module's source and returns that module's *local* name or undefined), and
 * returns an alias importable into the current module. The local name is
 * traced to whichever module exports it: the defining module's own export
 * list, or the chunk it was imported from. The search runs once per context
 * per `key`; subsequent modules reuse the answer.
 */
export const resolveAcrossGraph = (
  key: string,
  finder: (source: string) => string | undefined
): string | undefined => {
  if (!context?.current) return undefined;
  let hit = context.cache.get(key) as GraphImport | null | undefined;
  if (hit === undefined) {
    hit = null;
    const saved = context.current;
    context.current = null; // finders must not recurse into the graph
    try {
      for (const [module, source] of context.sources) {
        const local = finder(source);
        if (!local) continue;
        const exported = exportedNameOf(module, local);
        const found = exported
          ? { exported, module }
          : importOriginOf(module, local);
        if (found && context.sources.has(found.module)) {
          hit = found;
          break;
        }
      }
    } finally {
      context.current = saved;
    }
    context.cache.set(key, hit);
  }
  if (!hit) return undefined;
  return requestImport(hit.exported, hit.module) ?? undefined;
};

/** Memoises an arbitrary graph-wide computation for this context. */
export const graphMemo = <T>(key: string, compute: () => T): T | undefined => {
  if (!context) return undefined;
  if (!context.cache.has(key)) {
    const saved = context.current;
    context.current = null;
    try {
      context.cache.set(key, compute());
    } finally {
      context.current = saved;
    }
  }
  return context.cache.get(key) as T;
};

export const graphSources = (): ReadonlyMap<string, string> | null =>
  context?.sources ?? null;

/**
 * Adds the preludes requested while patching the current module to
 * `patched`, and records which owner modules must publish the bridged
 * symbols the patched source now references. Preludes go after the leading
 * `//` header comments so a `// @bun @bytecode` pragma stays on line one.
 */
export const finishGraphModule = (patched: string): string => {
  if (!context) return patched;
  // Preludes are keyed by the identifier they define; include one only when
  // the patched source uses that identifier.
  const preludes = [...context.preludes.entries()]
    .filter(
      ([key]) => patched.includes(key) && !patched.includes(`/*tcc:${key}*/`)
    )
    .map(([key, code]) => `/*tcc:${key}*/${code}`);
  const referenced = patched + preludes.join('');
  for (const [key, { module, local }] of context.imports) {
    if (!referenced.includes(`${BRIDGE}.${key}`)) continue;
    const keys = context.publishes.get(module) ?? new Map<string, string>();
    keys.set(key, local);
    context.publishes.set(module, keys);
  }
  if (preludes.length === 0) return patched;
  const header = patched.match(/^(?:\/\/[^\n]*\n|\s*\n)*/)?.[0] ?? '';
  return header + preludes.join('') + patched.slice(header.length);
};
