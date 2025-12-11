import { globbySync } from 'globby';
import os from 'node:os';
import { debug } from './utils.js';

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
      try {
        const expanded = globbySync(pattern, { onlyFiles: false });
        pathInfos.push({ pattern, isGlob: true, expandedPaths: expanded });
      } catch (error) {
        // Handle permission errors gracefully - log in debug mode only
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EACCES' || error.code === 'EPERM')
        ) {
          debug(`Permission denied accessing: ${pattern} (${error.code})`);
        } else {
          // Log other unexpected errors in debug mode
          debug(
            `Error expanding glob pattern "${pattern}": ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        // Return empty expanded paths - caller handles this gracefully
        pathInfos.push({ pattern, isGlob: true, expandedPaths: [] });
      }
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

    // Bun (global CLI installations)
    addPath(`${home}/.bun/install/global/${mod}`);

    // Bun cache (used by bunx) - both default and XDG locations on Windows
    addPath(`${home}/.bun/install/cache/@anthropic-ai/claude-code*@@@*`, true);
    addPath(`${home}/AppData/Local/Bun/install/cache/@anthropic-ai/claude-code*@@@*`, true);

    // fnm
    addPath(`${home}/AppData/Local/fnm_multishells/*/node_modules/${mod}`, true);

    // mise (global npm installation)
    addPath(`${home}/AppData/Local/mise/installs/node/*/${mod}`, true);

    // mise (npm backend) (https://mise.jdx.dev/dev-tools/backends/npm.html)
    addPath(`${home}/AppData/Local/mise/installs/npm-anthropic-ai-claude-code/*/${mod}`, true);
  } else {
    // macOS-specific paths
    if (process.platform == 'darwin') {
      // macOS-specific potential user path
      addPath(`${home}/Library/${mod}`);
      // MacPorts
      addPath(`/opt/local/lib/${mod}`);
      // Bun cache (used by bunx on macOS) - both default and XDG locations
      addPath(`${home}/.bun/install/cache/@anthropic-ai/claude-code*@@@*`, true);
      addPath(`${home}/Library/Caches/bun/install/cache/@anthropic-ai/claude-code*@@@*`, true);
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

    // Bun (global CLI installations)
    addPath(`${home}/.bun/install/global/${mod}`);

    // Bun cache (used by bunx) - both default and XDG locations
    addPath(`${home}/.bun/install/cache/@anthropic-ai/claude-code*@@@*`, true);
    addPath(`${home}/.local/share/bun/install/cache/@anthropic-ai/claude-code*@@@*`, true);

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
    addPath(`/usr/local/share/nvm/versions/node/*/lib/${mod}`, true);
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

    // mise (npm backend) (https://mise.jdx.dev/dev-tools/backends/npm.html)
    if (process.env.MISE_DATA_DIR) {
      addPath(`${process.env.MISE_DATA_DIR}/installs/npm-anthropic-ai-claude-code/*/lib/${mod}`, true);
    }
    addPath(`${home}/.local/share/mise/installs/npm-anthropic-ai-claude-code/*/lib/${mod}`, true);
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
