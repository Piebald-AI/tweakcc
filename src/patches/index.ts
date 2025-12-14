import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import {
  CONFIG_DIR,
  NATIVE_BINARY_BACKUP_FILE,
  updateConfigFile,
} from '../config.js';
import { ClaudeCodeInstallationInfo, TweakccConfig } from '../types.js';
import { isDebug, debug, replaceFileBreakingHardLinks } from '../utils.js';
import {
  extractClaudeJsFromNativeInstallation,
  repackNativeInstallation,
} from '../nativeInstallationLoader.js';

// Notes to patch-writers:
//
// - Always use [\w$]+ instead of \w+ to match identifiers (variable/function names), because at
//   least in Node.js's regex engine, \w+ does not include $, so ABC$, which is a perfectly valid
//   identifier, would not be matched.  The way cli.js is minified, $ frequently appears in global
//   identifiers.
//
// - When starting a regular expression with an identifier name, for example if you're matching a
//   string of the form "someVarName = ...", make sure to put some kind of word boundary at the
//   beginning, like `\b`.  This can **SIGNIFICANTLY** speed up matching, easily taking a 1.5s
//   search down to 80ms.  More specific boundaries like explicitly requiring a particular
//   character such as ',' or ';' can speed up matching even further, e.g. down to 30ms.
//

import { writeShowMoreItemsInSelectMenus } from './showMoreItemsInSelectMenus.js';
import { writeThemes } from './themes.js';
import { writeContextLimit } from './contextLimit.js';
import { writeInputBoxBorder } from './inputBorderBox.js';
import { writeSpinnerNoFreeze } from './spinnerNoFreeze.js';
import { writeThinkerFormat } from './thinkerFormat.js';
import { writeThinkerSymbolMirrorOption } from './thinkerMirrorOption.js';
import { writeThinkerSymbolChars } from './thinkerSymbolChars.js';
import { writeThinkerSymbolSpeed } from './thinkerSymbolSpeed.js';
import { writeThinkerSymbolWidthLocation } from './thinkerSymbolWidth.js';
import { writeThinkerVerbs } from './thinkerVerbs.js';
import { writeUserMessageDisplay } from './userMessageDisplay.js';
import { writeVerboseProperty } from './verboseProperty.js';
import { writeModelCustomizations } from './modelSelector.js';
import { writeThinkingVisibility } from './thinkingVisibility.js';
import { writePatchesAppliedIndication } from './patchesAppliedIndication.js';
import { applySystemPrompts } from './systemPrompts.js';
import { writeFixLspSupport } from './fixLspSupport.js';
import {
  writeToolsets,
  writeModeChangeUpdateToolset,
  addSetStateFnAccessAtToolChangeComponentScope,
} from './toolsets.js';
import { writeConversationTitle } from './conversationTitle.js';
import {
  restoreNativeBinaryFromBackup,
  restoreClijsFromBackup,
} from '../installationBackup.js';
import { compareVersions } from '../systemPromptSync.js';

export interface LocationResult {
  startIndex: number;
  endIndex: number;
  identifiers?: string[];
}

export interface ModificationEdit {
  startIndex: number;
  endIndex: number;
  newContent: string;
}

export interface PatchApplied {
  newContent: string;
  items: string[];
}

// Debug function for showing diffs (currently disabled)
export const showDiff = (
  oldFileContents: string,
  newFileContents: string,
  injectedText: string,
  startIndex: number,
  endIndex: number
): void => {
  if (!isDebug()) {
    return;
  }

  const contextStart = Math.max(0, startIndex - 20);
  const contextEndOld = Math.min(oldFileContents.length, endIndex + 20);
  const contextEndNew = Math.min(
    newFileContents.length,
    startIndex + injectedText.length + 20
  );

  const oldBefore = oldFileContents.slice(contextStart, startIndex);
  const oldChanged = oldFileContents.slice(startIndex, endIndex);
  const oldAfter = oldFileContents.slice(endIndex, contextEndOld);

  const newBefore = newFileContents.slice(contextStart, startIndex);
  const newChanged = newFileContents.slice(
    startIndex,
    startIndex + injectedText.length
  );
  const newAfter = newFileContents.slice(
    startIndex + injectedText.length,
    contextEndNew
  );

  if (oldChanged !== newChanged) {
    console.log('\n--- Diff ---');
    console.log('OLD:', oldBefore + `\x1b[31m${oldChanged}\x1b[0m` + oldAfter);
    console.log('NEW:', newBefore + `\x1b[32m${newChanged}\x1b[0m` + newAfter);
    console.log('--- End Diff ---\n');
  }
};

