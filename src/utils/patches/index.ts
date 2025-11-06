import figlet from 'figlet';
import * as fs from 'node:fs/promises';
import { restoreClijsFromBackup, restoreNativeBinaryFromBackup, updateConfigFile } from '../config.js';
import { ClaudeCodeInstallationInfo, TweakccConfig, NATIVE_BINARY_BACKUP_FILE } from '../types.js';
import { isDebug, replaceFileBreakingHardLinks } from '../misc.js';
import { extractClaudeJsFromNativeInstallation, repackNativeInstallation } from '../nativeInstallation.js';

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
import { writeSigninBannerText } from './signinBannerText.js';
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
import { writeIgnoreMaxSubscription } from './ignoreMaxSubscription.js';
import { writeThinkingVisibility } from './thinkingVisibility.js';
import { writePatchesAppliedIndication } from './patchesAppliedIndication.js';
import { applySystemPrompts } from './systemPrompts.js';
import { writeFixLspSupport } from './fixLspSupport.js';
import { writeToolsets } from './toolsets.js';

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

  if (isDebug() && oldChanged !== newChanged) {
    console.log('\n--- Diff ---');
    console.log('OLD:', oldBefore + `\x1b[31m${oldChanged}\x1b[0m` + oldAfter);
    console.log('NEW:', newBefore + `\x1b[32m${newChanged}\x1b[0m` + newAfter);
    console.log('--- End Diff ---\n');
  }
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
export const getReactModuleName = (
  fileContents: string
): string | undefined => {
  // Pattern: var X=Y((Z)=>{var W=Symbol.for("react.element")
  const pattern =
    /var ([$\w]+)=[$\w]+\(\([$\w]+\)=>\{var [$\w]+=Symbol\.for\("react\.element"\)/;
  const match = fileContents.match(pattern);
  if (!match) {
    console.log('patch: getReactModuleName: failed to find React module name');
    return undefined;
  }
  return match[1];
};

// Cache for React variable to avoid recomputing
let reactVarCache: string | undefined | null = null;

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
    reactVarCache = undefined;
    return undefined;
  }

  const reactModule = getReactModuleName(fileContents);
  if (!reactModule) {
    reactVarCache = undefined;
    return undefined;
  }

  // Pattern: X=moduleLoader(reactModule,1)
  const pattern = new RegExp(
    `\\b([$\\w]+)=${moduleLoader}\\(${reactModule}\\(\\),1\\)`
  );
  const match = fileContents.match(pattern);
  if (!match) {
    console.log('patch: getReactVar: failed to find React variable');
    reactVarCache = undefined;
    return undefined;
  }
  reactVarCache = match[1];
  return reactVarCache;
};

/**
 * Clear the React var cache (useful for testing or multiple runs)
 */
export const clearReactVarCache = (): void => {
  reactVarCache = null;
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
  const boxVarPattern = new RegExp(`\\b([$\\w]+)=${boxOrigCompName}\\b`);
  const boxVarMatch = fileContents.match(boxVarPattern);
  if (!boxVarMatch) {
    console.error(
      'patch: findBoxComponent: failed to find Box component variable'
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

    if (isDebug()) {
      console.log(
        `Extracting claude.js from ${backupExists ? 'backup' : 'native installation'}: ${pathToExtractFrom}`
      );
    }

    const claudeJsBuffer = extractClaudeJsFromNativeInstallation(pathToExtractFrom);

    if (!claudeJsBuffer) {
      throw new Error('Failed to extract claude.js from native installation');
    }

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

  // Apply themes
  let result: string | null = null;
  if (config.settings.themes && config.settings.themes.length > 0) {
    if ((result = writeThemes(content, config.settings.themes)))
      content = result;
  }

  // Apply launch text
  if (config.settings.launchText) {
    const c = config.settings.launchText;
    let textToApply = '';
    if (c.method === 'custom' && c.customText) {
      textToApply = c.customText;
    } else if (c.method === 'figlet' && c.figletText) {
      textToApply = await new Promise<string>(resolve =>
        figlet.text(
          c.figletText.replace('\n', ' '),
          c.figletFont as unknown as figlet.Fonts,
          (err, data) => {
            if (err) {
              console.error('patch: figlet: failed to generate text', err);
              resolve('');
            } else {
              resolve(data || '');
            }
          }
        )
      );
    }
    if ((result = writeSigninBannerText(content, textToApply)))
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
        config.settings.userMessageDisplay.prefix.format,
        config.settings.userMessageDisplay.prefix.foreground_color,
        config.settings.userMessageDisplay.prefix.background_color,
        config.settings.userMessageDisplay.prefix.styling.includes('bold'),
        config.settings.userMessageDisplay.prefix.styling.includes('italic'),
        config.settings.userMessageDisplay.prefix.styling.includes('underline'),
        config.settings.userMessageDisplay.prefix.styling.includes(
          'strikethrough'
        ),
        config.settings.userMessageDisplay.prefix.styling.includes('inverse'),
        config.settings.userMessageDisplay.message.foreground_color,
        config.settings.userMessageDisplay.message.background_color,
        config.settings.userMessageDisplay.message.styling.includes('bold'),
        config.settings.userMessageDisplay.message.styling.includes('italic'),
        config.settings.userMessageDisplay.message.styling.includes(
          'underline'
        ),
        config.settings.userMessageDisplay.message.styling.includes(
          'strikethrough'
        ),
        config.settings.userMessageDisplay.message.styling.includes('inverse')
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

  // Disable Max subscription gating for cost tool (always enabled)
  if ((result = writeIgnoreMaxSubscription(content))) content = result;

  // Apply thinking visibility patch (always enabled)
  if ((result = writeThinkingVisibility(content))) content = result;

  // Apply system prompt customizations
  const systemPromptsResult = await applySystemPrompts(
    content,
    ccInstInfo.version
  );
  content = systemPromptsResult.newContent;
  items.push(...systemPromptsResult.items);

  // Apply patches applied indication
  const showTweakccVersion = config.settings.misc?.showTweakccVersion ?? true;
  const showPatchesApplied = config.settings.misc?.showPatchesApplied ?? true;
  if (
    (result = writePatchesAppliedIndication(
      content,
      '2.0.3',
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

  // Write the modified content back
  if (ccInstInfo.nativeInstallationPath) {
    // For native installations: repack the modified claude.js back into the binary
    if (isDebug()) {
      console.log(`Repacking modified claude.js into native installation: ${ccInstInfo.nativeInstallationPath}`);
    }

    const modifiedBuffer = Buffer.from(content, 'utf8');
    repackNativeInstallation(ccInstInfo.nativeInstallationPath, modifiedBuffer, ccInstInfo.nativeInstallationPath);
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
