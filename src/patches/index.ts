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
import { DEFAULT_SETTINGS } from '../defaultSettings';

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
import { writeToolsets } from './toolsets';
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

export { showDiff, showPositionalDiff, globalReplace } from './patchDiffing';
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

// =============================================================================
// Patch Group and Result Types
// =============================================================================

export enum PatchGroup {
  SYSTEM_PROMPTS = 'System Prompts',
  ALWAYS_APPLIED = 'Always Applied',
  MISC_CONFIGURABLE = 'Misc Configurable',
  NEW_FEATURES = 'New Features',
}

export interface PatchResult {
  id: string;
  name: string;
  group: PatchGroup;
  applied: boolean;
  details?: string;
  description?: string;
}

interface Patch {
  id: string;
  name: string;
  group: PatchGroup;
  fn: (content: string) => string | null;
  condition?: boolean;
  description?: string;
}

export interface ApplyCustomizationResult {
  config: TweakccConfig;
  results: PatchResult[];
}

// =============================================================================
// Legacy types (for backward compatibility with patchesAppliedIndication)
// =============================================================================

export interface PatchApplied {
  newContent: string;
  items: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

export const escapeIdent = (ident: string): string => {
  return ident.replace(/\$/g, '\\$');
};

/**
 * Apply a list of patches to content, tracking results
 */
const applyPatches = (
  content: string,
  patches: Patch[]
): { content: string; results: PatchResult[] } => {
  const results: PatchResult[] = [];

  for (const patch of patches) {
    // Skip patches where condition is explicitly false
    if (patch.condition === false) {
      continue;
    }

    debug(`Applying patch: ${patch.name}`);
    const result = patch.fn(content);
    const applied = result !== null;

    if (applied) {
      content = result;
    }

    results.push({
      id: patch.id,
      name: patch.name,
      group: patch.group,
      applied,
      description: patch.description,
    });
  }

  return { content, results };
};

// =============================================================================
// Main Apply Function
// =============================================================================

export const applyCustomization = async (
  config: TweakccConfig,
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<ApplyCustomizationResult> => {
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

  // Collect all patch results
  const allResults: PatchResult[] = [];

  // ==========================================================================
  // Apply system prompt customizations (has its own result format)
  // ==========================================================================
  const systemPromptsResult = await applySystemPrompts(
    content,
    ccInstInfo.version
  );
  content = systemPromptsResult.newContent;

  // Sort system prompt results alphabetically by name before adding
  const sortedSystemPromptResults = [...systemPromptsResult.results].sort(
    (a, b) => a.name.localeCompare(b.name)
  );
  allResults.push(...sortedSystemPromptResults);

  // Legacy items array for patchesAppliedIndication (backward compatibility)
  // Escape ANSI codes so they render properly when injected into cli.js
  const escapeForCliJs = (str: string): string =>
    str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  const legacyItems: string[] = sortedSystemPromptResults
    .filter(r => r.applied && r.details)
    .map(r => escapeForCliJs(`${r.name}: ${r.details}`));

  // Extract config values that are used multiple times or need pre-computation
  const tableFormat = config.settings.misc?.tableFormat ?? 'default';
  const showTweakccVersion = config.settings.misc?.showTweakccVersion ?? true;
  const showPatchesApplied = config.settings.misc?.showPatchesApplied ?? true;

  // Environment variable syntax depends on OS
  const contextLimitVar =
    process.platform === 'win32'
      ? '%CLAUDE_CODE_CONTEXT_LIMIT%'
      : '$CLAUDE_CODE_CONTEXT_LIMIT';

  // ==========================================================================
  // Define all patches
  // ==========================================================================
  const patches: Patch[] = [
    // -------------------------------------------------------------------------
    // Always Applied
    // -------------------------------------------------------------------------
    {
      id: 'verbose-property',
      name: 'verbose property',
      group: PatchGroup.ALWAYS_APPLIED,
      fn: c => writeVerboseProperty(c),
      description: 'Token counter will show (2s · ↓ 169 tokens · thinking)',
    },
    {
      id: 'context-limit',
      name: 'context limit',
      group: PatchGroup.ALWAYS_APPLIED,
      fn: c => writeContextLimit(c),
      description: `Set ${contextLimitVar} to change 200k max for custom models`,
    },
    {
      id: 'model-customizations',
      name: 'model customizations',
      group: PatchGroup.ALWAYS_APPLIED,
      fn: c => writeModelCustomizations(c),
      description: 'Access all Claude models with /model, not just latest 3',
    },
    {
      id: 'opusplan1m',
      name: 'opusplan[1m] support',
      group: PatchGroup.ALWAYS_APPLIED,
      fn: c => writeOpusplan1m(c),
      description:
        'Use "Opus Plan 1M": Opus for planning, Sonnet 1M context for building',
    },
    {
      id: 'show-more-items-in-select-menus',
      name: 'show more items in select menus',
      group: PatchGroup.ALWAYS_APPLIED,
      fn: c => writeShowMoreItemsInSelectMenus(c, 25),
      description: 'Shows 25 items in select menus instead of default 5',
    },
    {
      id: 'thinking-block-styling',
      name: 'thinking block styling',
      group: PatchGroup.ALWAYS_APPLIED,
      fn: c => writeThinkingBlockStyling(c),
      description: 'Restores dim/gray + italic styling for thinking blocks',
    },
    {
      id: 'fix-lsp-support',
      name: 'fix LSP support',
      group: PatchGroup.ALWAYS_APPLIED,
      fn: c => writeFixLspSupport(c),
      description: 'Enables/fixes nascent LSP support',
    },
    {
      id: 'patches-applied-indication',
      name: 'patches applied indication',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c =>
        writePatchesAppliedIndication(
          c,
          '3.4.0',
          legacyItems,
          showTweakccVersion,
          showPatchesApplied
        ),
      description:
        'Shows "tweakcc patches applied" and tweakcc version inside CC',
    },

    // -------------------------------------------------------------------------
    // Misc Configurable
    // -------------------------------------------------------------------------
    {
      id: 'table-format',
      name: `table format (${tableFormat})`,
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeTableFormat(c, tableFormat),
      condition: tableFormat !== 'default',
      description: 'Tables generated by Claude will be rendered more compactly',
    },
    {
      id: 'themes',
      name: 'themes',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeThemes(c, config.settings.themes!),
      condition: !!(
        config.settings.themes &&
        config.settings.themes.length > 0 &&
        JSON.stringify(config.settings.themes) !==
          JSON.stringify(DEFAULT_SETTINGS.themes)
      ),
      description: 'Your custom themes are now available via /theme',
    },
    {
      id: 'thinking-verbs',
      name: 'thinking verbs',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeThinkingVerbs(c, config.settings.thinkingVerbs!.verbs),
      condition: !!config.settings.thinkingVerbs,
      description: 'Your custom list of thinking verbs will be cycled through',
    },
    {
      id: 'thinker-format',
      name: 'thinker format',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeThinkerFormat(c, config.settings.thinkingVerbs!.format),
      condition: !!config.settings.thinkingVerbs,
    },
    {
      id: 'thinker-symbol-chars',
      name: 'thinker symbol chars',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeThinkerSymbolChars(c, config.settings.thinkingStyle.phases),
      condition:
        JSON.stringify(config.settings.thinkingStyle.phases) !==
        JSON.stringify(DEFAULT_SETTINGS.thinkingStyle.phases),
      description: 'Your custom thinking spinner will be rendered',
    },
    {
      id: 'thinker-symbol-speed',
      name: 'thinker symbol speed',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c =>
        writeThinkerSymbolSpeed(
          c,
          config.settings.thinkingStyle.updateInterval
        ),
      condition:
        config.settings.thinkingStyle.updateInterval !==
        DEFAULT_SETTINGS.thinkingStyle.updateInterval,
      description: `The thinking spinner will play at ${Math.round(1000 / config.settings.thinkingStyle.updateInterval)} FPS`,
    },
    {
      id: 'thinker-symbol-width',
      name: 'thinker symbol width',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c =>
        writeThinkerSymbolWidthLocation(
          c,
          Math.max(...config.settings.thinkingStyle.phases.map(p => p.length)) +
            1
        ),
      condition:
        JSON.stringify(config.settings.thinkingStyle.phases) !==
        JSON.stringify(DEFAULT_SETTINGS.thinkingStyle.phases),
      description: `The thinking spinner will be in a box ${Math.max(...config.settings.thinkingStyle.phases.map(p => p.length)) + 1} chars wide`,
    },
    {
      id: 'thinker-symbol-mirror',
      name: 'thinker symbol mirror',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c =>
        writeThinkerSymbolMirrorOption(
          c,
          config.settings.thinkingStyle.reverseMirror
        ),
      condition:
        config.settings.thinkingStyle.reverseMirror !==
        DEFAULT_SETTINGS.thinkingStyle.reverseMirror,
      description: config.settings.thinkingStyle.reverseMirror
        ? 'The thinking spinner will reverse when it reaches the end'
        : 'The thinking spinner will restart when it finishes',
    },
    {
      id: 'input-box-border',
      name: 'input box border',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeInputBoxBorder(c, config.settings.inputBox!.removeBorder),
      condition: !!(
        config.settings.inputBox &&
        typeof config.settings.inputBox.removeBorder === 'boolean'
      ),
      description:
        "Your custom styles to the main input box's border have been applied",
    },
    {
      id: 'subagent-models',
      name: 'subagent models',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeSubagentModels(c, config.settings.subagentModels!),
      condition: !!config.settings.subagentModels,
      description: `Plan=${config.settings.subagentModels?.plan ?? 'default'}, Explore=${config.settings.subagentModels?.explore ?? 'default'}, General=${config.settings.subagentModels?.generalPurpose ?? 'default'}`,
    },
    {
      id: 'thinking-visibility',
      name: 'thinking block visibility',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeThinkingVisibility(c),
      condition: config.settings.misc?.expandThinkingBlocks ?? true,
      description:
        'Thinking blocks outputted by the model will show without Ctrl+O',
    },
    {
      id: 'hide-startup-banner',
      name: 'hide startup banner',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeHideStartupBanner(c),
      condition: !!config.settings.misc?.hideStartupBanner,
      description:
        'CC\'s startup banner with "Clawd" and release notes is hidden',
    },
    {
      id: 'hide-ctrl-g-to-edit',
      name: 'hide ctrl-g to edit',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeHideCtrlGToEdit(c),
      condition: !!config.settings.misc?.hideCtrlGToEdit,
      description: 'Note about using Ctrl+G to edit prompt is hidden',
    },
    {
      id: 'hide-startup-clawd',
      name: 'hide startup clawd',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeHideStartupClawd(c),
      condition: !!config.settings.misc?.hideStartupClawd,
      description:
        'The "Clawd" icon on startup will be hidden for a cleaner look',
    },
    {
      id: 'increase-file-read-limit',
      name: 'increase file read limit',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeIncreaseFileReadLimit(c),
      condition: !!config.settings.misc?.increaseFileReadLimit,
      description: `Max tokens Claude can read from a file at once: 25000 -> ${config.settings.misc?.increaseFileReadLimit ?? 25000}`,
    },
    {
      id: 'suppress-line-numbers',
      name: 'suppress line numbers',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeSuppressLineNumbers(c),
      condition: !!config.settings.misc?.suppressLineNumbers,
      description:
        '"1→" "2→" etc. prefixes for each line of Read output are omitted',
    },
    {
      id: 'suppress-rate-limit-options',
      name: 'suppress rate limit options',
      group: PatchGroup.MISC_CONFIGURABLE,
      fn: c => writeSuppressRateLimitOptions(c),
      condition: !!config.settings.misc?.suppressRateLimitOptions,
      description:
        "/rate-limit-options won't be injected when limits are reached",
    },

    // -------------------------------------------------------------------------
    // New Features
    // -------------------------------------------------------------------------
    {
      id: 'swarm-mode',
      name: 'swarm mode',
      group: PatchGroup.NEW_FEATURES,
      fn: c => writeSwarmMode(c),
      condition: !!config.settings.misc?.enableSwarmMode,
      description: 'SWARM MODE in Claude Code is enabled',
    },
    {
      id: 'toolsets',
      name: 'toolsets',
      group: PatchGroup.NEW_FEATURES,
      fn: c =>
        writeToolsets(
          c,
          config.settings.toolsets!,
          config.settings.defaultToolset,
          config.settings.planModeToolset
        ),
      condition: !!(
        config.settings.toolsets && config.settings.toolsets.length > 0
      ),
      description: `${config.settings.toolsets?.length ?? 0} custom toolsets are now registered`,
    },
    {
      id: 'mcp-non-blocking',
      name: 'MCP non-blocking',
      group: PatchGroup.NEW_FEATURES,
      fn: c => writeMcpNonBlocking(c),
      condition: !!config.settings.misc?.mcpConnectionNonBlocking,
      description:
        'If you have MCP servers, CC startup will now be much faster',
    },
    {
      id: 'mcp-batch-size',
      name: `MCP batch size (${config.settings.misc?.mcpServerBatchSize ?? 'default'})`,
      group: PatchGroup.NEW_FEATURES,
      fn: c => writeMcpBatchSize(c, config.settings.misc!.mcpServerBatchSize!),
      condition: !!config.settings.misc?.mcpServerBatchSize,
    },
    {
      id: 'user-message-display',
      name: 'user message display',
      group: PatchGroup.NEW_FEATURES,
      fn: c => writeUserMessageDisplay(c, config.settings.userMessageDisplay!),
      condition: !!config.settings.userMessageDisplay,
      description: 'User messages in the chat history will be styled',
    },
    {
      id: 'input-pattern-highlighters',
      name: 'input pattern highlighters',
      group: PatchGroup.NEW_FEATURES,
      fn: c =>
        writeInputPatternHighlighters(
          c,
          config.settings.inputPatternHighlighters!
        ),
      condition: !!(
        config.settings.inputPatternHighlighters &&
        config.settings.inputPatternHighlighters.length > 0
      ),
      description: `${config.settings.inputPatternHighlighters?.length ?? 0} custom input highlighters registered`,
    },
    {
      id: 'conversation-title',
      name: 'conversation title',
      group: PatchGroup.NEW_FEATURES,
      fn: c => writeConversationTitle(c),
      condition:
        (config.settings.misc?.enableConversationTitle ?? true) &&
        !!(
          ccInstInfo.version &&
          compareVersions(ccInstInfo.version, '2.0.64') < 0
        ),
      description: '/title command created & enabled',
    },
  ];

  // ==========================================================================
  // Apply all patches
  // ==========================================================================
  const { content: patchedContent, results: patchResults } = applyPatches(
    content,
    patches
  );
  content = patchedContent;
  allResults.push(...patchResults);

  // ==========================================================================
  // Write the modified content back
  // ==========================================================================
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

  const updatedConfig = await updateConfigFile(cfg => {
    cfg.changesApplied = true;
  });

  return {
    config: updatedConfig,
    results: allResults,
  };
};
