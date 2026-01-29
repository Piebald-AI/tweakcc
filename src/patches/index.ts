import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

import {
  CONFIG_DIR,
  NATIVE_BINARY_BACKUP_FILE,
  updateConfigFile,
} from '../config';
import { ClaudeCodeInstallationInfo, TweakccConfig } from '../types';
import { debug, replaceFileBreakingHardLinks } from '../utils';
import {
  extractClaudeJsFromNativeInstallation,
  repackNativeInstallation,
} from '../nativeInstallationLoader';

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

import { writeShowMoreItemsInSelectMenus } from './showMoreItemsInSelectMenus';
import { writeThemes } from './themes';
import { writeContextLimit } from './contextLimit';
import { writeInputBoxBorder } from './inputBorderBox';
import { writeThinkerFormat } from './thinkerFormat';
import { writeThinkerSymbolMirrorOption } from './thinkerMirrorOption';
import { writeThinkerSymbolChars } from './thinkerSymbolChars';
import { writeThinkerSymbolSpeed } from './thinkerSymbolSpeed';
import { writeThinkerSymbolWidthLocation } from './thinkerSymbolWidth';
import { writeThinkingVerbs } from './thinkingVerbs';
import { writeUserMessageDisplay } from './userMessageDisplay';
import { writeInputPatternHighlighters } from './inputPatternHighlighters';
import { writeVerboseProperty } from './verboseProperty';
import { writeModelCustomizations } from './modelSelector';
import { writeOpusplan1m } from './opusplan1m';
import { writeThinkingVisibility } from './thinkingVisibility';
import { writeSubagentModels } from './subagentModels';
import { writePatchesAppliedIndication } from './patchesAppliedIndication';
import { applySystemPrompts } from './systemPrompts';
import { writeFixLspSupport } from './fixLspSupport';
import {
  writeToolsets,
  writeModeChangeUpdateToolset,
  addSetStateFnAccessAtToolChangeComponentScope,
} from './toolsets';
import { writeTableFormat } from './tableFormat';
import { writeConversationTitle } from './conversationTitle';
import { writeHideStartupBanner } from './hideStartupBanner';
import { writeHideCtrlGToEdit } from './hideCtrlGToEdit';
import { writeHideStartupClawd } from './hideStartupClawd';
import { writeIncreaseFileReadLimit } from './increaseFileReadLimit';
import { writeSuppressLineNumbers } from './suppressLineNumbers';
import { writeSuppressRateLimitOptions } from './suppressRateLimitOptions';
import { writeSwarmMode } from './swarmMode';
import { writeThinkingBlockStyling } from './thinkingBlockStyling';
import { writeMcpNonBlocking, writeMcpBatchSize } from './mcpStartup';
import {
  restoreNativeBinaryFromBackup,
  restoreClijsFromBackup,
} from '../installationBackup';
import { compareVersions } from '../systemPromptSync';

export { showDiff, globalReplace } from './patchDiffing';
export {
  findChalkVar,
  getModuleLoaderFunction,
  getReactModuleNameNonBun,
  getReactModuleFunctionBun,
  getReactVar,
  clearReactVarCache,
  findRequireFunc,
  getRequireFuncName,
  clearRequireFuncNameCache,
  findTextComponent,
  findBoxComponent,
} from './helpers';

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

