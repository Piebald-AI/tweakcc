import { escapeIdent } from '.';
import {
  exportedNameOf,
  graphMemo,
  graphSources,
  isGraphContextActive,
  requestImport,
  requestPrelude,
  resolveAcrossGraph,
} from './graphContext';

/**
 * React in a code-split build is an ES module whose API is exported one
 * minified name per member (`g=function(t){return s.H.useState(t)}`,
 * `Wc=function(t,e,n){…}` for createElement). Patches were written against a
 * React namespace object, so give them one: `$tcc_React`, a getter-backed
 * object over aliased imports (getters, because the exports are assigned by
 * the chunk's lazy initialiser rather than at module evaluation).
 */
const REACT_SHIM = '$tcc_React';
const getGraphReactShim = (): string | undefined => {
  const react = graphMemo('react-members', () => {
    for (const [module, source] of graphSources() ?? []) {
      if (!source.includes('.H.useState(')) continue;
      const members = new Map<string, string>();
      for (const match of source.matchAll(
        /([$\w]+)=function\([$\w,]*\)\{return [$\w]+\.H\.(use[A-Za-z]+)\(/g
      )) {
        const exported = exportedNameOf(module, match[1]);
        if (exported && !members.has(match[2])) members.set(match[2], exported);
      }
      const createElement = source.match(
        /[,;{ ]([$\w]+)=function\(([$\w]+),([$\w]+),([$\w]+)\)\{var [$\w]+,[$\w]+=\{\},[$\w]+=null;if\(\3!=null\)/
      );
      const exportedCreateElement =
        createElement && exportedNameOf(module, createElement[1]);
      if (exportedCreateElement && members.has('useState')) {
        members.set('createElement', exportedCreateElement);
        return { module, members };
      }
    }
    return null;
  });
  if (!react) return undefined;
  const getters = [...react.members].map(([member, exported]) => {
    const alias = requestImport(exported, react.module);
    return `get ${member}(){return ${alias}}`;
  });
  requestPrelude(
    REACT_SHIM,
    `var ${REACT_SHIM}={${getters.join(',')},Fragment:Symbol.for("react.fragment")};${REACT_SHIM}.default=${REACT_SHIM};`
  );
  return REACT_SHIM;
};

/**
 * Escapes every non-ASCII code unit as a `\uXXXX` sequence so injected source
 * stays pure ASCII. Native Claude Code installs embed cli.js as a Latin-1 Bun
 * module (the clean module has zero bytes > 127); injecting literal UTF-8 there
 * is decoded one byte per code point at runtime → mojibake (e.g. "✢" → "â").
 * `\uXXXX` escapes produce the same string in JS regardless of module encoding.
 */
export const escapeNonAscii = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  const nonAscii = /[^\x00-\x7f]/g;
  return text.replace(
    nonAscii,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
};

export const findChalkVar = (fileContents: string): string | undefined => {
  // Find chalk variable using the counting method
  const chalkPattern =
    /[^$\w]([$\w]+)(?:\.(?:cyan|gray|green|red|yellow|ansi256|bgAnsi256|bgHex|bgRgb|hex|rgb|bold|dim|inverse|italic|strikethrough|underline)\b)+\(/g;
  const chalkMatches = Array.from(fileContents.matchAll(chalkPattern));

  // Count occurrences of each variable
  const chalkCounts: Record<string, number> = {};
  for (const match of chalkMatches) {
    const varName = match[1];
    chalkCounts[varName] = (chalkCounts[varName] || 0) + 1;
  }

  // Find the variable with the most occurrences
  let chalkVar;
  let maxCount = 0;
  for (const [varName, count] of Object.entries(chalkCounts)) {
    if (count > maxCount) {
      maxCount = count;
      chalkVar = varName;
    }
  }
  // In a code-split build a module that never styles text has no chalk
  // calls of its own; borrow the graph's chalk instance. A module with only a
  // stray match or two is also better served by the graph-wide winner.
  if (isGraphContextActive() && maxCount < 3) {
    const imported = resolveAcrossGraph('chalk', source => {
      const counts = new Map<string, number>();
      for (const match of source.matchAll(chalkPattern))
        counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
      const best = [...counts].sort((a, b) => b[1] - a[1])[0];
      return best && best[1] >= 10 ? best[0] : undefined;
    });
    if (imported) return imported;
  }
  return chalkVar;
};

/**
 * Find the module loader function
 */
export const getModuleLoaderFunction = (
  fileContents: string
): string | undefined => {
  // Native bundles: look for ,j=(H,$,A)=>{A=H!=null? pattern (module loader)
  // This is distinct from other 3-param functions because of the H!=null check
  const nativeLoaderPattern =
    /[,;]([$\w]+)=\([$\w]+,[$\w]+,[$\w]+\)=>\{[$\w]+=[$\w]+!=null\?/;
  const nativeMatch = fileContents.slice(0, 2000).match(nativeLoaderPattern);
  if (nativeMatch) {
    return nativeMatch[1];
  }

  // NPM bundles: var T=(H,$,A)=>{ at the start
  // In newer versions there are more than one, and the one with the shortest name
  // is the most common one and therefore the correct one.
  const firstChunk = fileContents.slice(0, 10000);
  const pattern = /(?:var |,)([$\w]+)=\([$\w]+,[$\w]+,[$\w]+\)=>\{/g;
  const matches = Array.from(firstChunk.matchAll(pattern));
  if (matches.length > 0) {
    let shortest = matches[0][1];
    for (const m of matches) {
      if (m[1].length < shortest.length) {
        shortest = m[1];
      }
    }
    return shortest;
  }

  console.log(
    'patch: getModuleLoaderFunction: failed to find module loader function'
  );
  return undefined;
};

/**
 * Find the React module name
 */
export const getReactModuleNameNonBun = (
  fileContents: string
): string | undefined => {
  // Pattern: var X=Y((Z)=>{var W=Symbol.for("react.element") or "react.transitional.element"
  const pattern =
    /var ([$\w]+)=[$\w]+\((?:\([$\w]+\)=>|function\([$\w]+\))\{var [$\w]+=Symbol\.for\("react\.(transitional\.)?element"\)/;
  const match = fileContents.match(pattern);
  if (!match) {
    console.log(
      'patch: getReactModuleNameNonBun: failed to find React module name'
    );
    return undefined;
  }
  return match[1];
};

/**
 * Find the React module function (Bun variant)
 *
 * Steps:
 * 1. Get "reactModuleNameNonBun" via getReactModuleNameNonBun()
 * 2. Search for /var ([$\w]+)=[$\w]+\(\([$\w]+,[$\w]+\)=>\{[$\w]+\.exports=${reactModuleNameNonBun}\(\)/
 * 3. The first match is it
 *
 * Example code:
 * ```
 * var fH = N((AtM, r7L) => {
 *     r7L.exports = n7L();
 * });
 * ```
 * `n7L` is `reactModuleNameNonBun`, and `fH` is `reactModuleFunctionBun`
 */
export const getReactModuleFunctionBun = (
  fileContents: string
): string | undefined => {
  const reactModuleNameNonBun = getReactModuleNameNonBun(fileContents);
  if (!reactModuleNameNonBun) {
    console.log(
      '^ patch: getReactModuleFunctionBun: failed to find React module name (Bun)'
    );
    return undefined;
  }

  // Pattern: var X=Y((Z,W)=>{W.exports=reactModuleNameNonBun()
  const pattern = new RegExp(
    `var ([$\\w]+)=[$\\w]+\\((?:\\([$\\w]+,[$\\w]+\\)=>|function\\([$\\w]+,[$\\w]+\\))\\{[$\\w]+\\.exports=${escapeIdent(reactModuleNameNonBun)}\\(\\)`
  );
  const match = fileContents.match(pattern);
  if (!match) {
    console.log(
      `patch: getReactModuleFunctionBun: failed to find React module function (Bun) (reactModuleNameNonBun=${reactModuleNameNonBun})`
    );
    return undefined;
  }
  return match[1];
};

// Cache for React variable to avoid recomputing
let reactVarCache: string | undefined | null = null;

// Cache for require function name to avoid recomputing
let requireFuncNameCache: string | null = null;

/**
 * Get the React variable name (cached)
 */
export const getReactVar = (fileContents: string): string | undefined => {
  // Code-split native builds import React piecemeal (one minified export per
  // hook); patches get a namespace-shaped shim instead.
  if (isGraphContextActive()) return getGraphReactShim();

  // Return cached value if available
  if (reactVarCache != null) {
    return reactVarCache;
  }

  const moduleLoader = getModuleLoaderFunction(fileContents);
  if (!moduleLoader) {
    console.log('^ patch: getReactVar: failed to find moduleLoader');
    reactVarCache = undefined;
    return undefined;
  }

  // Try non-bun first (reactModuleNameNonBun)
  const reactModuleVarNonBun = getReactModuleNameNonBun(fileContents);
  if (!reactModuleVarNonBun) {
    console.log('^ patch: getReactVar: failed to find reactModuleVarNonBun');
    reactVarCache = undefined;
    return undefined;
  }

  // Pattern: X=moduleLoader(reactModule,1)
  const nonBunPattern = new RegExp(
    `[^$\\w]([$\\w]+)=${escapeIdent(moduleLoader)}\\(${escapeIdent(reactModuleVarNonBun)}\\(\\),1\\)`
  );
  const nonBunMatch = fileContents.match(nonBunPattern);
  if (nonBunMatch) {
    reactVarCache = nonBunMatch[1];
    return reactVarCache;
  } else {
    // DON'T fail just because we can't find the non-bun pattern.
  }

  // If reactModuleNameNonBun fails, try reactModuleFunctionBun
  const reactModuleFunctionBun = getReactModuleFunctionBun(fileContents);
  if (!reactModuleFunctionBun) {
    console.log('^ patch: getReactVar: failed to find reactModuleFunctionBun');
    reactVarCache = undefined;
    return undefined;
  }
  // ;([$\w]+)=T\(fH\(\),1\)
  // Pattern: ;X=moduleLoader(reactModuleBun,1)
  const bunPattern = new RegExp(
    `[^$\\w]([$\\w]+)=${escapeIdent(moduleLoader)}\\(${escapeIdent(reactModuleFunctionBun)}\\(\\),1\\)`
  );
  const bunMatch = fileContents.match(bunPattern);
  if (!bunMatch) {
    console.log(
      `patch: getReactVar: failed to find bunPattern (moduleLoader=${moduleLoader}, reactModuleVarNonBun=${reactModuleVarNonBun}, reactModuleFunctionBun=${reactModuleFunctionBun})`
    );
    reactVarCache = undefined;
    return undefined;
  }

  reactVarCache = bunMatch[1];
  return reactVarCache;
};

/**
 * Clear the React var cache (useful for testing or multiple runs)
 */
export const clearReactVarCache = (): void => {
  reactVarCache = null;
};

/**
 * Find the require function variable name (no caching)
 *
 * This finds the variable name used to call require() in esbuild-bundled code.
 * Bun uses "require" directly, but esbuild uses a variable that points to
 * the result of createRequire(import.meta.url).
 *
 * Steps:
 * 1. Find the createRequire import: import{createRequire as X}from"node:module";
 * 2. Find the variable that calls it: var Y=X(import.meta.url)
 * 3. Return Y (the require function variable)
 */
export const findRequireFunc = (fileContents: string): string | undefined => {
  // Step 1: Find createRequire import
  // Pattern: import{createRequire as X}from"node:module";
  const createRequirePattern =
    /import\{createRequire as ([$\w]+)\}from"node:module";/;
  const createRequireMatch = fileContents.match(createRequirePattern);
  if (!createRequireMatch) {
    // If this is not found it's not necessarily a bug because we use its absence to detect Bun...
    // console.log(
    //   'patch: findRequireFunc: failed to find createRequire import'
    // );
    return undefined;
  }
  const createRequireVar = createRequireMatch[1];

  // Step 2: Find the variable that calls createRequire
  // Pattern: var X=createRequireVar(import.meta.url)
  const requireFuncPattern = new RegExp(
    `var ([$\\w]+)=${escapeIdent(createRequireVar)}\\(import\\.meta\\.url\\)`
  );
  const requireFuncMatch = fileContents.match(requireFuncPattern);
  if (!requireFuncMatch) {
    console.log(
      `patch: findRequireFunc: failed to find require function variable (createRequireVar=${createRequireVar})`
    );
    return undefined;
  }

  return requireFuncMatch[1];
};

/**
 * Get the appropriate require function name for the current environment (cached)
 *
 * - Bun native installations use "require" directly
 * - esbuild-bundled code uses a variable that points to createRequire(import.meta.url)
 *
 * This function detects which environment we're in and returns the correct name.
 *
 * @param fileContents The file content to analyze
 * @returns "require" for Bun, or the require function variable name for esbuild
 */
export const getRequireFuncName = (fileContents: string): string => {
  // Code-split native chunks are Bun ES modules; Bun exposes CommonJS
  // require there as import.meta.require (the chunks use it themselves).
  if (isGraphContextActive()) return 'import.meta.require';

  // Return cached value if available
  if (requireFuncNameCache != null) {
    return requireFuncNameCache;
  }

  // Try to find the esbuild-style require function
  const requireFunc = findRequireFunc(fileContents);

  // If we found it, we're in esbuild environment
  if (requireFunc) {
    requireFuncNameCache = requireFunc;
    return requireFuncNameCache;
  }

  // Otherwise, assume Bun environment which uses "require" directly
  requireFuncNameCache = 'require';
  return requireFuncNameCache;
};

/**
 * Clear the require func name cache (useful for testing or multiple runs)
 */
export const clearRequireFuncNameCache = (): void => {
  requireFuncNameCache = null;
};

/**
 * Clear all helper caches.
 *
 * Call this when processing multiple different cli.js files in one session.
 * The caches store minified variable names that are specific to each file.
 */
export const clearCaches = (): void => {
  clearReactVarCache();
  clearRequireFuncNameCache();
};

/**
 * Find the Text component variable name from Ink
 */
export const findTextComponent = (fileContents: string): string | undefined => {
  // Find the Text component function definition from Ink
  // The minified Text component has this signature:
  // function X({color:A,backgroundColor:B,dimColor:C=!1,bold:D=!1,...})
  const textComponentPattern =
    /\bfunction ([$\w]+).{0,80}?color:[$\w]+,backgroundColor:[$\w]+,dimColor:[$\w]+(?:=![01])?,bold:[$\w]+(?:=![01])?/;
  const match = fileContents.match(textComponentPattern);
  if (match) {
    return match[1];
  }

  const bodyDestructurePattern =
    /\bfunction ([$\w]+)\(([$\w]+)\)\{(?=[\s\S]{0,700}\{color:[$\w]+,backgroundColor:[$\w]+,dimColor:[$\w]+,bold:[$\w]+,italic:[$\w]+,underline:[$\w]+,strikethrough:[$\w]+,inverse:[$\w]+,wrap:[$\w]+,children:[$\w]+,[\s\S]{0,80}=\2\))(?=[\s\S]{0,1400}children:)[\s\S]{0,1600}?\}/;
  const bodyDestructureMatch = fileContents.match(bodyDestructurePattern);
  if (bodyDestructureMatch) {
    return bodyDestructureMatch[1];
  }

  // CC 2.1.2xx (React compiler output): props are destructured inside a
  // memo-cache guard: function n(o){let r=w(31),…;if(r[0]!==o)({color:d,backgroundColor:l,dimColor:…}=o…
  const memoDestructurePattern =
    /\bfunction ([$\w]+)\(([$\w]+)\)\{let [$\w]+=[$\w]+\(\d+\)[^;]{0,200};if\([$\w]+\[0\]!==\2\)\(\{color:[$\w]+,backgroundColor:[$\w]+,dimColor:/;
  const memoDestructureMatch = fileContents.match(memoDestructurePattern);
  if (memoDestructureMatch) {
    return memoDestructureMatch[1];
  }

  if (isGraphContextActive()) {
    const imported = resolveAcrossGraph('ink:Text', findTextComponent);
    if (imported) return imported;
  }

  console.log('patch: findTextComponent: failed to find text component');
  return undefined;
};

/**
 * Find the Box component variable name
 */
const findThemedBoxWrapper = (
  fileContents: string,
  rawBoxComponent: string
): string | undefined => {
  const wrapperFactoryIdent = '[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*';
  const rawAliasPattern = new RegExp(
    `var [^;]{0,120};var [$\\w]+=${wrapperFactoryIdent}\\(\\(\\)=>\\{[^}]{0,500}([$\\w]+)=${escapeIdent(rawBoxComponent)}\\}\\)`
  );
  const rawAlias = fileContents.match(rawAliasPattern)?.[1] ?? rawBoxComponent;
  const wrapperPattern = new RegExp(
    `function ([$\\w]+)\\([^)]+\\)\\{(?=[\\s\\S]{0,2500}createElement\\(${escapeIdent(rawAlias)},\\{\\.\\.\\.[$\\w]+,borderColor:)[\\s\\S]{0,3000}?return [$\\w]+\\}var [^;]{0,160};var [$\\w]+=${wrapperFactoryIdent}\\(\\(\\)=>\\{[^}]{0,600}([$\\w]+)=\\1\\}\\)`
  );
  return fileContents.match(wrapperPattern)?.[2];
};

export const findBoxComponent = (fileContents: string): string | undefined => {
  // Method 1: Find Box by ink-box createElement with local variable (CC ~2.0.x)
  const inkBoxPattern =
    /function ([$\w]+)\(.{0,2000}[^$\w]([$\w]+)=[$\w]+(?:\.default)?\.createElement\("ink-box".{0,300}?return \2/;
  const inkBoxMatch = fileContents.match(inkBoxPattern);
  if (inkBoxMatch) {
    return inkBoxMatch[1];
  }

  // Method 2: Find Box by direct return of createElement("ink-box"...) (CC 2.1.20+)
  // Pattern: function NAME({children:T,...}){...createElement("ink-box",...),T)}
  const directReturnPattern =
    /function ([$\w]+)\(\{children:[$\w]+,flexWrap:[$\w]+.{0,2000}?\.createElement\("ink-box"/;
  const directReturnMatch = fileContents.match(directReturnPattern);
  if (directReturnMatch) {
    return directReturnMatch[1];
  }

  // Method 3: Search for Box displayName (older CC versions, 0.2.9 - 2.0.77 at least)
  const boxDisplayNamePattern = /[^$\w]([$\w]+)\.displayName="Box"/;
  const boxDisplayNameMatch = fileContents.match(boxDisplayNamePattern);
  if (boxDisplayNameMatch) {
    return boxDisplayNameMatch[1];
  }

  // Method 4: Find Box by function that uses O6(N) or obj.c(N) memo and creates "ink-box" (CC 2.1.83+)
  // NPM minification: function NAME(A){let q=O6(44),...createElement("ink-box",...}
  // Native minification: function NAME(A){let q=obj.c(44),...createElement("ink-box",...}
  // The memo cache size (N) changes across versions (42 in 2.1.83, 44 in 2.1.89, etc.)
  const memoBoxPattern =
    /function ([$\w]+)\([$\w]+\)\{let [$\w]+=[$\w]+(?:\.[$\w]+)?\(\d+\).{0,3000}createElement\("ink-box"/;
  const memoBoxMatch = fileContents.match(memoBoxPattern);
  if (memoBoxMatch) {
    return memoBoxMatch[1];
  }

  // Method 5: Find Box by rest-style layout defaults (CC 2.1.138+)
  // Avoid ScrollBox-like wrappers by requiring generic Box layout defaults,
  // integer style warnings, forwarded children, and no sticky/scroll behavior.
  // CC >=2.1.x renders the element via the React JSX automatic runtime, so the
  // tail is now `X.jsx("ink-box",{...,style:I,children:T})` (children is a prop,
  // and `style` is no longer the last prop) rather than the old
  // `X.createElement("ink-box",{...,style:I},T)`. Accept both forms.
  const restStyleBoxPattern =
    /function ([$\w]+)\(\{children:([$\w]+),ref:[$\w]+.{0,600}?\.\.\.([$\w]+)\}\)\{.{0,2500}?"margin".{0,2500}?"padding".{0,1200}?"gap".{0,1200}?\3\.flexWrap\?\?="nowrap",\3\.flexDirection\?\?="row",\3\.flexGrow\?\?=0,\3\.flexShrink\?\?=1,\3\.overflowX=\3\.overflowX\?\?\3\.overflow\?\?"visible",\3\.overflowY=\3\.overflowY\?\?\3\.overflow\?\?"visible",[$\w]+(?:\.default)?\.(?:createElement|jsxs?)\("ink-box",\{[^}]*style:\3[^}]*\}/;
  const restStyleBoxMatch = fileContents.match(restStyleBoxPattern);
  if (restStyleBoxMatch) {
    return (
      findThemedBoxWrapper(fileContents, restStyleBoxMatch[1]) ??
      restStyleBoxMatch[1]
    );
  }

  // Method 6: the theme-aware Box wrapper that resolves theme color names
  // (CC 2.1.2xx code-split builds, where Ink's raw Box lives in another chunk):
  // function wt(o){let r=Ck();return e(Tl,{...o,borderColor:j(o.borderColor,r),…})}var s=wt;
  const themedWrapperPattern =
    /function ([$\w]+)\(([$\w]+)\)\{let [$\w]+=[$\w]+\(\);return [$\w]+\([$\w]+,\{\.\.\.\2,borderColor:[$\w]+\(\2\.borderColor,[$\w]+\),borderTopColor:/;
  const themedWrapperMatch = fileContents.match(themedWrapperPattern);
  if (themedWrapperMatch) {
    const alias = fileContents.match(
      new RegExp(`var ([$\\w]+)=${escapeIdent(themedWrapperMatch[1])};`)
    );
    return alias?.[1] ?? themedWrapperMatch[1];
  }

  if (isGraphContextActive()) {
    const imported = resolveAcrossGraph('ink:Box', findBoxComponent);
    if (imported) return imported;
  }

  console.error(
    'patch: findBoxComponent: failed to find Box component (neither ink-box createElement nor displayName found)'
  );
  return undefined;
};
