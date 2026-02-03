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
// - Always use [$\w]+ instead of \w+ to match identifiers (variable/function names), because at
//   least in Node.js's regex engine, \w+ does not include $, so ABC$, which is a perfectly valid
//   identifier, would not be matched.  The way cli.js is minified, $ frequently appears in global
//   identifiers.
//
// - When starting a regular expression with an identifier name, for example if you're matching a
//   string of the form "someVarName = ...", make sure to put some kind of word boundary at the
//   beginning, e.g. `,` `;` `}` or `{`.  This can **SIGNIFICANTLY** speed up matching, easily
//   bringing a 1.5s search down to 30ms.  **DO NOT** use `\b`, because it doesn't properly treat
//   `$`, which appears in identifiers often, as a word character, so `\b[$\w]+` will NOT match `,$=`.
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
import { writeSessionMemory } from './sessionMemory';
import { writeRememberSkill } from './rememberSkill';
import { writeThinkingBlockStyling } from './thinkingBlockStyling';
import { writeMcpNonBlocking, writeMcpBatchSize } from './mcpStartup';
import { writeStatuslineUpdateThrottle } from './statuslineUpdateThrottle';
import { writeTokenCountRounding } from './tokenCountRounding';
import { writeAgentsMd } from './agentsMd';
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
  FEATURES = 'Features',
}

export interface PatchResult {
  id: string;
  name: string;
  group: PatchGroup;
  applied: boolean;
  failed?: boolean;
  skipped?: boolean;
  details?: string;
  description?: string;
}

export interface ApplyCustomizationResult {
  config: TweakccConfig;
  results: PatchResult[];
}

// =============================================================================
// Patch Definitions (Single Source of Truth)
// =============================================================================

/**
 * All patch definitions with their metadata.
 * This is the single source of truth for patch IDs, names, groups, and descriptions.
 */
