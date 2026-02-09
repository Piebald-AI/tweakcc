import { VSCodeFork } from './vscode/extensionTypes';

export interface Theme {
  name: string;
  id: string;
  colors: {
    autoAccept: string;
    bashBorder: string;
    claude: string;
    claudeShimmer: string;
    claudeBlue_FOR_SYSTEM_SPINNER: string;
    claudeBlueShimmer_FOR_SYSTEM_SPINNER: string;
    permission: string;
    permissionShimmer: string;
    planMode: string;
    ide: string;
    promptBorder: string;
    promptBorderShimmer: string;
    text: string;
    inverseText: string;
    inactive: string;
    subtle: string;
    suggestion: string;
    remember: string;
    background: string;
    success: string;
    error: string;
    warning: string;
    warningShimmer: string;
    diffAdded: string;
    diffRemoved: string;
    diffAddedDimmed: string;
    diffRemovedDimmed: string;
    diffAddedWord: string;
    diffRemovedWord: string;
    diffAddedWordDimmed: string;
    diffRemovedWordDimmed: string;
    red_FOR_SUBAGENTS_ONLY: string;
    blue_FOR_SUBAGENTS_ONLY: string;
    green_FOR_SUBAGENTS_ONLY: string;
    yellow_FOR_SUBAGENTS_ONLY: string;
    purple_FOR_SUBAGENTS_ONLY: string;
    orange_FOR_SUBAGENTS_ONLY: string;
    pink_FOR_SUBAGENTS_ONLY: string;
    cyan_FOR_SUBAGENTS_ONLY: string;
    professionalBlue: string;
    rainbow_red: string;
    rainbow_orange: string;
    rainbow_yellow: string;
    rainbow_green: string;
    rainbow_blue: string;
    rainbow_indigo: string;
    rainbow_violet: string;
    rainbow_red_shimmer: string;
    rainbow_orange_shimmer: string;
    rainbow_yellow_shimmer: string;
    rainbow_green_shimmer: string;
    rainbow_blue_shimmer: string;
    rainbow_indigo_shimmer: string;
    rainbow_violet_shimmer: string;
    clawd_body: string;
    clawd_background: string;
    userMessageBackground: string;
    bashMessageBackgroundColor: string;
    memoryBackgroundColor: string;
    rate_limit_fill: string;
    rate_limit_empty: string;
  };
}

export interface ThinkingVerbsConfig {
  enabled: boolean;
  format: string;
  verbs: string[];
}

export interface ThinkingStyleConfig {
  reverseMirror: boolean;
  updateInterval: number;
  phases: string[];
  hideSpinner: boolean;
}

export interface UserMessageDisplayConfig {
  format: string;
  styling: string[];
  foregroundColor: string | 'default';
  backgroundColor: string | 'default' | null;
  borderStyle:
    | 'none'
    | 'single'
    | 'double'
    | 'round'
    | 'bold'
    | 'singleDouble'
    | 'doubleSingle'
    | 'classic'
    | 'topBottomSingle'
    | 'topBottomDouble'
    | 'topBottomBold';
  borderColor: string;
  paddingX: number;
  paddingY: number;
  fitBoxToContent: boolean;
}

export interface InputBoxConfig {
  removeBorder: boolean;
}

export type TableFormat = 'default' | 'ascii' | 'clean' | 'clean-top-bottom';

export interface MiscConfig {
  showTweakccVersion: boolean;
  showPatchesApplied: boolean;
  expandThinkingBlocks: boolean;
  enableConversationTitle: boolean;
  hideStartupBanner: boolean;
  hideCtrlGToEdit: boolean;
  hideStartupClawd: boolean;
  increaseFileReadLimit: boolean;
  suppressLineNumbers: boolean;
  suppressRateLimitOptions: boolean;
  mcpConnectionNonBlocking: boolean;
  mcpServerBatchSize: number | null;
  statuslineThrottleMs: number | null;
  statuslineUseFixedInterval: boolean;
  tableFormat: TableFormat;
  enableSwarmMode: boolean;
  enableSessionMemory: boolean;
  enableRememberSkill: boolean;
  tokenCountRounding: number | null;
  autoAcceptPlanMode: boolean;
  removeNewSessionShortcut: boolean;
  allowBypassPermissionsInSudo: boolean | null;
  suppressNativeInstallerWarning: boolean;
  filterScrollEscapeSequences: boolean;
}

export interface TableConfig {
  width?: number;
  color?: string;
  columns?: Array<{ header: string; key: string; width?: number }>;
  expandOn?: string;
}

