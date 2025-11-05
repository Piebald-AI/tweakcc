import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { globbySync } from 'globby';

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

export interface LaunchTextConfig {
  method: 'figlet' | 'custom';
  figletText: string;
  figletFont: string;
  customText: string;
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

export interface UserMessageDisplayElementConfig {
  format: string;
  styling: string[];
  foreground_color: string;
  background_color: string;
}

export interface UserMessageDisplayConfig {
  prefix: UserMessageDisplayElementConfig;
  message: UserMessageDisplayElementConfig;
}

export interface InputBoxConfig {
  removeBorder: boolean;
}

export interface MiscConfig {
  showTweakccVersion: boolean;
  showPatchesApplied: boolean;
  expandThinkingBlocks: boolean;
}

export interface Toolset {
  name: string;
  allowedTools: string[] | '*';
}

export interface Settings {
  themes: Theme[];
  launchText: LaunchTextConfig;
  thinkingVerbs: ThinkingVerbsConfig;
  thinkingStyle: ThinkingStyleConfig;
  userMessageDisplay: UserMessageDisplayConfig;
  inputBox: InputBoxConfig;
  misc: MiscConfig;
  toolsets: Toolset[];
}

export interface TweakccConfig {
  ccVersion: string;
  ccInstallationDir: string | null;
  lastModified: string;
  changesApplied: boolean;
  settings: Settings;
}

export interface ClaudeCodeInstallationInfo {
  cliPath: string;
  packageJsonPath: string;
  version: string;
}

export interface StartupCheckInfo {
  wasUpdated: boolean;
  oldVersion: string | null;
  newVersion: string | null;
  ccInstInfo: ClaudeCodeInstallationInfo;
}

export enum MainMenuItem {
  APPLY_CHANGES = '*Apply customizations to cli.js',
  THEMES = 'Themes',
  LAUNCH_TEXT = 'Launch text',
  THINKING_VERBS = 'Thinking verbs',
  THINKING_STYLE = 'Thinking style',
  USER_MESSAGE_DISPLAY = 'User message display',
  MISC = 'Misc',
  TOOLSETS = 'Toolsets',
  VIEW_SYSTEM_PROMPTS = 'View system prompts',
  RESTORE_ORIGINAL = 'Restore original Claude Code (preserves tweakcc.json)',
  OPEN_CONFIG = 'Open tweakcc.json',
  OPEN_CLI = "Open Claude Code's cli.js",
  EXIT = 'Exit',
}

export const DEFAULT_SETTINGS: Settings = {
  themes: [
    {
      name: 'Dark mode',
      id: 'dark',
      colors: {
        autoAccept: 'rgb(175,135,255)',
        bashBorder: 'rgb(253,93,177)',
        claude: 'rgb(215,119,87)',
        claudeShimmer: 'rgb(235,159,127)',
        claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(147,165,255)',
        claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(177,195,255)',
        permission: 'rgb(177,185,249)',
        permissionShimmer: 'rgb(207,215,255)',
        planMode: 'rgb(72,150,140)',
        ide: 'rgb(71,130,200)',
        promptBorder: 'rgb(136,136,136)',
        promptBorderShimmer: 'rgb(166,166,166)',
        text: 'rgb(255,255,255)',
        inverseText: 'rgb(0,0,0)',
        inactive: 'rgb(153,153,153)',
        subtle: 'rgb(80,80,80)',
        suggestion: 'rgb(177,185,249)',
        remember: 'rgb(177,185,249)',
        background: 'rgb(0,204,204)',
        success: 'rgb(78,186,101)',
        error: 'rgb(255,107,128)',
        warning: 'rgb(255,193,7)',
        warningShimmer: 'rgb(255,223,57)',
        diffAdded: 'rgb(34,92,43)',
        diffRemoved: 'rgb(122,41,54)',
        diffAddedDimmed: 'rgb(71,88,74)',
        diffRemovedDimmed: 'rgb(105,72,77)',
        diffAddedWord: 'rgb(56,166,96)',
        diffRemovedWord: 'rgb(179,89,107)',
        diffAddedWordDimmed: 'rgb(46,107,58)',
        diffRemovedWordDimmed: 'rgb(139,57,69)',
        red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
        blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
        green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
        yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
        purple_FOR_SUBAGENTS_ONLY: 'rgb(147,51,234)',
        orange_FOR_SUBAGENTS_ONLY: 'rgb(234,88,12)',
        pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
        cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
        professionalBlue: 'rgb(106,155,204)',
        rainbow_red: 'rgb(235,95,87)',
        rainbow_orange: 'rgb(245,139,87)',
        rainbow_yellow: 'rgb(250,195,95)',
        rainbow_green: 'rgb(145,200,130)',
        rainbow_blue: 'rgb(130,170,220)',
        rainbow_indigo: 'rgb(155,130,200)',
        rainbow_violet: 'rgb(200,130,180)',
        rainbow_red_shimmer: 'rgb(250,155,147)',
        rainbow_orange_shimmer: 'rgb(255,185,137)',
        rainbow_yellow_shimmer: 'rgb(255,225,155)',
        rainbow_green_shimmer: 'rgb(185,230,180)',
        rainbow_blue_shimmer: 'rgb(180,205,240)',
        rainbow_indigo_shimmer: 'rgb(195,180,230)',
        rainbow_violet_shimmer: 'rgb(230,180,210)',
        clawd_body: 'rgb(215,119,87)',
        clawd_background: 'rgb(0,0,0)',
        userMessageBackground: 'rgb(55, 55, 55)',
        bashMessageBackgroundColor: 'rgb(65, 60, 65)',
        memoryBackgroundColor: 'rgb(55, 65, 70)',
        rate_limit_fill: 'rgb(177,185,249)',
        rate_limit_empty: 'rgb(80,83,112)',
      },
    },
    {
      name: 'Light mode',
      id: 'light',
      colors: {
        autoAccept: 'rgb(135,0,255)',
        bashBorder: 'rgb(255,0,135)',
        claude: 'rgb(215,119,87)',
        claudeShimmer: 'rgb(245,149,117)',
        claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(87,105,247)',
        claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(117,135,255)',
        permission: 'rgb(87,105,247)',
        permissionShimmer: 'rgb(137,155,255)',
        planMode: 'rgb(0,102,102)',
        ide: 'rgb(71,130,200)',
        promptBorder: 'rgb(153,153,153)',
        promptBorderShimmer: 'rgb(183,183,183)',
        text: 'rgb(0,0,0)',
        inverseText: 'rgb(255,255,255)',
        inactive: 'rgb(102,102,102)',
        subtle: 'rgb(175,175,175)',
        suggestion: 'rgb(87,105,247)',
        remember: 'rgb(0,0,255)',
        background: 'rgb(0,153,153)',
        success: 'rgb(44,122,57)',
        error: 'rgb(171,43,63)',
        warning: 'rgb(150,108,30)',
        warningShimmer: 'rgb(200,158,80)',
        diffAdded: 'rgb(105,219,124)',
        diffRemoved: 'rgb(255,168,180)',
        diffAddedDimmed: 'rgb(199,225,203)',
        diffRemovedDimmed: 'rgb(253,210,216)',
        diffAddedWord: 'rgb(47,157,68)',
        diffRemovedWord: 'rgb(209,69,75)',
        diffAddedWordDimmed: 'rgb(144,194,156)',
        diffRemovedWordDimmed: 'rgb(232,165,173)',
        red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
        blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
        green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
        yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
        purple_FOR_SUBAGENTS_ONLY: 'rgb(147,51,234)',
        orange_FOR_SUBAGENTS_ONLY: 'rgb(234,88,12)',
        pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
        cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
        professionalBlue: 'rgb(106,155,204)',
        rainbow_red: 'rgb(235,95,87)',
        rainbow_orange: 'rgb(245,139,87)',
        rainbow_yellow: 'rgb(250,195,95)',
        rainbow_green: 'rgb(145,200,130)',
        rainbow_blue: 'rgb(130,170,220)',
        rainbow_indigo: 'rgb(155,130,200)',
        rainbow_violet: 'rgb(200,130,180)',
        rainbow_red_shimmer: 'rgb(250,155,147)',
        rainbow_orange_shimmer: 'rgb(255,185,137)',
        rainbow_yellow_shimmer: 'rgb(255,225,155)',
        rainbow_green_shimmer: 'rgb(185,230,180)',
        rainbow_blue_shimmer: 'rgb(180,205,240)',
        rainbow_indigo_shimmer: 'rgb(195,180,230)',
        rainbow_violet_shimmer: 'rgb(230,180,210)',
        clawd_body: 'rgb(215,119,87)',
        clawd_background: 'rgb(0,0,0)',
        userMessageBackground: 'rgb(240, 240, 240)',
        bashMessageBackgroundColor: 'rgb(250, 245, 250)',
        memoryBackgroundColor: 'rgb(230, 245, 250)',
        rate_limit_fill: 'rgb(87,105,247)',
        rate_limit_empty: 'rgb(39,47,111)',
      },
    },
    {
      name: 'Light mode (ANSI colors only)',
      id: 'light-ansi',
      colors: {
        autoAccept: 'ansi:magenta',
        bashBorder: 'ansi:magenta',
        claude: 'ansi:redBright',
        claudeShimmer: 'ansi:yellowBright',
        claudeBlue_FOR_SYSTEM_SPINNER: 'ansi:blue',
        claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'ansi:blueBright',
        permission: 'ansi:blue',
        permissionShimmer: 'ansi:blueBright',
        planMode: 'ansi:cyan',
        ide: 'ansi:blueBright',
        promptBorder: 'ansi:white',
        promptBorderShimmer: 'ansi:whiteBright',
        text: 'ansi:black',
        inverseText: 'ansi:white',
        inactive: 'ansi:blackBright',
        subtle: 'ansi:blackBright',
        suggestion: 'ansi:blue',
        remember: 'ansi:blue',
        background: 'ansi:cyan',
        success: 'ansi:green',
        error: 'ansi:red',
        warning: 'ansi:yellow',
        warningShimmer: 'ansi:yellowBright',
        diffAdded: 'ansi:green',
        diffRemoved: 'ansi:red',
        diffAddedDimmed: 'ansi:green',
        diffRemovedDimmed: 'ansi:red',
        diffAddedWord: 'ansi:greenBright',
        diffRemovedWord: 'ansi:redBright',
        diffAddedWordDimmed: 'ansi:green',
        diffRemovedWordDimmed: 'ansi:red',
        red_FOR_SUBAGENTS_ONLY: 'ansi:red',
        blue_FOR_SUBAGENTS_ONLY: 'ansi:blue',
        green_FOR_SUBAGENTS_ONLY: 'ansi:green',
        yellow_FOR_SUBAGENTS_ONLY: 'ansi:yellow',
        purple_FOR_SUBAGENTS_ONLY: 'ansi:magenta',
        orange_FOR_SUBAGENTS_ONLY: 'ansi:redBright',
        pink_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
        cyan_FOR_SUBAGENTS_ONLY: 'ansi:cyan',
        professionalBlue: 'ansi:blueBright',
        rainbow_red: 'ansi:red',
        rainbow_orange: 'ansi:redBright',
        rainbow_yellow: 'ansi:yellow',
        rainbow_green: 'ansi:green',
        rainbow_blue: 'ansi:cyan',
        rainbow_indigo: 'ansi:blue',
        rainbow_violet: 'ansi:magenta',
        rainbow_red_shimmer: 'ansi:redBright',
        rainbow_orange_shimmer: 'ansi:yellow',
        rainbow_yellow_shimmer: 'ansi:yellowBright',
        rainbow_green_shimmer: 'ansi:greenBright',
        rainbow_blue_shimmer: 'ansi:cyanBright',
        rainbow_indigo_shimmer: 'ansi:blueBright',
        rainbow_violet_shimmer: 'ansi:magentaBright',
        clawd_body: 'ansi:redBright',
        clawd_background: 'ansi:black',
        userMessageBackground: 'ansi:white',
        bashMessageBackgroundColor: 'ansi:whiteBright',
        memoryBackgroundColor: 'ansi:white',
        rate_limit_fill: 'ansi:yellow',
        rate_limit_empty: 'ansi:black',
      },
    },
    {
      name: 'Dark mode (ANSI colors only)',
      id: 'dark-ansi',
      colors: {
        autoAccept: 'ansi:magentaBright',
        bashBorder: 'ansi:magentaBright',
        claude: 'ansi:redBright',
        claudeShimmer: 'ansi:yellowBright',
        claudeBlue_FOR_SYSTEM_SPINNER: 'ansi:blueBright',
        claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'ansi:blueBright',
        permission: 'ansi:blueBright',
        permissionShimmer: 'ansi:blueBright',
        planMode: 'ansi:cyanBright',
        ide: 'ansi:blue',
        promptBorder: 'ansi:white',
        promptBorderShimmer: 'ansi:whiteBright',
        text: 'ansi:whiteBright',
        inverseText: 'ansi:black',
        inactive: 'ansi:white',
        subtle: 'ansi:white',
        suggestion: 'ansi:blueBright',
        remember: 'ansi:blueBright',
        background: 'ansi:cyanBright',
        success: 'ansi:greenBright',
        error: 'ansi:redBright',
        warning: 'ansi:yellowBright',
        warningShimmer: 'ansi:yellowBright',
        diffAdded: 'ansi:green',
        diffRemoved: 'ansi:red',
        diffAddedDimmed: 'ansi:green',
        diffRemovedDimmed: 'ansi:red',
        diffAddedWord: 'ansi:greenBright',
        diffRemovedWord: 'ansi:redBright',
        diffAddedWordDimmed: 'ansi:green',
        diffRemovedWordDimmed: 'ansi:red',
        red_FOR_SUBAGENTS_ONLY: 'ansi:redBright',
        blue_FOR_SUBAGENTS_ONLY: 'ansi:blueBright',
        green_FOR_SUBAGENTS_ONLY: 'ansi:greenBright',
        yellow_FOR_SUBAGENTS_ONLY: 'ansi:yellowBright',
        purple_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
        orange_FOR_SUBAGENTS_ONLY: 'ansi:redBright',
        pink_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
        cyan_FOR_SUBAGENTS_ONLY: 'ansi:cyanBright',
        professionalBlue: 'rgb(106,155,204)',
        rainbow_red: 'ansi:red',
        rainbow_orange: 'ansi:redBright',
        rainbow_yellow: 'ansi:yellow',
        rainbow_green: 'ansi:green',
        rainbow_blue: 'ansi:cyan',
        rainbow_indigo: 'ansi:blue',
        rainbow_violet: 'ansi:magenta',
        rainbow_red_shimmer: 'ansi:redBright',
        rainbow_orange_shimmer: 'ansi:yellow',
        rainbow_yellow_shimmer: 'ansi:yellowBright',
        rainbow_green_shimmer: 'ansi:greenBright',
        rainbow_blue_shimmer: 'ansi:cyanBright',
        rainbow_indigo_shimmer: 'ansi:blueBright',
        rainbow_violet_shimmer: 'ansi:magentaBright',
        clawd_body: 'ansi:redBright',
        clawd_background: 'ansi:black',
        userMessageBackground: 'ansi:blackBright',
        bashMessageBackgroundColor: 'ansi:black',
        memoryBackgroundColor: 'ansi:blackBright',
        rate_limit_fill: 'ansi:yellow',
        rate_limit_empty: 'ansi:white',
      },
    },
    {
      name: 'Light mode (colorblind-friendly)',
      id: 'light-daltonized',
      colors: {
        autoAccept: 'rgb(135,0,255)',
        bashBorder: 'rgb(0,102,204)',
        claude: 'rgb(255,153,51)',
        claudeShimmer: 'rgb(255,183,101)',
        claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(51,102,255)',
        claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(101,152,255)',
        permission: 'rgb(51,102,255)',
        permissionShimmer: 'rgb(101,152,255)',
        planMode: 'rgb(51,102,102)',
        ide: 'rgb(71,130,200)',
        promptBorder: 'rgb(153,153,153)',
        promptBorderShimmer: 'rgb(183,183,183)',
        text: 'rgb(0,0,0)',
        inverseText: 'rgb(255,255,255)',
        inactive: 'rgb(102,102,102)',
        subtle: 'rgb(175,175,175)',
        suggestion: 'rgb(51,102,255)',
        remember: 'rgb(51,102,255)',
        background: 'rgb(0,153,153)',
        success: 'rgb(0,102,153)',
        error: 'rgb(204,0,0)',
        warning: 'rgb(255,153,0)',
        warningShimmer: 'rgb(255,183,50)',
        diffAdded: 'rgb(153,204,255)',
        diffRemoved: 'rgb(255,204,204)',
        diffAddedDimmed: 'rgb(209,231,253)',
        diffRemovedDimmed: 'rgb(255,233,233)',
        diffAddedWord: 'rgb(51,102,204)',
        diffRemovedWord: 'rgb(153,51,51)',
        diffAddedWordDimmed: 'rgb(102,153,204)',
        diffRemovedWordDimmed: 'rgb(204,153,153)',
        red_FOR_SUBAGENTS_ONLY: 'rgb(204,0,0)',
        blue_FOR_SUBAGENTS_ONLY: 'rgb(0,102,204)',
        green_FOR_SUBAGENTS_ONLY: 'rgb(0,204,0)',
        yellow_FOR_SUBAGENTS_ONLY: 'rgb(255,204,0)',
        purple_FOR_SUBAGENTS_ONLY: 'rgb(128,0,128)',
        orange_FOR_SUBAGENTS_ONLY: 'rgb(255,128,0)',
        pink_FOR_SUBAGENTS_ONLY: 'rgb(255,102,178)',
        cyan_FOR_SUBAGENTS_ONLY: 'rgb(0,178,178)',
        professionalBlue: 'rgb(106,155,204)',
        rainbow_red: 'rgb(235,95,87)',
        rainbow_orange: 'rgb(245,139,87)',
        rainbow_yellow: 'rgb(250,195,95)',
        rainbow_green: 'rgb(145,200,130)',
        rainbow_blue: 'rgb(130,170,220)',
        rainbow_indigo: 'rgb(155,130,200)',
        rainbow_violet: 'rgb(200,130,180)',
        rainbow_red_shimmer: 'rgb(250,155,147)',
        rainbow_orange_shimmer: 'rgb(255,185,137)',
        rainbow_yellow_shimmer: 'rgb(255,225,155)',
        rainbow_green_shimmer: 'rgb(185,230,180)',
        rainbow_blue_shimmer: 'rgb(180,205,240)',
        rainbow_indigo_shimmer: 'rgb(195,180,230)',
        rainbow_violet_shimmer: 'rgb(230,180,210)',
        clawd_body: 'rgb(215,119,87)',
        clawd_background: 'rgb(0,0,0)',
        userMessageBackground: 'rgb(220, 220, 220)',
        bashMessageBackgroundColor: 'rgb(250, 245, 250)',
        memoryBackgroundColor: 'rgb(230, 245, 250)',
        rate_limit_fill: 'rgb(51,102,255)',
        rate_limit_empty: 'rgb(23,46,114)',
      },
    },
    {
      name: 'Dark mode (colorblind-friendly)',
      id: 'dark-daltonized',
      colors: {
        autoAccept: 'rgb(175,135,255)',
        bashBorder: 'rgb(51,153,255)',
        claude: 'rgb(255,153,51)',
        claudeShimmer: 'rgb(255,183,101)',
        claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(153,204,255)',
        claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(183,224,255)',
        permission: 'rgb(153,204,255)',
        permissionShimmer: 'rgb(183,224,255)',
        planMode: 'rgb(102,153,153)',
        ide: 'rgb(71,130,200)',
        promptBorder: 'rgb(136,136,136)',
        promptBorderShimmer: 'rgb(166,166,166)',
        text: 'rgb(255,255,255)',
        inverseText: 'rgb(0,0,0)',
        inactive: 'rgb(153,153,153)',
        subtle: 'rgb(80,80,80)',
        suggestion: 'rgb(153,204,255)',
        remember: 'rgb(153,204,255)',
        background: 'rgb(0,204,204)',
        success: 'rgb(51,153,255)',
        error: 'rgb(255,102,102)',
        warning: 'rgb(255,204,0)',
        warningShimmer: 'rgb(255,234,50)',
        diffAdded: 'rgb(0,68,102)',
        diffRemoved: 'rgb(102,0,0)',
        diffAddedDimmed: 'rgb(62,81,91)',
        diffRemovedDimmed: 'rgb(62,44,44)',
        diffAddedWord: 'rgb(0,119,179)',
        diffRemovedWord: 'rgb(179,0,0)',
        diffAddedWordDimmed: 'rgb(26,99,128)',
        diffRemovedWordDimmed: 'rgb(128,21,21)',
        red_FOR_SUBAGENTS_ONLY: 'rgb(255,102,102)',
        blue_FOR_SUBAGENTS_ONLY: 'rgb(102,178,255)',
        green_FOR_SUBAGENTS_ONLY: 'rgb(102,255,102)',
        yellow_FOR_SUBAGENTS_ONLY: 'rgb(255,255,102)',
        purple_FOR_SUBAGENTS_ONLY: 'rgb(178,102,255)',
        orange_FOR_SUBAGENTS_ONLY: 'rgb(255,178,102)',
        pink_FOR_SUBAGENTS_ONLY: 'rgb(255,153,204)',
        cyan_FOR_SUBAGENTS_ONLY: 'rgb(102,204,204)',
        professionalBlue: 'rgb(106,155,204)',
        rainbow_red: 'rgb(235,95,87)',
        rainbow_orange: 'rgb(245,139,87)',
        rainbow_yellow: 'rgb(250,195,95)',
        rainbow_green: 'rgb(145,200,130)',
        rainbow_blue: 'rgb(130,170,220)',
        rainbow_indigo: 'rgb(155,130,200)',
        rainbow_violet: 'rgb(200,130,180)',
        rainbow_red_shimmer: 'rgb(250,155,147)',
        rainbow_orange_shimmer: 'rgb(255,185,137)',
        rainbow_yellow_shimmer: 'rgb(255,225,155)',
        rainbow_green_shimmer: 'rgb(185,230,180)',
        rainbow_blue_shimmer: 'rgb(180,205,240)',
        rainbow_indigo_shimmer: 'rgb(195,180,230)',
        rainbow_violet_shimmer: 'rgb(230,180,210)',
        clawd_body: 'rgb(215,119,87)',
        clawd_background: 'rgb(0,0,0)',
        userMessageBackground: 'rgb(55, 55, 55)',
        bashMessageBackgroundColor: 'rgb(65, 60, 65)',
        memoryBackgroundColor: 'rgb(55, 65, 70)',
        rate_limit_fill: 'rgb(153,204,255)',
        rate_limit_empty: 'rgb(69,92,115)',
      },
    },
    {
      name: 'Monochrome',
      id: 'monochrome',
      colors: {
        autoAccept: 'rgb(200,200,200)',
        bashBorder: 'rgb(180,180,180)',
        claude: 'rgb(255,255,255)',
        claudeShimmer: 'rgb(230,230,230)',
        claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(200,200,200)',
        claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(220,220,220)',
        permission: 'rgb(200,200,200)',
        permissionShimmer: 'rgb(220,220,220)',
        planMode: 'rgb(180,180,180)',
        ide: 'rgb(190,190,190)',
        promptBorder: 'rgb(160,160,160)',
        promptBorderShimmer: 'rgb(180,180,180)',
        text: 'rgb(255,255,255)',
        inverseText: 'rgb(40,40,40)',
        inactive: 'rgb(120,120,120)',
        subtle: 'rgb(100,100,100)',
        suggestion: 'rgb(200,200,200)',
        remember: 'rgb(200,200,200)',
        background: 'rgb(180,180,180)',
        success: 'rgb(220,220,220)',
        error: 'rgb(180,180,180)',
        warning: 'rgb(200,200,200)',
        warningShimmer: 'rgb(220,220,220)',
        diffAdded: 'rgb(90,90,90)',
        diffRemoved: 'rgb(60,60,60)',
        diffAddedDimmed: 'rgb(110,110,110)',
        diffRemovedDimmed: 'rgb(80,80,80)',
        diffAddedWord: 'rgb(200,200,200)',
        diffRemovedWord: 'rgb(80,80,80)',
        diffAddedWordDimmed: 'rgb(160,160,160)',
        diffRemovedWordDimmed: 'rgb(70,70,70)',
        red_FOR_SUBAGENTS_ONLY: 'rgb(200,200,200)',
        blue_FOR_SUBAGENTS_ONLY: 'rgb(180,180,180)',
        green_FOR_SUBAGENTS_ONLY: 'rgb(210,210,210)',
        yellow_FOR_SUBAGENTS_ONLY: 'rgb(190,190,190)',
        purple_FOR_SUBAGENTS_ONLY: 'rgb(170,170,170)',
        orange_FOR_SUBAGENTS_ONLY: 'rgb(195,195,195)',
        pink_FOR_SUBAGENTS_ONLY: 'rgb(205,205,205)',
        cyan_FOR_SUBAGENTS_ONLY: 'rgb(185,185,185)',
        professionalBlue: 'rgb(190,190,190)',
        rainbow_red: 'rgb(240,240,240)',
        rainbow_orange: 'rgb(230,230,230)',
        rainbow_yellow: 'rgb(220,220,220)',
        rainbow_green: 'rgb(210,210,210)',
        rainbow_blue: 'rgb(200,200,200)',
        rainbow_indigo: 'rgb(190,190,190)',
        rainbow_violet: 'rgb(180,180,180)',
        rainbow_red_shimmer: 'rgb(255,255,255)',
        rainbow_orange_shimmer: 'rgb(245,245,245)',
        rainbow_yellow_shimmer: 'rgb(235,235,235)',
        rainbow_green_shimmer: 'rgb(225,225,225)',
        rainbow_blue_shimmer: 'rgb(215,215,215)',
        rainbow_indigo_shimmer: 'rgb(205,205,205)',
        rainbow_violet_shimmer: 'rgb(195,195,195)',
        clawd_body: 'rgb(255,255,255)',
        clawd_background: 'rgb(40,40,40)',
        userMessageBackground: 'rgb(70,70,70)',
        bashMessageBackgroundColor: 'rgb(65,65,65)',
        memoryBackgroundColor: 'rgb(75,75,75)',
        rate_limit_fill: 'rgb(200,200,200)',
        rate_limit_empty: 'rgb(90,90,90)',
      },
    },
  ],
  launchText: {
    method: 'figlet',
    figletText: 'Claude Code',
    figletFont: 'ANSI Shadow',
    customText: '',
  },
  thinkingVerbs: {
    format: '{}… ',
    verbs: [
      // Old verbs
      'Accomplishing',
      'Actioning',
      'Actualizing',
      'Baking',
      'Booping',
      'Brewing',
      'Calculating',
      'Cerebrating',
      'Channelling',
      'Churning',
      'Clauding',
      'Coalescing',
      'Cogitating',
      'Combobulating',
      'Computing',
      'Concocting',
      'Conjuring',
      'Considering',
      'Contemplating',
      'Cooking',
      'Crafting',
      'Creating',
      'Crunching',
      'Deciphering',
      'Deliberating',
      'Determining',
      'Discombobulating',
      'Divining',
      'Doing',
      'Effecting',
      'Elucidating',
      'Enchanting',
      'Envisioning',
      'Finagling',
      'Flibbertigibbeting',
      'Forging',
      'Forming',
      'Frolicking',
      'Generating',
      'Germinating',
      'Hatching',
      'Herding',
      'Honking',
      // 'Hustling', - Removed in or before 1.0.83
      'Ideating',
      'Imagining',
      'Incubating',
      'Inferring',
      // 'Jiving', - Removed in or before 1.0.83
      'Manifesting',
      'Marinating',
      'Meandering',
      'Moseying',
      'Mulling',
      'Musing',
      'Mustering',
      'Noodling',
      'Percolating',
      'Perusing',
      'Philosophising',
      'Pondering',
      'Pontificating',
      'Processing',
      'Puttering',
      'Puzzling',
      'Reticulating',
      'Ruminating',
      'Scheming',
      'Schlepping',
      'Shimmying',
      // 'Shucking', - Removed in or before 1.0.83
      'Simmering',
      'Smooshing',
      'Spelunking',
      'Spinning',
      'Stewing',
      'Sussing',
      'Synthesizing',
      'Thinking',
      'Tinkering',
      'Transmuting',
      'Unfurling',
      'Unravelling',
      'Vibing',
      'Wandering',
      'Whirring',
      'Wibbling',
      'Wizarding',
      'Working',
      'Wrangling',

      // New verbs in or around 1.0.83.
      'Alchemizing',
      'Animating',
      'Architecting',
      'Bamboozling',
      'Beaming',
      'Befuddling',
      'Bewitching',
      'Billowing',
      'Bippity-bopping',
      'Blanching',
      'Boogieing',
      'Boondoggling',
      'Bootstrapping',
      'Burrowing',
      'Caching',
      'Canoodling',
      'Caramelizing',
      'Cascading',
      'Catapulting',
      'Channeling',
      'Choreographing',
      'Compiling',
      'Composing',
      'Crystallizing',
      'Cultivating',
      'Deploying',
      'Dilly-dallying',
      'Discombobulating',
      'Distilling',
      'Doodling',
      'Drizzling',
      'Ebbing',
      'Embellishing',
      'Ensorcelling',
      'Evaporating',
      'Fermenting',
      'Fiddle-faddling',
      'Finagling',
      'Flambéing',
      'Flowing',
      'Flummoxing',
      'Fluttering',
      'Frosting',
      'Gallivanting',
      'Galloping',
      'Garnishing',
      'Germinating',
      'Gitifying',
      'Grooving',
      'Gusting',
      'Harmonizing',
      'Hashing',
      'Hexing',
      'Hibernating',
      'Higgledy-piggleding',
      'Hornswoggling',
      'Hullaballooing',
      'Hyperspacing',
      'Illustrating',
      'Improvising',
      'Incanting',
      'Indexing',
      'Infusing',
      'Ionizing',
      'Jazzercising',
      'Jiggery-pokerying',
      'Jitterbugging',
      'Julienning',
      'Kerfuffling',
      'Kneading',
      'Leavening',
      'Levitating',
      'Linting',
      'Lollygagging',
      'Malarkeying',
      'Metamorphosing',
      'Migrating',
      'Minifying',
      'Misting',
      'Moonwalking',
      'Mystifying',
      'Nebulizing',
      'Nesting',
      'Nucleating',
      'Optimizing',
      'Orbiting',
      'Orchestrating',
      'Osmosing',
      'Parsing',
      'Perambulating',
      'Photosynthesizing',
      'Pipelining',
      'Poaching',
      'Pollinating',
      'Pouncing',
      'Precipitating',
      'Prestidigitating',
      'Proofing',
      'Propagating',
      'Prowling',
      'Quantumizing',
      'Querying',
      'Razzle-dazzling',
      'Razzmatazzing',
      'Recombobulating',
      'Reducing',
      'Refactoring',
      'Rippling',
      'Roosting',
      'Sautéing',
      'Scampering',
      'Scurrying',
      'Seasoning',
      'Serializing',
      'Shenaniganing',
      'Skedaddling',
      'Sketching',
      'Skullduggering',
      'Slithering',
      'Sock-hopping',
      'Spellbinding',
      'Sprouting',
      'Storyboarding',
      'Sublimating',
      'Swirling',
      'Swooping',
      'Symbioting',
      'Syncopating',
      'Teleporting',
      'Tempering',
      'Thaumaturging',
      'Thundering',
      'Tomfoolering',
      'Topsy-turvying',
      'Transfiguring',
      'Transpiling',
      'Twisting',
      'Undulating',
      'Validating',
      'Vaporizing',
      'Waddling',
      'Warping',
      'Whatchamacalliting',
      'Whirlpooling',
      'Whisking',
      'Willy-nillying',
      'Zesting',
      'Zigzagging',
    ],
  },
  thinkingStyle: {
    updateInterval: 120,
    phases:
      // On Windows one of these can be an emoji with an ugly green background, which is likely the
      // original cause of this conditional.
      process.env.TERM === 'xterm-ghostty'
        ? ['·', '✢', '✳', '✶', '✻', '*']
        : process.platform === 'darwin'
          ? ['·', '✢', '✳', '✶', '✻', '✽']
          : ['·', '✢', '*', '✶', '✻', '✽'],
    reverseMirror: true,
  },
  userMessageDisplay: {
    prefix: {
      format: '>',
      styling: [],
      foreground_color: 'rgb(0,0,0)',
      background_color: 'rgb(0,0,0)',
    },
    message: {
      format: '{}',
      styling: [],
      foreground_color: 'rgb(0,0,0)',
      background_color: 'rgb(0,0,0)',
    },
  },
  inputBox: {
    removeBorder: false,
  },
  misc: {
    showTweakccVersion: true,
    showPatchesApplied: true,
    expandThinkingBlocks: true,
  },
  toolsets: [],
};

// Support XDG Base Directory Specification with backward compatibility
// Priority:
// 1. If ~/.tweakcc exists, use it (backward compatibility for existing users)
// 2. Otherwise, if $XDG_CONFIG_HOME is set, use $XDG_CONFIG_HOME/tweakcc
// 3. Otherwise, use ~/.tweakcc (default for new users without XDG_CONFIG_HOME)
const getConfigDir = (): string => {
  const legacyDir = path.join(os.homedir(), '.tweakcc');
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;

  // Check if legacy directory exists - use it for backward compatibility
  try {
    if (fs.existsSync(legacyDir)) {
      return legacyDir;
    }
  } catch {
    // If we can't check, fall through to XDG logic
  }

  // No legacy directory - use XDG if available
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, 'tweakcc');
  }

  // Default to legacy location
  return legacyDir;
};