const PATCH_DEFINITIONS = [
  // Always Applied
  {
    id: 'verbose-property',
    name: 'Verbose property',
    group: PatchGroup.ALWAYS_APPLIED,
    description: 'Token counter will show (2s · ↓ 169 tokens · thinking)',
  },
  {
    id: 'context-limit',
    name: 'Context limit',
    group: PatchGroup.ALWAYS_APPLIED,
    description:
      'Set the CLAUDE_CODE_CONTEXT_LIMIT env var to change 200k max for custom models',
  },
  {
    id: 'model-customizations',
    name: 'Model customizations',
    group: PatchGroup.ALWAYS_APPLIED,
    description: 'Access all Claude models with /model, not just latest 3',
  },
  {
    id: 'opusplan1m',
    name: 'Opusplan[1m] support',
    group: PatchGroup.ALWAYS_APPLIED,
    description:
      'Use the "Opus Plan 1M" model: Opus for planning, Sonnet 1M context for building',
  },
  {
    id: 'show-more-items-in-select-menus',
    name: 'Show more items in select menus',
    group: PatchGroup.ALWAYS_APPLIED,
    description: 'Show 25 items in select menus instead of default 5',
  },
  {
    id: 'thinking-block-styling',
    name: 'Thinking block styling',
    group: PatchGroup.ALWAYS_APPLIED,
    description: 'Restore dim/gray + italic styling for thinking blocks',
  },
  {
    id: 'fix-lsp-support',
    name: 'Fix LSP support',
    group: PatchGroup.ALWAYS_APPLIED,
    description: 'Enable/fix nascent LSP support',
  },
  {
    id: 'statusline-update-throttle',
    name: `Statusline update throttling correction`,
    group: PatchGroup.ALWAYS_APPLIED,
    description: `Statusline updates will be properly throttled instead of queued (or debounced)`,
  },
  // Misc Configurable
  {
    id: 'patches-applied-indication',
    name: 'Patches applied indication',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Show "tweakcc patches applied" and tweakcc version inside CC',
  },
  {
    id: 'table-format',
    name: 'Table format',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Tables generated by Claude will be rendered more compactly',
  },
  {
    id: 'themes',
    name: 'Themes',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Your custom themes will be available via /theme',
  },
  {
    id: 'thinking-verbs',
    name: 'Thinking verbs',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Your custom list of thinking verbs will be cycled through',
  },
  {
    id: 'thinker-format',
    name: 'Thinker format',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'Your custom format string that thinking verbs are wrapped in will be applied',
  },
  {
    id: 'thinker-symbol-chars',
    name: 'Thinker symbol chars',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Your custom thinking spinner will be rendered',
  },
  {
    id: 'thinker-symbol-speed',
    name: 'Thinker symbol speed',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'The thinking spinner will play at a custom FPS',
  },
  {
    id: 'thinker-symbol-width',
    name: 'Thinker symbol width',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'The thinking spinner will be in a box of custom width',
  },
  {
    id: 'thinker-symbol-mirror',
    name: 'Thinker symbol mirror',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'The thinking spinner will reverse or restart when it finishes',
  },
  {
    id: 'input-box-border',
    name: 'Input box border',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      "Your custom styles to the main input box's border will be applied",
  },
  {
    id: 'subagent-models',
    name: 'Subagent models',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Use custom models for Plan, Explore, and General subagents',
  },
  {
    id: 'thinking-visibility',
    name: 'Thinking block visibility',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'Thinking blocks outputted by the model will show without Ctrl+O',
  },
  {
    id: 'hide-startup-banner',
    name: 'Hide startup banner',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'CC\'s startup banner with "Clawd" and release notes will be hidden',
  },
  {
    id: 'hide-ctrl-g-to-edit',
    name: 'Hide Ctrl+G to edit',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Note about using Ctrl+G to edit prompt will be hidden',
  },
  {
    id: 'hide-startup-clawd',
    name: 'Hide startup Clawd',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'The "Clawd" icon on startup will be hidden for a cleaner look',
  },
  {
    id: 'increase-file-read-limit',
    name: 'Increase file read limit',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'Max tokens Claude can read from a file at once will be increased',
  },
  {
    id: 'suppress-line-numbers',
    name: 'Suppress line numbers',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      '"1→" "2→" etc. prefixes for each line of Read output will be omitted',
  },
  {
    id: 'suppress-rate-limit-options',
    name: 'Suppress rate limit options',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      "/rate-limit-options won't be injected when limits are reached",
  },
  {
    id: 'token-count-rounding',
    name: 'Token count rounding',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'Round displayed token counts to the nearest multiple of chosen value',
  },
  {
    id: 'remember-skill',
    name: 'Remember skill',
    group: PatchGroup.MISC_CONFIGURABLE,
    description:
      'Register the built-in "/remember" skill to review session memories and update CLAUDE.local.md',
  },
  {
    id: 'agents-md',
    name: 'AGENTS.md (and others)',
    group: PatchGroup.MISC_CONFIGURABLE,
    description: 'Support AGENTS.md and others in addition to CLAUDE.md',
  },
  // Features
  {
    id: 'swarm-mode',
    name: 'Swarm mode',
    group: PatchGroup.FEATURES,
    description: 'Enable SWARM MODE in Claude Code',
  },
  {
    id: 'session-memory',
    name: 'Session memory',
    group: PatchGroup.FEATURES,
    description:
      'Enable session memory (auto-extraction + past session search)',
  },
  {
    id: 'toolsets',
    name: 'Toolsets',
    group: PatchGroup.FEATURES,
    description: 'Custom toolsets will be registered',
  },
  {
    id: 'mcp-non-blocking',
    name: 'MCP non-blocking',
    group: PatchGroup.FEATURES,
    description: 'If you have MCP servers, CC startup will be much faster',
  },
  {
    id: 'mcp-batch-size',
    name: 'MCP batch size',
    group: PatchGroup.FEATURES,
    description: 'Change the number of MCP servers started in parallel',
  },
  {
    id: 'user-message-display',
    name: 'User message display',
    group: PatchGroup.FEATURES,
    description: 'User messages in the chat history will be styled',
  },
  {
    id: 'input-pattern-highlighters',
    name: 'Input pattern highlighters',
    group: PatchGroup.FEATURES,
    description: 'Custom input highlighters will be registered',
  },
  {
    id: 'conversation-title',
    name: 'Conversation title',
    group: PatchGroup.FEATURES,
    description: '/title command will be created & enabled',
  },
] as const;

/** Union type of all valid patch IDs */
export type PatchId = (typeof PATCH_DEFINITIONS)[number]['id'];

/** Patch definition interface (derived from PATCH_DEFINITIONS) */
export interface PatchDefinition {
  id: PatchId;
  name: string;
  group: PatchGroup;
  description: string;
}

/**
 * Returns the list of all available patches with their IDs, names, groups, and descriptions.
 * Used by --list-patches flag.
 */
export const getAllPatchDefinitions = (): PatchDefinition[] => {
  return [...PATCH_DEFINITIONS];
};

