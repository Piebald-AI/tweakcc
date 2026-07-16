/**
 * Pre-apply plan + consent helpers for `tweakcc --apply`.
 *
 * Mirrors the enablement conditions in `patches/index.ts` `applyCustomization`
 * so users can see (and approve) what will run before their CC binary is rewritten.
 */

import chalk from 'chalk';

import { DEFAULT_SETTINGS } from './defaultSettings';
import {
  getAllPatchDefinitions,
  PatchDefinition,
  PatchGroup,
  PatchId,
} from './patches/index';
import { TweakccConfig } from './types';
import { compareVersions } from './systemPromptSync';

export interface PlannedPatch extends PatchDefinition {
  /** Enabled because a DEFAULT_SETTINGS value turns this patch on. */
  defaultOn: boolean;
}

/**
 * Patches that DEFAULT_SETTINGS alone would attempt (excluding version-gated ones
 * that need a specific CC version). Used to mark "default-on" in the summary.
 */
const DEFAULT_ON_WITHOUT_VERSION_GATE = new Set<PatchId>([
  // Always-applied (no false condition under typical installs)
  'verbose-property',
  'opusplan1m',
  'fix-lsp-support',
  'clear-screen',
  'session-color',
  'keybinding-customization',
  'patches-applied-indication',
  // Misc / features enabled by DEFAULT_SETTINGS
  'model-customizations',
  'show-more-items-in-select-menus',
  'thinking-visibility',
  'agents-md',
  'input-chevron-color',
  'session-memory',
  'worktree-mode',
  'mcp-non-blocking',
]);

/**
 * Whether a patch would be attempted for this config (condition !== false).
 * Keep in sync with `applyCustomization` in patches/index.ts.
 */
export function isPatchEnabledByConfig(
  id: PatchId,
  config: TweakccConfig,
  version: string | null | undefined
): boolean {
  const misc = config.settings.misc;
  const modelCustomizationsEnabled = misc?.enableModelCustomizations ?? true;
  const tableFormat = misc?.tableFormat ?? 'default';

  switch (id) {
    case 'verbose-property':
    case 'opusplan1m':
    case 'fix-lsp-support':
    case 'clear-screen':
    case 'session-color':
    case 'keybinding-customization':
    case 'patches-applied-indication':
      return true;
    case 'thinking-block-styling':
      return version == null || compareVersions(version, '2.1.26') < 0;
    case 'statusline-update-throttle':
      return misc?.statuslineThrottleMs != null;
    case 'context-limit':
      return !!misc?.enableContextLimitOverride;
    case 'model-customizations':
    case 'show-more-items-in-select-menus':
      return modelCustomizationsEnabled;
    case 'table-format':
      return tableFormat !== 'default';
    case 'themes':
      return !!(
        config.settings.themes &&
        config.settings.themes.length > 0 &&
        JSON.stringify(config.settings.themes) !==
          JSON.stringify(DEFAULT_SETTINGS.themes)
      );
    case 'thinking-verbs':
      return (
        !!config.settings.thinkingVerbs &&
        JSON.stringify(config.settings.thinkingVerbs.verbs) !==
          JSON.stringify(DEFAULT_SETTINGS.thinkingVerbs.verbs)
      );
    case 'thinker-format':
      return (
        !!config.settings.thinkingVerbs &&
        config.settings.thinkingVerbs.format !==
          DEFAULT_SETTINGS.thinkingVerbs.format
      );
    case 'thinker-symbol-chars':
    case 'thinker-symbol-width':
      return (
        JSON.stringify(config.settings.thinkingStyle.phases) !==
        JSON.stringify(DEFAULT_SETTINGS.thinkingStyle.phases)
      );
    case 'thinker-symbol-speed':
      return (
        config.settings.thinkingStyle.updateInterval !==
          DEFAULT_SETTINGS.thinkingStyle.updateInterval &&
        (version == null || compareVersions(version, '2.1.27') < 0)
      );
    case 'thinker-symbol-mirror':
      return (
        config.settings.thinkingStyle.reverseMirror !==
        DEFAULT_SETTINGS.thinkingStyle.reverseMirror
      );
    case 'input-box-border':
      return !!(
        config.settings.inputBox &&
        config.settings.inputBox.removeBorder !==
          DEFAULT_SETTINGS.inputBox.removeBorder
      );
    case 'input-chevron-color':
      return !!config.settings.inputBox?.chevronIdleThemeColor;
    case 'subagent-models':
      return (
        !!config.settings.subagentModels &&
        JSON.stringify(config.settings.subagentModels) !==
          JSON.stringify(DEFAULT_SETTINGS.subagentModels)
      );
    case 'thinking-visibility':
      return misc?.expandThinkingBlocks ?? true;
    case 'hide-startup-banner':
      return !!misc?.hideStartupBanner;
    case 'hide-ctrl-g-to-edit':
      return !!misc?.hideCtrlGToEdit;
    case 'hide-startup-clawd':
      return !!misc?.hideStartupClawd;
    case 'increase-file-read-limit':
      return !!misc?.increaseFileReadLimit;
    case 'suppress-line-numbers':
      return !!misc?.suppressLineNumbers;
    case 'suppress-rate-limit-options':
      return !!misc?.suppressRateLimitOptions;
    case 'suppress-rate-limit-warning':
      return !!misc?.suppressRateLimitWarning;
    case 'token-count-rounding':
      return !!misc?.tokenCountRounding;
    case 'remember-skill':
      return !!misc?.enableRememberSkill;
    case 'agents-md':
      return !!(
        config.settings.claudeMdAltNames &&
        config.settings.claudeMdAltNames.length > 0
      );
    case 'auto-accept-plan-mode':
      return !!misc?.autoAcceptPlanMode;
    case 'allow-sudo-bypass-permissions':
      return !!misc?.allowBypassPermissionsInSudo;
    case 'suppress-native-installer-warning':
      return !!misc?.suppressNativeInstallerWarning;
    case 'filter-scroll-escape-sequences':
      return !!misc?.filterScrollEscapeSequences;
    case 'allow-custom-agent-models':
      return !!misc?.allowCustomAgentModels;
    case 'worktree-mode':
      return !!misc?.enableWorktreeMode;
    case 'session-memory':
      return !!misc?.enableSessionMemory;
    case 'toolsets':
      return !!(
        config.settings.toolsets && config.settings.toolsets.length > 0
      );
    case 'mcp-non-blocking':
      return !!misc?.mcpConnectionNonBlocking;
    case 'mcp-batch-size':
      return !!misc?.mcpServerBatchSize;
    case 'user-message-display':
      return !!config.settings.userMessageDisplay;
    case 'input-pattern-highlighters':
      return !!(
        config.settings.inputPatternHighlighters &&
        config.settings.inputPatternHighlighters.length > 0
      );
    case 'conversation-title':
      return (
        (misc?.enableConversationTitle ?? true) &&
        !!(version && compareVersions(version, '2.0.64') < 0)
      );
    case 'voice-mode':
      return !!misc?.enableVoiceMode;
    case 'channels-mode':
      return !!misc?.enableChannelsMode;
    default:
      // New PatchIds should get an explicit case above.
      return true;
  }
}