export const escapeIdent = (ident: string): string => {
  return ident.replace(/\$/g, '\\$');
};

export const findChalkVar = (fileContents: string): string | undefined => {
  // Find chalk variable using the counting method
  const chalkPattern =
    /\b([$\w]+)(?:\.(?:cyan|gray|green|red|yellow|ansi256|bgAnsi256|bgHex|bgRgb|hex|rgb|bold|dim|inverse|italic|strikethrough|underline)\b)+\(/g;
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
  return chalkVar;
};

/**
 * Find the module loader function in the first 1000 chars
 */
export const getModuleLoaderFunction = (
  fileContents: string
): string | undefined => {
  // Pattern: var X=(Y,Z,W)=>{
  const firstChunk = fileContents.slice(0, 1000);
  const pattern = /var ([$\w]+)=\([$\w]+,[$\w]+,[$\w]+\)=>\{/;
  const match = firstChunk.match(pattern);
  if (!match) {
    console.log(
      'patch: getModuleLoaderFunction: failed to find module loader function'
    );
    return undefined;
  }
  return match[1];
};

/**
 * Find the React module name
 */
export const getReactModuleNameNonBun = (
  fileContents: string
): string | undefined => {
  // Pattern: var X=Y((Z)=>{var W=Symbol.for("react.element") or "react.transitional.element"
  const pattern =
    /var ([$\w]+)=[$\w]+\(\([$\w]+\)=>\{var [$\w]+=Symbol\.for\("react\.(transitional\.)?element"\)/;
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
    `var ([$\\w]+)=[$\\w]+\\(\\([$\\w]+,[$\\w]+\\)=>\\{[$\\w]+\\.exports=${escapeIdent(reactModuleNameNonBun)}\\(\\)`
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
    `\\b([$\\w]+)=${escapeIdent(moduleLoader)}\\(${escapeIdent(reactModuleVarNonBun)}\\(\\),1\\)`
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
  // \b([$\w]+)=T\(fH\(\),1\)
  // Pattern: X=moduleLoader(reactModuleBun,1)
  const bunPattern = new RegExp(
    `\\b([$\\w]+)=${escapeIdent(moduleLoader)}\\(${escapeIdent(reactModuleFunctionBun)}\\(\\),1\\)`
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
 * Find the Text component variable name from Ink
 */
export const findTextComponent = (fileContents: string): string | undefined => {
  // Find the Text component function definition from Ink
  // The minified Text component has this signature:
  // function X({color:A,backgroundColor:B,dimColor:C=!1,bold:D=!1,...})
  const textComponentPattern =
    /\bfunction ([$\w]+)\(\{color:[$\w]+,backgroundColor:[$\w]+,dimColor:[$\w]+=![01],bold:[$\w]+=![01]/;
  const match = fileContents.match(textComponentPattern);
  if (!match) {
    console.log('patch: findTextComponent: failed to find text component');
    return undefined;
  }
  return match[1];
};

/**
 * Find the Box component variable name
 */
export const findBoxComponent = (fileContents: string): string | undefined => {
  // 1. Search for Box displayName
  const boxDisplayNamePattern = /\b([$\w]+)\.displayName="Box"/;
  const boxDisplayNameMatch = fileContents.match(boxDisplayNamePattern);
  if (!boxDisplayNameMatch) {
    console.error('patch: findBoxComponent: failed to find Box displayName');
    return undefined;
  }
  const boxOrigCompName = boxDisplayNameMatch[1];

  // 2. Search for the variable that equals the original Box component
  const boxVarPattern = new RegExp(
    // /[^$\w]/ = /\b/ but considering dollar signs word characters.
    // Normally /$\b/ does NOT match "$}" but this does.
    // Because once boxOrigCompName was `LK$` so `_=LK$}` wasn't matching.
    `\\b([$\\w]+)=${escapeIdent(boxOrigCompName)}[^$\\w]`
  );
  const boxVarMatch = fileContents.match(boxVarPattern);
  if (!boxVarMatch) {
    console.error(
      `patch: findBoxComponent: failed to find Box component variable (boxOrigCompName=${boxOrigCompName})`
    );
    return undefined;
  }

  return boxVarMatch[1];
};

export const applyCustomization = async (
  config: TweakccConfig,
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<TweakccConfig> => {
  let content: string;

  if (ccInstInfo.nativeInstallationPath) {
    // For native installations: restore the binary, then extract to memory
    await restoreNativeBinaryFromBackup(ccInstInfo);

    // Extract from backup if it exists, otherwise from the native installation
    let backupExists = false;
    try {
      await fs.stat(NATIVE_BINARY_BACKUP_FILE);
      backupExists = true;
    } catch {
      // Backup doesn't exist, extract from native installation
    }

    const pathToExtractFrom = backupExists
      ? NATIVE_BINARY_BACKUP_FILE
      : ccInstInfo.nativeInstallationPath;

    debug(
      `Extracting claude.js from ${backupExists ? 'backup' : 'native installation'}: ${pathToExtractFrom}`
    );

    const claudeJsBuffer =
      await extractClaudeJsFromNativeInstallation(pathToExtractFrom);

    if (!claudeJsBuffer) {
      throw new Error('Failed to extract claude.js from native installation');
    }

    // Save original extracted JS for debugging
    const origPath = path.join(CONFIG_DIR, 'native-claudejs-orig.js');
    fsSync.writeFileSync(origPath, claudeJsBuffer);
    debug(`Saved original extracted JS from native to: ${origPath}`);

    content = claudeJsBuffer.toString('utf8');
  } else {
    // For NPM installations: restore cli.js from backup, then read it
    await restoreClijsFromBackup(ccInstInfo);

    if (!ccInstInfo.cliPath) {
      throw new Error('cliPath is required for NPM installations');
    }

    content = await fs.readFile(ccInstInfo.cliPath, { encoding: 'utf8' });
  }

  const items: string[] = [];

  // Apply system prompt customizations
  const systemPromptsResult = await applySystemPrompts(
    content,
    ccInstInfo.version
  );
  content = systemPromptsResult.newContent;
  items.push(...systemPromptsResult.items);

  let result: string | null = null;

  // Apply themes
  if (config.settings.themes && config.settings.themes.length > 0) {
    if ((result = writeThemes(content, config.settings.themes)))
      content = result;
  }

  // Apply thinking verbs
  // prettier-ignore
  if (config.settings.thinkingVerbs) {
    if ((result = writeThinkerVerbs(content, config.settings.thinkingVerbs.verbs)))
      content = result;
    if ((result = writeThinkerFormat(content, config.settings.thinkingVerbs.format)))
      content = result;
  }

  // Apply thinking style
  // prettier-ignore
  if ((result = writeThinkerSymbolChars(content, config.settings.thinkingStyle.phases)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolSpeed(content, config.settings.thinkingStyle.updateInterval)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolWidthLocation(content, Math.max(...config.settings.thinkingStyle.phases.map(p => p.length)) + 1)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolMirrorOption(content, config.settings.thinkingStyle.reverseMirror)))
    content = result;

  // Apply user message display customization
  if (config.settings.userMessageDisplay) {
    if (
      (result = writeUserMessageDisplay(
        content,
        config.settings.userMessageDisplay.format,
        config.settings.userMessageDisplay.foregroundColor,
        config.settings.userMessageDisplay.backgroundColor,
        config.settings.userMessageDisplay.styling.includes('bold'),
        config.settings.userMessageDisplay.styling.includes('italic'),
        config.settings.userMessageDisplay.styling.includes('underline'),
        config.settings.userMessageDisplay.styling.includes('strikethrough'),
        config.settings.userMessageDisplay.styling.includes('inverse'),
        config.settings.userMessageDisplay.borderStyle,
        config.settings.userMessageDisplay.borderColor,
        config.settings.userMessageDisplay.paddingX,
        config.settings.userMessageDisplay.paddingY,
        config.settings.userMessageDisplay.fitBoxToContent
      ))
    ) {
      content = result;
    }
  }

  // Apply input box border customization
  if (
    config.settings.inputBox &&
    typeof config.settings.inputBox.removeBorder === 'boolean'
  ) {
    if (
      (result = writeInputBoxBorder(
        content,
        config.settings.inputBox.removeBorder
      ))
    )
      content = result;
  }

  // Apply verbose property patch (always true by default)
  if ((result = writeVerboseProperty(content))) content = result;

  // Apply spinner no-freeze patch (always enabled)
  if ((result = writeSpinnerNoFreeze(content))) content = result;

  // Apply context limit patch (always enabled)
  if ((result = writeContextLimit(content))) content = result;

  // Apply model customizations (known names, mapping, selector options) (always enabled)
  if ((result = writeModelCustomizations(content))) content = result;

  // Apply show more items in select menus patch (always enabled)
  if ((result = writeShowMoreItemsInSelectMenus(content, 25))) content = result;

  // Apply thinking visibility patch (always enabled)
  if ((result = writeThinkingVisibility(content))) content = result;

  // Apply patches applied indication
  const showTweakccVersion = config.settings.misc?.showTweakccVersion ?? true;
  const showPatchesApplied = config.settings.misc?.showPatchesApplied ?? true;
  if (
    (result = writePatchesAppliedIndication(
      content,
      '3.1.6',
      items,
      showTweakccVersion,
      showPatchesApplied
    ))
  )
    content = result;

  // Apply LSP support fixes (always enabled)
  if ((result = writeFixLspSupport(content))) content = result;

  // Apply toolset restrictions (enabled if toolsets configured)
  if (config.settings.toolsets && config.settings.toolsets.length > 0) {
    if (
      (result = writeToolsets(
        content,
        config.settings.toolsets,
        config.settings.defaultToolset
      ))
    )
      content = result;
  }

  // Apply mode-change toolset switching (if both toolsets are configured)
  if (config.settings.planModeToolset && config.settings.defaultToolset) {
    // First, add setState access at the tool change component scope
    if ((result = addSetStateFnAccessAtToolChangeComponentScope(content)))
      content = result;

    // Then, inject the mode change toolset switching code
    if (
      (result = writeModeChangeUpdateToolset(
        content,
        config.settings.planModeToolset,
        config.settings.defaultToolset
      ))
    )
      content = result;
  }

  // Apply conversation title management (if enabled and CC version < 2.0.64)
  const enableConvTitle = config.settings.misc?.enableConversationTitle ?? true;
  const isVersionBelow2064 = ccInstInfo.version && compareVersions(ccInstInfo.version, '2.0.64') < 0;
  if (enableConvTitle && isVersionBelow2064) {
    if ((result = writeConversationTitle(content))) content = result;
  }

  // Write the modified content back
  if (ccInstInfo.nativeInstallationPath) {
    // For native installations: repack the modified claude.js back into the binary
    debug(
      `Repacking modified claude.js into native installation: ${ccInstInfo.nativeInstallationPath}`
    );

    // Save patched JS for debugging
    const patchedPath = path.join(CONFIG_DIR, 'native-claudejs-patched.js');
    fsSync.writeFileSync(patchedPath, content, 'utf8');
    debug(`Saved patched JS from native to: ${patchedPath}`);

    const modifiedBuffer = Buffer.from(content, 'utf8');
    await repackNativeInstallation(
      ccInstInfo.nativeInstallationPath,
      modifiedBuffer,
      ccInstInfo.nativeInstallationPath
    );
  } else {
    // For NPM installations: replace the cli.js file
    if (!ccInstInfo.cliPath) {
      throw new Error('cliPath is required for NPM installations');
    }

    await replaceFileBreakingHardLinks(ccInstInfo.cliPath, content, 'patch');
  }

  return await updateConfigFile(config => {
    config.changesApplied = true;
  });
};