/** Patch implementation with function and optional condition */
interface PatchImplementation {
  fn: (content: string) => string | null;
  condition?: boolean;
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
 * Apply patches to content using the implementations map, tracking results.
 * @param patchFilter - Optional list of patch IDs to apply (if provided, only matching patches are applied)
 */
const applyPatchImplementations = (
  content: string,
  implementations: Record<PatchId, PatchImplementation>,
  patchFilter?: string[] | null
): { content: string; results: PatchResult[] } => {
  const results: PatchResult[] = [];

  // Process patches in the order defined in PATCH_DEFINITIONS
  for (const def of PATCH_DEFINITIONS) {
    const impl = implementations[def.id];

    // Skip patches not in the filter (if filter is provided)
    if (patchFilter && !patchFilter.includes(def.id)) {
      results.push({
        id: def.id,
        name: def.name,
        group: def.group,
        applied: false,
        skipped: true,
        description: def.description,
      });
      continue;
    }

    // Skip patches where condition is explicitly false, but record them as skipped
    if (impl.condition === false) {
      results.push({
        id: def.id,
        name: def.name,
        group: def.group,
        applied: false,
        skipped: true,
        description: def.description,
      });
      continue;
    }

    debug(`Applying patch: ${def.name}`);
    const result = impl.fn(content);
    const failed = result === null;
    const applied = !failed && result !== content;

    if (!failed) {
      content = result;
    }

    results.push({
      id: def.id,
      name: def.name,
      group: def.group,
      applied,
      failed,
      description: def.description,
    });
  }

  return { content, results };
};

// =============================================================================
// Main Apply Function
// =============================================================================

export const applyCustomization = async (
  config: TweakccConfig,
  ccInstInfo: ClaudeCodeInstallationInfo,
  patchFilter?: string[] | null
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
    ccInstInfo.version,
    undefined, // escapeNonAscii - auto-detect
    patchFilter
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

  // ==========================================================================
  // Define patch implementations (keyed by PatchId)
  // ==========================================================================
  const patchImplementations: Record<PatchId, PatchImplementation> = {
    // Always Applied
    'verbose-property': {
      fn: c => writeVerboseProperty(c),
    },
    'context-limit': {
      fn: c => writeContextLimit(c),
    },
    'model-customizations': {
      fn: c => writeModelCustomizations(c),
    },
    opusplan1m: {
      fn: c => writeOpusplan1m(c),
    },
    'show-more-items-in-select-menus': {
      fn: c => writeShowMoreItemsInSelectMenus(c, 25),
    },
    'thinking-block-styling': {
      fn: c => writeThinkingBlockStyling(c),
      condition:
        ccInstInfo.version == null ||
        compareVersions(ccInstInfo.version, '2.1.26') < 0,
    },
    'fix-lsp-support': {
      fn: c => writeFixLspSupport(c),
    },
    'statusline-update-throttle': {
      fn: c =>
        writeStatuslineUpdateThrottle(
          c,
          config.settings.misc?.statuslineThrottleMs ?? 300,
          config.settings.misc?.statuslineUseFixedInterval ?? false
        ),
      condition: config.settings.misc?.statuslineThrottleMs != null,
    },
    // Misc Configurable
    'patches-applied-indication': {
      fn: c =>
        writePatchesAppliedIndication(
          c,
          '3.4.0',
          legacyItems,
          showTweakccVersion,
          showPatchesApplied
        ),
    },
    'table-format': {
      fn: c => writeTableFormat(c, tableFormat),
      condition: tableFormat !== 'default',
    },
    themes: {
      fn: c => writeThemes(c, config.settings.themes!),
      condition: !!(
        config.settings.themes &&
        config.settings.themes.length > 0 &&
        JSON.stringify(config.settings.themes) !==
          JSON.stringify(DEFAULT_SETTINGS.themes)
      ),
    },
    'thinking-verbs': {
      fn: c => writeThinkingVerbs(c, config.settings.thinkingVerbs!.verbs),
      condition: !!config.settings.thinkingVerbs,
    },
    'thinker-format': {
      fn: c => writeThinkerFormat(c, config.settings.thinkingVerbs!.format),
      condition: !!config.settings.thinkingVerbs,
    },
    'thinker-symbol-chars': {
      fn: c => writeThinkerSymbolChars(c, config.settings.thinkingStyle.phases),
      condition:
        JSON.stringify(config.settings.thinkingStyle.phases) !==
        JSON.stringify(DEFAULT_SETTINGS.thinkingStyle.phases),
    },
    'thinker-symbol-speed': {
      fn: c =>
        writeThinkerSymbolSpeed(
          c,
          config.settings.thinkingStyle.updateInterval
        ),
      condition:
        config.settings.thinkingStyle.updateInterval !==
        DEFAULT_SETTINGS.thinkingStyle.updateInterval,
    },
    'thinker-symbol-width': {
      fn: c =>
        writeThinkerSymbolWidthLocation(
          c,
          Math.max(...config.settings.thinkingStyle.phases.map(p => p.length)) +
            1
        ),
      condition:
        JSON.stringify(config.settings.thinkingStyle.phases) !==
        JSON.stringify(DEFAULT_SETTINGS.thinkingStyle.phases),
    },
    'thinker-symbol-mirror': {
      fn: c =>
        writeThinkerSymbolMirrorOption(
          c,
          config.settings.thinkingStyle.reverseMirror
        ),
      condition:
        config.settings.thinkingStyle.reverseMirror !==
        DEFAULT_SETTINGS.thinkingStyle.reverseMirror,
    },
    'input-box-border': {
      fn: c => writeInputBoxBorder(c, config.settings.inputBox!.removeBorder),
      condition: !!(
        config.settings.inputBox &&
        typeof config.settings.inputBox.removeBorder === 'boolean'
      ),
    },
    'subagent-models': {
      fn: c => writeSubagentModels(c, config.settings.subagentModels!),
      condition: !!config.settings.subagentModels,
    },
    'thinking-visibility': {
      fn: c => writeThinkingVisibility(c),
      condition: config.settings.misc?.expandThinkingBlocks ?? true,
    },
    'hide-startup-banner': {
      fn: c => writeHideStartupBanner(c),
      condition: !!config.settings.misc?.hideStartupBanner,
    },
    'hide-ctrl-g-to-edit': {
      fn: c => writeHideCtrlGToEdit(c),
      condition: !!config.settings.misc?.hideCtrlGToEdit,
    },
    'hide-startup-clawd': {
      fn: c => writeHideStartupClawd(c),
      condition: !!config.settings.misc?.hideStartupClawd,
    },
    'increase-file-read-limit': {
      fn: c => writeIncreaseFileReadLimit(c),
      condition: !!config.settings.misc?.increaseFileReadLimit,
    },
    'suppress-line-numbers': {
      fn: c => writeSuppressLineNumbers(c),
      condition: !!config.settings.misc?.suppressLineNumbers,
    },
    'suppress-rate-limit-options': {
      fn: c => writeSuppressRateLimitOptions(c),
      condition: !!config.settings.misc?.suppressRateLimitOptions,
    },
    'token-count-rounding': {
      fn: c =>
        writeTokenCountRounding(c, config.settings.misc!.tokenCountRounding!),
      condition: !!config.settings.misc?.tokenCountRounding,
    },
    'remember-skill': {
      fn: c => writeRememberSkill(c),
      condition: !!config.settings.misc?.enableRememberSkill,
    },
    'agents-md': {
      fn: c => writeAgentsMd(c, config.settings.claudeMdAltNames!),
      condition: !!(
        config.settings.claudeMdAltNames &&
        config.settings.claudeMdAltNames.length > 0
      ),
    },
    // Features
    'swarm-mode': {
      fn: c => writeSwarmMode(c),
      condition: !!config.settings.misc?.enableSwarmMode,
    },
    'session-memory': {
      fn: c => writeSessionMemory(c),
      condition: !!config.settings.misc?.enableSessionMemory,
    },
    toolsets: {
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
    },
    'mcp-non-blocking': {
      fn: c => writeMcpNonBlocking(c),
      condition: !!config.settings.misc?.mcpConnectionNonBlocking,
    },
    'mcp-batch-size': {
      fn: c => writeMcpBatchSize(c, config.settings.misc!.mcpServerBatchSize!),
      condition: !!config.settings.misc?.mcpServerBatchSize,
    },
    'user-message-display': {
      fn: c => writeUserMessageDisplay(c, config.settings.userMessageDisplay!),
      condition: !!config.settings.userMessageDisplay,
    },
    'input-pattern-highlighters': {
      fn: c =>
        writeInputPatternHighlighters(
          c,
          config.settings.inputPatternHighlighters!
        ),
      condition: !!(
        config.settings.inputPatternHighlighters &&
        config.settings.inputPatternHighlighters.length > 0
      ),
    },
    'conversation-title': {
      fn: c => writeConversationTitle(c),
      condition:
        (config.settings.misc?.enableConversationTitle ?? true) &&
        !!(
          ccInstInfo.version &&
          compareVersions(ccInstInfo.version, '2.0.64') < 0
        ),
    },
  };

  // ==========================================================================
  // Apply all patches
  // ==========================================================================
  const { content: patchedContent, results: patchResults } =
    applyPatchImplementations(content, patchImplementations, patchFilter);
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