export interface VSCodeExtensionsConfig {
  enableConversationTitle: boolean;
  hideStartupBanner: boolean;
  hideCtrlGToEdit: boolean;
  removeNewSessionShortcut: boolean;
  tableFormat: TableFormat;
  enableSwarmMode: boolean;
  tokenCountRounding: number | null;
}

export interface UnifiedInstallationInfo {
  type: 'cli' | 'vscode-extension';
  path: string;
  version: string;
  fork?: VSCodeFork;
  selected?: boolean;
}

export interface InputPatternHighlighter {
  name: string; // User-friendly name
  regex: string; // Regex pattern (stored as string)
  regexFlags: string; // Flags for the regex, must include 'g' for matchAll
  format: string; // Format string, use {MATCH} as placeholder
  styling: string[]; // ['bold', 'italic', 'underline', 'strikethrough', 'inverse']
  foregroundColor: string | null; // null = don't specify, otherwise rgb(r,g,b)
  backgroundColor: string | null; // null = don't specify, otherwise rgb(r,g,b)
  enabled: boolean; // Temporarily disable this pattern
}

export interface Toolset {
  name: string;
  allowedTools: string[] | '*';
}

export interface SubagentModelsConfig {
  plan: string | null;
  explore: string | null;
  generalPurpose: string | null;
}

export interface Settings {
  themes: Theme[];
  thinkingVerbs: ThinkingVerbsConfig;
  thinkingStyle: ThinkingStyleConfig;
  userMessageDisplay: UserMessageDisplayConfig;
  inputBox: InputBoxConfig;
  misc: MiscConfig;
  toolsets: Toolset[];
  defaultToolset: string | null;
  planModeToolset: string | null;
  subagentModels: SubagentModelsConfig;
  inputPatternHighlighters: InputPatternHighlighter[];
  inputPatternHighlightersTestText: string;
  claudeMdAltNames: string[] | null;
  tableConfig?: TableConfig;
  vscodeExtensions: VSCodeExtensionsConfig;
}

export interface RemoteConfig {
  sourceUrl: string;
  dateFetched: string;
  settings: Partial<Settings>;
}

export interface InstallationPatchRecord {
  version: string;
  lastPatched: string; // ISO timestamp
  patchesApplied: string[]; // List of patch IDs
}

export interface TweakccConfig {
  ccVersion: string;
  ccInstallationPath?: string | null;
  lastModified: string;
  changesApplied: boolean;
  settings: Settings;
  hidePiebaldAnnouncement?: boolean;
  remoteConfig?: RemoteConfig; // Cached remote config from last --config-url usage
  installations?: {
    [path: string]: InstallationPatchRecord;
  }; // Track patches per installation path
}

export type InstallationKind = 'npm-based' | 'native-binary';

export type InstallationSource =
  | 'env-var' // TWEAKCC_CC_INSTALLATION_PATH
  | 'config' // ccInstallationPath in config.json
  | 'path' // `claude` found via PATH
  | 'search-paths'; // Found via hardcoded search paths

export interface InstallationCandidate {
  path: string;
  kind: InstallationKind;
  version: string;
}

export interface FindInstallationOptions {
  interactive: boolean; // false for --apply, true for TTY UI
}

export interface ClaudeCodeInstallationInfo {
  cliPath?: string; // Only set for NPM installs; undefined for native installs
  version: string;
  nativeInstallationPath?: string; // Path to native installation binary
  source: InstallationSource; // How the installation was found
}

export interface StartupCheckInfo {
  wasUpdated: boolean;
  oldVersion: string | null;
  newVersion: string | null;
  ccInstInfo: ClaudeCodeInstallationInfo;
}

export enum MainMenuItem {
  THEMES = 'Themes',
  THINKING_VERBS = 'Thinking verbs',
  THINKING_STYLE = 'Thinking style',
  USER_MESSAGE_DISPLAY = 'User message display',
  INPUT_PATTERN_HIGHLIGHTERS = 'Input pattern highlighters',
  MISC = 'Misc',
  VS_CODE_EXTENSION = 'VS Code Extension',
  TOOLSETS = 'Toolsets',
  SUBAGENT_MODELS = 'Subagent models',
  CLAUDE_MD_ALT_NAMES = 'CLAUDE.md alternative names',
  VIEW_SYSTEM_PROMPTS = 'View system prompts',
  RESTORE_ORIGINAL = 'Restore original Claude Code (preserves config.json)',
  OPEN_CONFIG = 'Open config.json',
  OPEN_CLI = "Open Claude Code's cli.js",
  EXIT = 'Exit',
}
