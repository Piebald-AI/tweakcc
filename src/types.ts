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
  format: string;
  verbs: string[];
}

export interface ThinkingStyleConfig {
  reverseMirror: boolean;
  updateInterval: number;
  phases: string[];
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

export interface MiscConfig {
  showTweakccVersion: boolean;
  showPatchesApplied: boolean;
  expandThinkingBlocks: boolean;
  enableConversationTitle: boolean;
}

export interface Toolset {
  name: string;
  allowedTools: string[] | '*';
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
}

export interface TweakccConfig {
  ccVersion: string;
  ccInstallationDir?: string | null; // Deprecated: only used for migration from old configs
  ccInstallationPath?: string | null;
  lastModified: string;
  changesApplied: boolean;
  settings: Settings;
  hidePiebaldAnnouncement?: boolean;
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
  APPLY_CHANGES = '*Apply customizations',
  THEMES = 'Themes',
  THINKING_VERBS = 'Thinking verbs',
  THINKING_STYLE = 'Thinking style',
  USER_MESSAGE_DISPLAY = 'User message display',
  MISC = 'Misc',
  TOOLSETS = 'Toolsets',
  VIEW_SYSTEM_PROMPTS = 'View system prompts',
  RESTORE_ORIGINAL = 'Restore original Claude Code (preserves config.json)',
  OPEN_CONFIG = 'Open config.json',
  OPEN_CLI = "Open Claude Code's cli.js",
  EXIT = 'Exit',
}