export const escapeIdent = (ident: string): string => {
  return ident.replace(/\$/g, '\\$');
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

  // Apply table format preference (inject into system prompt)
  const tableFormat = config.settings.misc?.tableFormat ?? 'default';
  if (tableFormat !== 'default') {
    if ((result = writeTableFormat(content, tableFormat))) content = result;
  }

  // Apply themes
  if (config.settings.themes && config.settings.themes.length > 0) {
    if ((result = writeThemes(content, config.settings.themes)))
      content = result;
  }

  // Apply thinking verbs
  // prettier-ignore
  if (config.settings.thinkingVerbs) {
    if ((result = writeThinkingVerbs(content, config.settings.thinkingVerbs.verbs)))
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
        config.settings.userMessageDisplay
      ))
    ) {
      content = result;
    }
  }

  // Apply input pattern highlighters
  if (
    config.settings.inputPatternHighlighters &&
    config.settings.inputPatternHighlighters.length > 0
  ) {
    if (
      (result = writeInputPatternHighlighters(
        content,
        config.settings.inputPatternHighlighters
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

  // Apply context limit patch (always enabled)
  if ((result = writeContextLimit(content))) content = result;

  // Apply model customizations (known names, mapping, selector options) (always enabled)
  if ((result = writeModelCustomizations(content))) content = result;

  // Apply opusplan[1m] support (always enabled)
  // This adds support for using Opus in plan mode with Sonnet 1M in execution mode
  if ((result = writeOpusplan1m(content))) content = result;

  // Apply subagent model customizations
  if (config.settings.subagentModels) {
    if (
      (result = writeSubagentModels(content, config.settings.subagentModels))
    ) {
      content = result;
    }
  }

  // Apply show more items in select menus patch (always enabled)
  if ((result = writeShowMoreItemsInSelectMenus(content, 25))) content = result;

  // Apply thinking visibility patch (if enabled)
  if (config.settings.misc?.expandThinkingBlocks ?? true) {
    if ((result = writeThinkingVisibility(content))) content = result;
  }

  // Apply thinking label styling patch (always enabled)
  if ((result = writeThinkingBlockStyling(content))) content = result;

  // Apply patches applied indication
  const showTweakccVersion = config.settings.misc?.showTweakccVersion ?? true;
  const showPatchesApplied = config.settings.misc?.showPatchesApplied ?? true;
  if (
    (result = writePatchesAppliedIndication(
      content,
      '3.4.0',
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
  const isVersionBelow2064 =
    ccInstInfo.version && compareVersions(ccInstInfo.version, '2.0.64') < 0;
  if (enableConvTitle && isVersionBelow2064) {
    if ((result = writeConversationTitle(content))) content = result;
  }

  // Apply hide startup banner patch (if enabled)
  if (config.settings.misc?.hideStartupBanner) {
    if ((result = writeHideStartupBanner(content))) content = result;
  }

  // Apply hide ctrl-g to edit patch (if enabled)
  if (config.settings.misc?.hideCtrlGToEdit) {
    if ((result = writeHideCtrlGToEdit(content))) content = result;
  }

  // Apply hide startup clawd patch (if enabled)
  if (config.settings.misc?.hideStartupClawd) {
    if ((result = writeHideStartupClawd(content))) content = result;
  }

  // Apply increase file read limit patch (if enabled)
  if (config.settings.misc?.increaseFileReadLimit) {
    if ((result = writeIncreaseFileReadLimit(content))) content = result;
  }

  // Apply suppress line number patch (if enabled)
  if (config.settings.misc?.suppressLineNumbers) {
    if ((result = writeSuppressLineNumbers(content))) content = result;
  }

  // Apply suppress rate limit options patch (if enabled)
  if (config.settings.misc?.suppressRateLimitOptions) {
    if ((result = writeSuppressRateLimitOptions(content))) content = result;
  }

  // Apply swarm mode patch to enable native multi-agent features (if enabled)
  // This patches the tengu_brass_pebble statsig flag gate function to always return true
  if (config.settings.misc?.enableSwarmMode) {
    if ((result = writeSwarmMode(content))) content = result;
  }

  // Apply MCP startup optimization (if enabled)
  if (config.settings.misc?.mcpConnectionNonBlocking) {
    if ((result = writeMcpNonBlocking(content))) content = result;
  }
  if (config.settings.misc?.mcpServerBatchSize) {
    if (
      (result = writeMcpBatchSize(
        content,
        config.settings.misc.mcpServerBatchSize
      ))
    )
      content = result;
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