export const CONFIG_DIR = getConfigDir();
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const CLIJS_BACKUP_FILE = path.join(CONFIG_DIR, 'cli.js.backup');
export const SYSTEM_PROMPTS_DIR = path.join(CONFIG_DIR, 'system-prompts');
export const PROMPT_CACHE_DIR = path.join(CONFIG_DIR, 'prompt-data-cache');

export interface SearchPathInfo {
  pattern: string;
  isGlob: boolean;
  expandedPaths: string[];
}

const getClijsSearchPathsWithInfo = (): SearchPathInfo[] => {
  const pathInfos: SearchPathInfo[] = [];

  const home =
    process.platform == 'win32'
      ? os.homedir().replace(/\\/g, '/')
      : os.homedir();
  const mod = 'node_modules/@anthropic-ai/claude-code';

  // Helper function to add a path or glob pattern
  const addPath = (pattern: string, isGlob: boolean = false) => {
    if (isGlob) {
      const expanded = globbySync(pattern, { onlyFiles: false });
      pathInfos.push({ pattern, isGlob: true, expandedPaths: expanded });
    } else {
      pathInfos.push({ pattern, isGlob: false, expandedPaths: [pattern] });
    }
  };

  // Local Claude Code installation (#42)
  addPath(`${os.homedir()}/.claude/local/${mod}`);

  // Search in custom paths for popular tools.  These are cross-platform paths.
  // prettier-ignore
  {
    if (process.env.NPM_PREFIX)    addPath(`${process.env.NPM_PREFIX}/lib/${mod}`);
    if (process.env.N_PREFIX)      addPath(`${process.env.N_PREFIX}/lib/${mod}`);
    if (process.env.VOLTA_HOME)    addPath(`${process.env.VOLTA_HOME}/lib/${mod}`);
    if (process.env.FNM_DIR)       addPath(`${process.env.FNM_DIR}/lib/${mod}`);
    if (process.env.NVM_DIR)       addPath(`${process.env.NVM_DIR}/lib/${mod}`);
    if (process.env.NODENV_ROOT)   addPath(`${process.env.NODENV_ROOT}/versions/*/lib/${mod}`, true);
    if (process.env.NVS_HOME)      addPath(`${process.env.NVS_HOME}/node/*/*/lib/${mod}`, true);
    if (process.env.ASDF_DATA_DIR) addPath(`${process.env.ASDF_DATA_DIR}/installs/nodejs/*/lib/${mod}`, true);
  }

  // Platform-specific paths.
  // prettier-ignore
  if (process.platform == "win32") {
    // volta, npm, yarn, pnpm
    addPath(`${home}/AppData/Local/Volta/tools/image/packages/@anthropic-ai/claude-code/${mod}`);
    addPath(`${home}/AppData/Roaming/npm/${mod}`);
    addPath(`${home}/AppData/Roaming/nvm/*/${mod}`, true);
    addPath(`${home}/AppData/Local/Yarn/config/global/${mod}`);
    addPath(`${home}/AppData/Local/pnpm/global/*/${mod}`, true);

    // nvm4w (https://github.com/coreybutler/nvm-windows) (#118)
    addPath(`C:/nvm4w/nodejs/${mod}`);

    // n (https://github.com/tj/n)
    addPath(`${home}/n/versions/node/*/lib/${mod}`, true);

    // Yarn
    addPath(`${home}/AppData/Roaming/Yarn/config/global/${mod}`);

    // pnpm
    addPath(`${home}/AppData/Roaming/pnpm-global/${mod}`);
    addPath(`${home}/AppData/Roaming/pnpm-global/*/${mod}`, true);

    // Bun
    addPath(`${home}/.bun/install/global/${mod}`);

    // fnm
    addPath(`${home}/AppData/Local/fnm_multishells/*/node_modules/${mod}`, true);

  } else {
    // macOS-specific paths
    if (process.platform == 'darwin') {
      // macOS-specific potential user path
      addPath(`${home}/Library/${mod}`);
      // MacPorts
      addPath(`/opt/local/lib/${mod}`);
    }

    // Various user paths
    addPath(`${home}/.local/lib/${mod}`);
    addPath(`${home}/.local/share/${mod}`);
    addPath(`${home}/.npm-global/lib/${mod}`);
    addPath(`${home}/.npm-packages/lib/${mod}`);
    addPath(`${home}/.npm/lib/${mod}`);
    addPath(`${home}/npm/lib/${mod}`);

    // Various system paths
    addPath(`/etc/${mod}`);
    addPath(`/lib/${mod}`);
    addPath(`/opt/node/lib/${mod}`);
    addPath(`/usr/lib/${mod}`);
    addPath(`/usr/local/lib/${mod}`);
    addPath(`/usr/share/${mod}`);
    addPath(`/var/lib/${mod}`);

    // Homebrew / Linuxbrew
    addPath(`/opt/homebrew/lib/${mod}`);
    addPath(`${home}/.linuxbrew/lib/${mod}`);

    // Yarn
    addPath(`${home}/.config/yarn/global/${mod}`);
    addPath(`${home}/.yarn/global/${mod}`);
    addPath(`${home}/.bun/install/global/${mod}`);

    // pnpm
    addPath(`${home}/.pnpm-global/${mod}`);
    addPath(`${home}/.pnpm-global/*/${mod}`, true);
    addPath(`${home}/pnpm-global/${mod}`);
    addPath(`${home}/pnpm-global/*/${mod}`, true);
    addPath(`${home}/.local/share/pnpm/global/${mod}`);
    addPath(`${home}/.local/share/pnpm/global/*/${mod}`, true);

    // Bun
    addPath(`${home}/.bun/install/global/${mod}`);

    // n (https://github.com/tj/n) - system & user
    addPath(`/usr/local/n/versions/node/*/lib/${mod}`, true);
    addPath(`${home}/n/versions/node/*/lib/${mod}`, true);
    addPath(`${home}/n/lib/${mod}`);

    // volta (https://github.com/volta-cli/volta)
    addPath(`${home}/.volta/tools/image/node/*/lib/${mod}`, true);

    // fnm (https://github.com/Schniz/fnm)
    addPath(`${home}/.fnm/node-versions/*/installation/lib/${mod}`, true);
    addPath(`${home}/.local/state/fnm_multishells/*/lib/${mod}`, true);

    // nvm (https://github.com/nvm-sh/nvm) - system & user
    addPath(`/usr/local/nvm/versions/node/*/lib/${mod}`, true);
    addPath(`${home}/.nvm/versions/node/*/lib/${mod}`, true);

    // nodenv (https://github.com/nodenv/nodenv)
    addPath(`${home}/.nodenv/versions/*/lib/${mod}`, true);

    // nvs (https://github.com/jasongin/nvs)
    addPath(`${home}/.nvs/*/lib/${mod}`, true);

    // asdf (https://github.com/asdf-vm/asdf)
    addPath(`${home}/.asdf/installs/nodejs/*/lib/${mod}`, true);

    // mise (https://github.com/jdx/mise)
    if (process.env.MISE_DATA_DIR) {
      addPath(`${process.env.MISE_DATA_DIR}/installs/node/*/lib/${mod}`, true);
    }
    addPath(`${home}/.local/share/mise/installs/node/*/lib/${mod}`, true);
  }

  // After we're done with globby, which required / even on Windows, convert / back to \\ for
  // Windows.
  if (process.platform == 'win32') {
    pathInfos.forEach(info => {
      info.pattern = info.pattern.replace(/\//g, '\\');
      info.expandedPaths = info.expandedPaths.map(p => p.replace(/\//g, '\\'));
    });
  }

  return pathInfos;
};

export const CLIJS_SEARCH_PATH_INFO: SearchPathInfo[] =
  getClijsSearchPathsWithInfo();
export const CLIJS_SEARCH_PATHS: string[] = CLIJS_SEARCH_PATH_INFO.flatMap(
  info => info.expandedPaths
);