export function getPlannedPatches(
  config: TweakccConfig,
  version: string | null | undefined,
  patchFilter?: string[] | null
): PlannedPatch[] {
  const planned: PlannedPatch[] = [];

  for (const def of getAllPatchDefinitions()) {
    if (patchFilter && !patchFilter.includes(def.id)) {
      continue;
    }
    if (!isPatchEnabledByConfig(def.id, config, version)) {
      continue;
    }
    planned.push({
      ...def,
      defaultOn: DEFAULT_ON_WITHOUT_VERSION_GATE.has(def.id),
    });
  }

  return planned;
}

export function printApplyPlan(
  planned: PlannedPatch[],
  options: {
    configSource: string;
    patchFilter: string[] | null;
    ccVersion?: string;
  }
): void {
  const groupOrder = [
    PatchGroup.ALWAYS_APPLIED,
    PatchGroup.MISC_CONFIGURABLE,
    PatchGroup.FEATURES,
  ];

  console.log(chalk.bold('\nPre-apply summary'));
  console.log(chalk.gray(`  Config: ${options.configSource}`));
  if (options.ccVersion) {
    console.log(chalk.gray(`  Claude Code: ${options.ccVersion}`));
  }
  if (options.patchFilter) {
    console.log(
      chalk.gray(`  Patch filter: ${options.patchFilter.join(', ')}`)
    );
  }
  console.log(
    chalk.gray(
      '  Patches below are what --apply will attempt (pattern match may still fail).'
    )
  );

  const byGroup = new Map<PatchGroup, PlannedPatch[]>();
  for (const group of groupOrder) {
    byGroup.set(group, []);
  }
  for (const patch of planned) {
    byGroup.get(patch.group)?.push(patch);
  }

  for (const group of groupOrder) {
    const groupPatches = byGroup.get(group)!;
    if (groupPatches.length === 0) continue;

    console.log(`\n  ${chalk.bold(group)}:`);
    for (const patch of groupPatches) {
      const marker = patch.defaultOn ? chalk.yellow(' [default-on]') : '';
      console.log(`    • ${patch.name} ${chalk.dim(`(${patch.id})`)}${marker}`);
      if (patch.description) {
        console.log(`      ${chalk.gray(patch.description)}`);
      }
    }
  }

  console.log('');
}
