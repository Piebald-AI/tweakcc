import * as path from 'path';
import * as os from 'os';
import { globbySync } from 'globby';

export interface Theme {
  name: string;
  id: string;
  colors: {
    autoAccept: string;
    bashBorder: string;
    claude: string;
    claudeShimmer: string;
    permission: string;
    planMode: string;
    ide: string;
    secondaryBorder: string;
    text: string;
    inverseText: string;
    secondaryText: string;
    suggestion: string;
    remember: string;
    success: string;
    error: string;
    warning: string;
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

export interface PastUserInputElementConfig {
  format: string;
  styling: string[];
  foreground_color: string;
  background_color: string;
}

export interface UserMessageDisplayConfig {
  prefix: PastUserInputElementConfig;
  message: PastUserInputElementConfig;
}

export interface Settings {
  themes: Theme[];
  launchText: LaunchTextConfig;
  thinkingVerbs: ThinkingVerbsConfig;
  thinkingStyle: ThinkingStyleConfig;
  userMessageDisplay: UserMessageDisplayConfig;
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
  THEMES = 'Themes',
  LAUNCH_TEXT = 'Launch text',
  THINKING_VERBS = 'Thinking verbs',
  THINKING_STYLE = 'Thinking style',
  PAST_USER_INPUTS = 'Customize past user inputs',
  APPLY_CHANGES = '*Apply customizations to cli.js',
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
        permission: 'rgb(177,185,249)',
        planMode: 'rgb(72,150,140)',
        ide: 'rgb(71,130,200)',
        secondaryBorder: 'rgb(136,136,136)',
        text: 'rgb(255,255,255)',
        inverseText: 'rgb(0,0,0)',
        secondaryText: 'rgb(153,153,153)',
        suggestion: 'rgb(177,185,249)',
        remember: 'rgb(177,185,249)',
        success: 'rgb(78,186,101)',
        error: 'rgb(255,107,128)',
        warning: 'rgb(255,193,7)',
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
        permission: 'rgb(87,105,247)',
        planMode: 'rgb(0,102,102)',
        ide: 'rgb(71,130,200)',
        secondaryBorder: 'rgb(153,153,153)',
        text: 'rgb(0,0,0)',
        inverseText: 'rgb(255,255,255)',
        secondaryText: 'rgb(102,102,102)',
        suggestion: 'rgb(87,105,247)',
        remember: 'rgb(0,0,255)',
        success: 'rgb(44,122,57)',
        error: 'rgb(171,43,63)',
        warning: 'rgb(150,108,30)',
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
      },
    },
    {
      name: 'Light mode (ANSI colors only)',
      id: 'light-ansi',
      colors: {
        autoAccept: '#cd00cd',
        bashBorder: '#cd00cd',
        claude: '#cdcd00',
        claudeShimmer: '#ffff00',
        permission: '#0000ee',
        planMode: '#00cdcd',
        ide: '#4782C8',
        secondaryBorder: '#e5e5e5',
        text: '#000000',
        inverseText: '#ffffff',
        secondaryText: '#7f7f7f',
        suggestion: '#0000ee',
        remember: '#0000ee',
        success: '#00cd00',
        error: '#cd0000',
        warning: '#cdcd00',
        diffAdded: '#00cd00',
        diffRemoved: '#cd0000',
        diffAddedDimmed: '#00cd00',
        diffRemovedDimmed: '#cd0000',
        diffAddedWord: '#00ff00',
        diffRemovedWord: '#ff0000',
        diffAddedWordDimmed: '#00cd00',
        diffRemovedWordDimmed: '#cd0000',
        red_FOR_SUBAGENTS_ONLY: '#cd0000',
        blue_FOR_SUBAGENTS_ONLY: '#0000cd',
        green_FOR_SUBAGENTS_ONLY: '#00cd00',
        yellow_FOR_SUBAGENTS_ONLY: '#cdcd00',
        purple_FOR_SUBAGENTS_ONLY: '#cd00cd',
        orange_FOR_SUBAGENTS_ONLY: '#cd8500',
        pink_FOR_SUBAGENTS_ONLY: '#ff1493',
        cyan_FOR_SUBAGENTS_ONLY: '#00cdcd',
      },
    },
    {
      name: 'Dark mode (ANSI colors only)',
      id: 'dark-ansi',
      colors: {
        autoAccept: '#ff00ff',
        bashBorder: '#ff00ff',
        claude: '#cdcd00',
        claudeShimmer: '#ffff00',
        permission: '#5c5cff',
        planMode: '#00ffff',
        ide: '#4782c8',
        secondaryBorder: '#e5e5e5',
        text: '#ffffff',
        inverseText: '#000000',
        secondaryText: '#e5e5e5',
        suggestion: '#5c5cff',
        remember: '#5c5cff',
        success: '#00ff00',
        error: '#ff0000',
        warning: '#ffff00',
        diffAdded: '#00cd00',
        diffRemoved: '#cd0000',
        diffAddedDimmed: '#00cd00',
        diffRemovedDimmed: '#cd0000',
        diffAddedWord: '#00ff00',
        diffRemovedWord: '#ff0000',
        diffAddedWordDimmed: '#00cd00',
        diffRemovedWordDimmed: '#cd0000',
        red_FOR_SUBAGENTS_ONLY: '#ff0000',
        blue_FOR_SUBAGENTS_ONLY: '#0000ff',
        green_FOR_SUBAGENTS_ONLY: '#00ff00',
        yellow_FOR_SUBAGENTS_ONLY: '#ffff00',
        purple_FOR_SUBAGENTS_ONLY: '#ff00ff',
        orange_FOR_SUBAGENTS_ONLY: '#ff8700',
        pink_FOR_SUBAGENTS_ONLY: '#ff69b4',
        cyan_FOR_SUBAGENTS_ONLY: '#00ffff',
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
        permission: 'rgb(51,102,255)',
        planMode: 'rgb(51,102,102)',
        ide: 'rgb(71,130,200)',
        secondaryBorder: 'rgb(153,153,153)',
        text: 'rgb(0,0,0)',
        inverseText: 'rgb(255,255,255)',
        secondaryText: 'rgb(102,102,102)',
        suggestion: 'rgb(51,102,255)',
        remember: 'rgb(51,102,255)',
        success: 'rgb(0,102,153)',
        error: 'rgb(204,0,0)',
        warning: 'rgb(255,153,0)',
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
        permission: 'rgb(153,204,255)',
        planMode: 'rgb(102,153,153)',
        ide: 'rgb(71,130,200)',
        secondaryBorder: 'rgb(136,136,136)',
        text: 'rgb(255,255,255)',
        inverseText: 'rgb(0,0,0)',
        secondaryText: 'rgb(153,153,153)',
        suggestion: 'rgb(153,204,255)',
        remember: 'rgb(153,204,255)',
        success: 'rgb(51,153,255)',
        error: 'rgb(255,102,102)',
        warning: 'rgb(255,204,0)',
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
};

export const CONFIG_DIR = path.join(os.homedir(), '.tweakcc');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const CLIJS_BACKUP_FILE = path.join(CONFIG_DIR, 'cli.js.backup');

const getClijsSearchPaths = (): string[] => {
  const paths: string[] = [];

  const home =
    process.platform == 'win32'
      ? os.homedir().replace(/\\/g, '/')
      : os.homedir();
  const mod = 'node_modules/@anthropic-ai/claude-code';

  // Local Claude Code installation (#42)
  paths.push(`${os.homedir()}/.claude/local/${mod}`);

  // Search in custom paths for popular tools.  These are cross-platform paths.
  // prettier-ignore
  {
    if (process.env.NPM_PREFIX)  paths.push(`${process.env.NPM_PREFIX}/lib/${mod}`);
    if (process.env.N_PREFIX)    paths.push(`${process.env.N_PREFIX}/lib/${mod}`);
    if (process.env.VOLTA_HOME)  paths.push(`${process.env.VOLTA_HOME}/lib/${mod}`);
    if (process.env.FNM_DIR)     paths.push(`${process.env.FNM_DIR}/lib/${mod}`);
    if (process.env.NVM_DIR)     paths.push(`${process.env.NVM_DIR}/lib/${mod}`);
    if (process.env.NODENV_ROOT) paths.push(...globbySync(`${process.env.NODENV_ROOT}/versions/*/lib/${mod}`));
    if (process.env.NVS_HOME)    paths.push(...globbySync(`${process.env.NVS_HOME}/node/*/*/lib/${mod}`));
    if (process.env.ASDF_DATA_DIR) paths.push(...globbySync(`${process.env.ASDF_DATA_DIR}/installs/nodejs/*/lib/${mod}`));
  }

  // Platform-specific paths.
  // prettier-ignore
  if (process.platform == "win32") {
    // volta, npm, yarn, pnpm
    paths.push(`${home}/AppData/Local/Volta/tools/image/packages/@anthropic-ai/claude-code/${mod}`);
    paths.push(`${home}/AppData/Roaming/npm/${mod}`);
    paths.push(...globbySync(`${home}/AppData/Roaming/nvm/*/${mod}}`));
    paths.push(`${home}/AppData/Local/Yarn/config/global/${mod}`);
    paths.push(...globbySync(`${home}/AppData/Local/pnpm/global/*/${mod}`));

    // n (https://github.com/tj/n)
    paths.push(...globbySync(`${home}/n/versions/node/*/lib/${mod}`));

    // Yarn
    paths.push(`${home}/AppData/Roaming/Yarn/config/global/${mod}`);

    // pnpm
    paths.push(`${home}/AppData/Roaming/pnpm-global/${mod}`);
    paths.push(...globbySync(`${home}/AppData/Roaming/pnpm-global/*/${mod}`));

    // Bun
    paths.push(`${home}/.bun/install/global/${mod}`);

    // fnm
    paths.push(...globbySync(`${home}/AppData/Local/fnm_multishells/*/node_modules/${mod}`));

  } else {
    // macOS-specific paths
    if (process.platform == 'darwin') {
      // macOS-specific potential user path
      paths.push(`${home}/Library/${mod}`);
      // MacPorts
      paths.push(`/opt/local/lib/${mod}`);
    }

    // Various user paths
    paths.push(`${home}/.local/lib/${mod}`)
    paths.push(`${home}/.local/share/${mod}`)
    paths.push(`${home}/.npm-global/lib/${mod}`)
    paths.push(`${home}/.npm-packages/lib/${mod}`)
    paths.push(`${home}/.npm/lib/${mod}`)
    paths.push(`${home}/npm/lib/${mod}`)

    // Various system paths
    paths.push(`/etc/${mod}`)
    paths.push(`/lib/${mod}`)
    paths.push(`/opt/node/lib/${mod}`)
    paths.push(`/usr/lib/${mod}`)
    paths.push(`/usr/local/lib/${mod}`)
    paths.push(`/usr/share/${mod}`)
    paths.push(`/var/lib/${mod}`)

    // Homebrew
    paths.push(`/opt/homebrew/lib/${mod}`);

    // Yarn
    paths.push(`${home}/.config/yarn/global/${mod}`);
    paths.push(`${home}/.yarn/global/${mod}`);
    paths.push(`${home}/.bun/install/global/${mod}`);

    // pnpm
    paths.push(`${home}/.pnpm-global/${mod}`);
    paths.push(...globbySync(`${home}/.pnpm-global/*/${mod}`));
    paths.push(`${home}/pnpm-global/${mod}`);
    paths.push(...globbySync(`${home}/pnpm-global/*/${mod}`));
    paths.push(`${home}/.local/share/pnpm/global/${mod}`);
    paths.push(...globbySync(`${home}/.local/share/pnpm/global/*/${mod}`));

    // Bun
    paths.push(`${home}/.bun/install/global/${mod}`);

    // n (https://github.com/tj/n) - system & user
    paths.push(...globbySync(`/usr/local/n/versions/node/*/lib/${mod}`));
    paths.push(...globbySync(`${home}/n/versions/node/*/lib/${mod}`));
    paths.push(`${home}/n/lib/${mod}`);

    // volta (https://github.com/volta-cli/volta)
    paths.push(...globbySync(`${home}/.volta/tools/image/node/*/lib/${mod}`));

    // fnm (https://github.com/Schniz/fnm)
    paths.push(...globbySync(`${home}/.fnm/node-versions/*/installation/lib/${mod}`));

    // nvm (https://github.com/nvm-sh/nvm) - system & user
    paths.push(...globbySync(`/usr/local/nvm/versions/node/*/lib/${mod}`));
    paths.push(...globbySync(`${home}/.nvm/versions/node/*/lib/${mod}`));

    // nodenv (https://github.com/nodenv/nodenv)
    paths.push(...globbySync(`${home}/.nodenv/versions/*/lib/${mod}`));

    // nvs (https://github.com/jasongin/nvs)
    paths.push(...globbySync(`${home}/.nvs/*/lib/${mod}`));

    // asdf (https://github.com/asdf-vm/asdf)
    paths.push(...globbySync(`${home}/.asdf/installs/nodejs/*/lib/${mod}`));
  }

  // After we're done with globby, which required / even on Windows, convert / back to \\ for
  // Windows.
  return process.platform == 'win32'
    ? paths.map(p => p.replace(/\//g, '\\'))
    : paths;
};

export const CLIJS_SEARCH_PATHS: string[] = getClijsSearchPaths();
