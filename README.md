<div>
<div align="right">
<a href="https://piebald.ai"><img width="200" top="20" align="right" src="https://github.com/Piebald-AI/.github/raw/main/Wordmark.svg"></a>
</div>

<div align="left">

### Check out Piebald

We've released **Piebald**, the ultimate agentic AI developer experience. \
Download it and try it out for free! **https://piebald.ai/**

<a href="https://piebald.ai/discord"><img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Join our Discord"></a>
<a href="https://x.com/PiebaldAI"><img src="https://img.shields.io/badge/Follow%20%40PiebaldAI-000000?style=flat&logo=x&logoColor=white" alt="X"></a>

<sub>[**Scroll down for tweakcc.**](#tweakcc) :point_down:</sub>

</div>
</div>

<div align="left">
<a href="https://piebald.ai">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://piebald.ai/screenshot-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://piebald.ai/screenshot-light.png">
  <img alt="hero" width="800" src="https://piebald.ai/screenshot-light.png">
</picture>
</a>
</div>

# tweakcc

[![tweakcc on npm](https://img.shields.io/npm/v/tweakcc?color)](https://www.npmjs.com/package/tweakcc)
[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge.svg)](https://github.com/hesreallyhim/awesome-claude-code)
[![ClaudeLog - A comprehensive knowledge base for Claude.](https://claudelog.com/img/claude_log_badge.svg)](https://claudelog.com/)

**tweakcc is a CLI tool that upgrades your Claude Code experience.** Customize its system prompts, add custom themes, create toolsets, and personalize the UI. From the team behind [<img src="https://github.com/Piebald-AI/piebald/raw/main/assets/logo.svg" width="15"> **Piebald.**](https://piebald.ai/)

<!--
> [!note]
> ⭐ **If you find tweakcc useful, please consider [starring the repository](https://github.com/Piebald-AI/tweakcc) to show your support!** ⭐
-->

<img src="./assets/demo.gif" alt="Animated GIF demonstrating running `npx tweakcc`, creating a new theme, changing all of Claude Code's UI colors to purple, changing the thinking format from '<verb>ing...' to 'Claude is <verb>ing', changing the generating spinner style to a 50ms glow animation, applying the changes, running Claude, and using '/config' to switch to the new theme, and sending a message to see the new thinking verb format." width="800">

> [!IMPORTANT]
> **NEW in 4.0.0:** tweakcc now has an API; use `npm i tweakcc` to add to your project and see [API](#api)!
>
> **NEW in 4.0.0:** You can now create custom patches via sandboxed scripts! Works with native installations. No need to fork tweakcc just to make a quick patch! See [`tweakcc adhoc-patch`](#cli-commands).
>
> **NEW in 4.0.0:** You can also apply customizations from a remote URL to a config file. See [Remote Config](#remote-config).
>
> Also see `tweakcc --restore`, [`tweakcc unpack`](#cli-commands), and [`tweakcc repack`](#cli-commands).

> [!NOTE]
> **NEW:** tweakcc 4.0.0 also introduces several new patches:
>
> - [AGENTS.md support (demo video)](#feature-agentsmd-support)
> - [:lock: unlock swarm mode](#feature-swarm-mode-native-multi-agent)
> - [:lock: unlock session memory (blog post)](https://piebald.ai/blog/session-memory-is-coming-to-claude-code) (thank you [@odysseus0](https://github.com/odysseus0)!)
> - [`/remember` skill](https://piebald.ai/blog/session-memory-is-coming-to-claude-code)
> - [input pattern highlighters](#feature-input-pattern-highlighters)
> - [Opus plan 1M](#feature-opus-plan-1m-mode)
> - [MCP startup optimization](#feature-mcp-startup-optimization)
> - [token count rounding](#feature-token-count-rounding)
> - [statusline throttling/pacing](#feature-statusline-update-customization)
> - [auto-accept plan mode](#feature-auto-accept-plan-mode) (thank you [@irdbl](https://github.com/irdbl)!)
> - [dangerously bypassing permissions in sudo](#feature-bypass-permissions-check-in-sudo) (thank you [@brrock](https://github.com/brrock)!)
> - [native installer warning suppression](#feature-suppress-native-installer-warning) (thank you [@brrock](https://github.com/brrock)!).

With tweakcc, you can

- Customize all of Claude Code's **system prompts** (**NEW:** also see all of [**Claude Code's system prompts**](https://github.com/Piebald-AI/claude-code-system-prompts))
- Create custom **toolsets** that can be used in Claude Code with the new **`/toolset`** command
- **Highlight** custom patterns while you type in the CC input box with custom colors and styling, like how `ultrathink` used to be rainbow-highlighted.
- Manually name **sessions** in Claude Code with `/title my chat name` or `/rename` (see [**our blog post**](https://piebald.ai/blog/messages-as-commits-claude-codes-git-like-dag-of-conversations) for implementation details)
- Create **custom themes** with a graphical HSL/RGB color picker
- Add custom **thinking verbs** that will show while Claude's working
- Create custom **thinking spinner animations** with different speeds and phases
- Style the **user messages in the chat history** beyond the default plain gray text
- Remove the **ASCII border** from the input box
- Expand **thinking blocks** by default, so that you don't need to use the transcript (<kbd>Ctrl+O</kbd>) to see them
- Configure which Claude **model** each **subagent** (Plan, Explore, and general-purpose) uses
- Switch between **table formats** - Claude Code default, Unicode (`┌─┬─┐`), ASCII/markdown (`|---|`), Unicode without top/bottom borders.

tweakcc also

- Fixes a bug where the **spinner animation** is frozen if you have the `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` environment variable set ([#46](https://github.com/Piebald-AI/tweakcc/issues/46))
- Allows you to **change the context limit** (default: 200k tokens) used with models from custom Anthropic-compatible APIs with a new environment variable, `CLAUDE_CODE_CONTEXT_LIMIT`
- Adds the **`opusplan[1m]`** model alias, combining Opus for planning with Sonnet's 1M context for execution—reducing "[context anxiety](#feature-opus-plan-1m-mode)" ([#108](https://github.com/Piebald-AI/tweakcc/issues/108))
- Adds a message to Claude Code's startup banner indicating that you're running the patched version of CC (configurable)
- Speeds up Claude Code startup by **~50%** with non-blocking MCP connections and configurable parallel connection batch size ([#406](https://github.com/Piebald-AI/tweakcc/issues/406))
- Enables native multi-agent/swarm mode (TeammateTool, delegate mode, swarm spawning) by bypassing the `tengu_brass_pebble` Statsig flag.

tweakcc supports Claude Code installed on **Windows, macOS, and Linux**, both **native/binary installations** and those installed via npm, yarn, pnpm, bun, Homebrew/Linuxbrew, nvm, fnm, n, volta, nvs, and nodenv, as well as custom locations.

tweakcc supports Claude Code's **native installation**, which is a large platform-specific native executable containing the same minified/compiled JavaScript code from npm, just packaged up in a [Bun](https://github.com/oven-sh/bun) binary. We support patching the native binary on macOS, Windows, and Linux, including ad-hoc signing on Apple Silicon, via [**node-lief**](https://github.com/Piebald-AI/node-lief), our Node.js bindings for [LIEF (Library to Instrument Executables)](https://github.com/lief-project/LIEF).

While tweakcc has a large library of built-in patches, you can create custom patches by using tweakcc's [API](#api). If you don't want to create an npm package, you can use [`tweakcc adhoc-patch`](#cli-commands), which applies a custom Node.js script to your default Claude Code installation. Because `adhoc-patch` supports running scripts from an HTTP URL, you can even host a script on a GitHub Gist or pastebin for easy distribution.

Run without installation:

```bash
$ npx tweakcc

# Or use pnpm:
$ pnpm dlx tweakcc
```

## Table of contents

- [How it works](#how-it-works)
- [Remote config](#remote-config)
- [CLI Commands (`unpack`, `repack`, `adhoc-patch`)](#cli-commands)
- [API](#cli-commands)
- [System prompts](#system-prompts)
- [Toolsets](#toolsets)
- [**Features**](#features)
  - [System prompts](#system-prompts)
  - Themes
  - Thinking verbs customization
  - Thinking indicator customizations
  - Context limit
  - LSP support
  - Hide "ctrl-g to edit prompt in &lt;editor&gt;"
  - Hide the startup banner
  - Hide the startup "Clawd" logo
  - Increase the max size in tokens for files read via `Read`
  - Remove the border from the message input box
  - Add all models to `/model`
  - tweakcc patches applied indicator
  - Show more items in select menus
  - Subagent models
  - Suppression of `1→  ` prefixes from `Read` output
  - Suppress `/rate-limit-options` from being injected
  - Swarm mode
  - Session memory
  - `/remember` skill
  - [Toolsets](#toolsets)
  - User message display customization
  - Token indicator display
  - [Add support for dangerously bypassing permissions in sudo](#feature-bypass-permissions-check-in-sudo)
  - [Input pattern highlighters](#feature-input-pattern-highlighters)
  - [Opus Plan 1M mode](#feature-opus-plan-1m-mode)
  - [MCP startup optimization](#feature-mcp-startup-optimization)
  - [Table format](#feature-table-format)
  - [Swarm mode (native multi-agent)](#feature-swarm-mode-native-multi-agent)
  - [Token count rounding](#feature-token-count-rounding)
  - [Statusline update customization](#feature-statusline-update-customization)
  - [AGENTS.md support (with video)](#feature-agentsmd-support)
  - [Auto-accept plan mode](#feature-auto-accept-plan-mode)
  - [Suppress native installer warning](#feature-suppress-native-installer-warning)
  - [Scroll escape sequence filter](#feature-scroll-escape-sequence-filter)
  - _Missing documentation for above features coming soon_
- [Configuration directory](#configuration-directory)
- [Building from source](#building-from-source)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Related projects](#related-projects)
- [License](#license)

## How it works

tweakcc works by patching Claude Code's minified `cli.js` file, reading customizations from `~/.tweakcc/config.json`. For npm-based installations `cli.js` is modified directly, but for native installations it's extracted from the binary using [node-lief](https://github.com/Piebald-AI/node-lief), patched, and then the binary is repacked. When you update your Claude Code installation, your customizations will be overwritten, but they're remembered in your configuration file, so they can be reapplied by just running `npx tweakcc --apply`.

tweakcc is verified to work with Claude Code **2.1.32.** In newer or earlier versions various patches might not work. However, if we have the [system prompts for your version](https://github.com/Piebald-AI/tweakcc/tree/main/data/prompts) then system prompt patching is guaranteed to work with that version, even if it's significantly different from the verified CC version&mdash;the version number stated above is only relevant for the non-system-prompt patches. We get the latest system prompts within minutes of each new CC release, so unless you're using a CC version older than 2.0.14, your version is supported.

You can also create custom patches using tweakcc without having to fork it or open a PR. [`tweakcc adhoc-patch`](#cli-commands) supports using custom scripts that work with native and npm-based installs and that automatically detect your Claude Code installation.

## Remote Config

While tweakcc usually works by applying customizations from your local `~/.tweakcc/config.json`, you can optionally pass the `--config-url <http URL>` flag when you use `tweakcc --apply` to have tweakcc fetch config from a remote URL and apply it to your local Claude Code installation. This is useful for testing someone else's config when shared via a Gist or pastebin, for example.

Example:

```
npx tweakcc@latest --apply --config-url https://gist.githubusercontent.com/bl-ue/27323f9bfd4c18aaab51cad11c1148dc/raw/b24b5fe08874ce50f4be6c093d9589d184f91a70/config.json
```

Your local config will **not** be overwritten; the remote config will be copied into your `config.json` under `remoteConfig.settings`.

## CLI Commands

In addition to the interactive TUI (`npx tweakcc`) and the `--apply` flag, tweakcc provides three subcommands for advanced use: `unpack`, `repack`, and `adhoc-patch`.

<details>
<summary><code>unpack</code></summary>

Extract the embedded JavaScript from a native Claude Code binary and write it to a file. This is useful for inspecting Claude Code's source, writing custom patches, or making manual edits before repacking. Note that `unpack` only works with native/binary installations; it will error if pointed at an npm-based installation (`cli.js`), because it can already be read directly from disk. `unpack` takes the path to the JS file to write to, and an optional path to a native binary, which if omitted will default to the current installation.

```bash
npx tweakcc unpack <output-js-path> [binary-path]
```

</details>

<details>
<summary><code>repack</code></summary>

Read a JavaScript file and embed it back into a native Claude Code binary. This is the counterpart to `unpack` — after inspecting or modifying the extracted JS, use `repack` to write it back. Like `unpack`, this only works with native installations. `repack` takes a path to a JS file to read from, and an optional path to a native binary, which if omitted, as above, will default to the current installation.

```bash
npx tweakcc repack <input-js-path> [binary-path]
```

Example:

```bash
# Extract, edit, and repack
npx tweakcc unpack ./claude-code.js
# ... make your edits to claude-code.js ...
npx tweakcc repack ./claude-code.js
```

</details>

<details>
<summary><code>adhoc-patch</code></summary>

Apply a one-off or ad-hoc patch to a Claude Code installation without going through the tweakcc UI or config system. It supports three modes and works with both native and npm-based installations.

3 modes of patching are supported.

#### `--string`

A fixed/static old string is replaced with a fixed/static new string, analogous to `grep -F`.

- By default, all instances of the old string are replaced, but you can use `--index` to specify a particular occurrence by 1-based index, e.g. `--index 1` to replace only the first, `--index 2` to replace only the second, etc.

#### `--regex`

All matches of a regular expression are replaced with a new string.

- The new string can contain `$D` replacements, where `D` is the 0-based index of a group matched by the regular expression; `$0` = the entire matched text, `$1` = the first user-defined match group, etc.

- The regular expression must begin and end with a forward slash in JavaScript style, e.g. `/my.+regex/`. An optional list of flags&mdash;characters from the set `g`, `i`, `m`, `s`, `u`, and `y`&mdash;may be appended after the last delimiting forward slash, e.g. `/claude/ig`

- Like `--string`, `--regex` supports the use of `--index` to specify by index which occurrence to replace, without which all occurrences are replaced.

#### `--script`

This is the most powerful option. A short snippet of JavaScript code running in Node.js takes the JavaScript content of the CC installation as input and returns the entire input, modified as output.

- **Security:** The script is run in a sandboxed/isolated `node` child process with the [`--experimental-permission`](https://nodejs.org/api/permissions.html) option to prevent the script from using file system and network APIs. This option requires that you have Node.js 20+ installed and on your `PATH`. Due to this sandboxing, scripts themselves (including those downloaded from HTTP URLs) are safe to run without prior review; however, because the scripts are patching Claude Code, which is an executable, it's technically possible for a script to patch malicious code into your Claude Code executable that would execute when you run `claude`. As a result, it's highly advised to review the diff tweakcc prints when it asks you if you'd like to apply the changes proposed by the patch.

- **Input/output:** Claude Code's JavaScript code is passed to the script via a global variable, `js`, available inside the script's execution context. To return the modified file content, simply use the `return` keyword. For example, to write a very simple script that replaced all instances of `"Claude Code"` with `"My App"`, you could write the following:

  ```js
  js = js.replace(/"Claude Code"/g, '"My App"');
  return js;
  ```

- **Utility vars:** Because complicated patches may need to make use of common functions and global variables like `chalk`, `React`, `require`, and the low-level module loader function, and also common [Ink/React](https://github.com/vadimdemedes/ink) components like `Text` and `Box`, tweakcc also provides a `vars` global variable to the script. `vars` is an object containing the names of the common variables listed above; here's an example:

  ```js
  const vars = {
    chalkVar: 'K6',
    moduleLoaderFunction: 's',
    reactVar: 'Yt8',
    requireFuncName: 'C1',
    textComponent: 'f',
    boxComponent: 'NZ5',
  };
  ```

- **Script source:** Scripts can be passed in 3 ways: directly on the command-line, via a local file on disk, and via an HTTP URL. In order to specify a file, pass the path to the file prefixed with `@` (similar to `curl -d`). To specify an HTTP URL, use `@` and ensure the URL is prefixed with `http://` or `https://`. HTTP scripts themselves are safe to run as a result of our sandboxing, with one notable pitfall, as mentioned above.

#### Usage

```bash
# Replace a fixed string with another string:
npx tweakcc adhoc-patch --string '"Claude Code"' '"My App"'

# Replace all CSS-style RGB colors with bright red:
npx tweakcc adhoc-patch --regex 'rgb\(\d+,\d+,\d+\)' 'rgb(255,0,0)'

# Erase all of CC's code and replace it with a simple console.log:
npx tweakcc adhoc-patch --script $'return "(function(){console.log(\"Hi\")})()"'

# Run a script from a local file:
npx tweakcc adhoc-patch --script '@path/to/script.js'

# Run a script from an HTTP URL (warning: this script makes everything in CC blue and changes "Claude Code" to "ABC Code CLI", which BREAKS CC):
# Its contents are:
#
#   js = js.replace(/Claude Code/g, "ABC Code CLI")
#   js = js.replace(/rgb\(\d+,\d+,\d+\)/g, "rgb(0,128,255)")
#   return js
#
npx tweakcc adhoc-patch --script '@https://gist.githubusercontent.com/bl-ue/2402a16b966176c994ea7bd5d11b0b09/raw/eeb0b78a6387f0e6a15182eeabd95f0e84e4ccd7/patch_cc.js'
```

</details>

Here's a demo of `adhoc-patch` using a script from an HTTP URL ([link to Gist](https://gist.githubusercontent.com/bl-ue/13973d1510a0612dfa99fabf4c20df3b/raw/ef106a2033dfb07d754fa8d27f06979ec2fe3831/demo_change.js)):

https://github.com/user-attachments/assets/221ce577-933e-41d9-ae14-88ce5457a321

> [!CAUTION]
> `adhoc-patch` does not create a backup of the Claude Code installation that is modified. You'll need to use `--apply` first to get a backup created if you want to be able to use `--restore`/`--revert` after an `adhoc-patch`.

## API

tweakcc can be used as an npm dependency and provides an easy API that projects can use to patch Claude Code without worrying about where it's installed and whether it's native or npm-based. The functions are divided into 5 groups: config, installation, I/O, backup, and utilities.

<details>
<summary><b>Config</b>&nbsp;&bull;&nbsp; Functions to access tweakcc's own config, if it exists on the machine.</summary>

```ts
/**
 * Returns the absolute path to tweakcc's config dir.  By default it's
 * `~/.tweakcc` but it also can use `~/.claude/tweakcc` and it also respects
 * `XDG_CONFIG_HOME`—see [Configuration Directory](#configuration-directory).
 */
function getTweakccConfigDir(): string;

/**
 * Returns the absolute path to tweakcc's config file.  It's named `config.json`
 * and lives in the config dir as returned by `getTweakccConfigDir`.
 */
function getTweakccConfigPath(): string;

/**
 * Returns the absolute path to the directory containing the user-editable
 * system prompt markdown files.  It's named `system-prompts/` and lives in the
 * config dir.
 */
function getTweakccSystemPromptsDir(): string;

/**
 * Reads and returns the tweakcc config (as determined by `getTweakccConfigDir`).
 */
function readTweakccConfig(): Promise<TweakccConfig | null>;
```

Demo:

```js
> tweakcc.getTweakccConfigDir()
'/home/user/.tweakcc'

> tweakcc.getTweakccConfigPath()
'/home/user/.tweakcc/config.json'

> tweakcc.getTweakccSystemPromptsDir()
'/home/user/.tweakcc/system-prompts'

> await tweakcc.readTweakccConfig()
{
  ccVersion: '2.1.32',
  ccInstallationPath: '/home/user/.local/bin/claude',
  lastModified: '2026-02-05T21:18:48.551Z',
  changesApplied: true,
  settings: { ... }
}
```

</details>

<details>
<summary><b>Installation</b>&nbsp;&nbsp;&bull;&nbsp;&nbsp; Utilities to find installed versions of Claude Code.</summary>

```ts
/**
 * Finds all Claude Code installations on the machine via `$PATH` and hard-coded
 * search directories.
 */
async function findAllInstallations(): Promise<Installation[]>;

/**
 * Prompts the user to select one of the specified Claude Code installations
 * interactively using the same UI tweakcc uses, powered by [Ink + React](https://github.com/vadimdemedes/ink).
 */
async function showInteractiveInstallationPicker(
  candidates: Installation[]
): Promise<Installation | null>;

/**
 * Attempts to detect the user's preferred Claude Code installation.  Detection procedure:
 * 0. options.path
 * 1. Uses $TWEAKCC_CC_INSTALLATION_PATH if set.
 * 2. Uses ccInstallationPath in tweakcc config.
 * 3. Discovers installation from `claude` in PATH
 * 4. Looks in hard-coded search paths:
 *   a. If the search yields one installation, uses it
 *   b. If it yields multiple and options.interactive is true, display a picker
 *      via showInteractiveInstallationPicker().
 */
async function tryDetectInstallation(
  options: DetectInstallationOptions = {}
): Promise<Installation>;
```

Demo:

```js
> const insts = await tweakcc.findAllInstallations()
[
  {
    path: 'C:\\Users\\user\\.local\\share\\claude\\versions\\2.0.60',
    version: '2.0.60',
    kind: 'native'
  },
  {
    path: 'C:\\Users\\user\\.local\\share\\claude\\versions\\2.0.76',
    version: '2.0.76',
    kind: 'native'
  },
  {
    path: 'C:\\Users\\user\\AppData\\Local\\Volta\\tools\\image\\packages\\@anthropic-ai\\claude-code\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
    version: '2.1.32',
    kind: 'npm'
  }
]

> await tweakcc.tryDetectInstallation()
{
  path: 'C:\\Users\\user\\AppData\\Local\\Volta\\tools\\image\\packages\\@anthropic-ai\\claude-code\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
  version: '2.1.32',
  kind: 'npm'
}

> await tweakcc.showInteractiveInstallationPicker(insts)
No claude executable was found in PATH, but multiple Claude Code installations were found on this machine. Please select one:

❯ C:\Users\user\.local\share\claude\versions\2.0.60 (native-binary, v2.0.60)
  C:\Users\user\.local\share\claude\versions\2.0.76 (native-binary, v2.0.76)
  C:\Users\user\AppData\Local\Volta\tools\image\packages\@anthropic-ai\claude-code\node_modules\@anthropic-ai\claude-code\cli.js (npm-based, v2.1.32)

Your choice will be saved to ccInstallationPath in ~\.tweakcc/config.json.

Use ↑↓ arrows to navigate, Enter to select, Esc to quit
```

</details>

<details>
<summary><b>I/O</b>&nbsp;&nbsp;&bull;&nbsp;&nbsp; Functions to read and write the content of an npm-based or native (Bun-based) installation.</summary>

```ts
/**
 * Read Claude Code's JavaScript content.
 *
 * - npm installs: reads cli.js directly
 * - native installs: extracts embedded JS from binary
 */
async function readContent(installation: Installation): Promise<string>;

/**
 * Write modified JavaScript content back to Claude Code.
 *
 * - npm installs: writes to cli.js (handles permissions, hard links)
 * - native installs: repacks JS into binary
 */
async function writeContent(
  installation: Installation,
  content: string
): Promise<void>;
```

Demo:

```js
> const native2076Inst = { path: 'C:\\Users\\user\\.local\\share\\claude\\versions\\2.0.76', kind: 'native' };

// Reading native content:
> let content = await tweakcc.readContent(native2076Inst);
> content.length
10639722  // 10.6 MB
> content.slice(4153122, 4153122+236)
"var be$=\"You are Claude Code, Anthropic's official CLI for Claude.\",UBD=\"You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.\",GBD=\"You are a Claude agent, built on Anthropic's Claude Agent SDK.\""

// Updating and re-reading native content:
> content = content.replace(/Claude Code/g, 'My App')
> content = content.replace(/Anthropic(?: PBC)?/g, 'My Corp')
> await tweakcc.writeContent(native2076Inst, content)
undefined
> (await tweakcc.readContent(native2076Inst)).slice(4153122+16, 4153122+172)
"var be$=\"You are My App, My Corp's official CLI for Claude.\",UBD=\"You are My App, My Corp's official CLI for Claude, running within the Claude Agent SDK.\",GBD=\"You are a Claude agent, built on My Corp's Claude Agent SDK.\""

```

</details>

<details>
<summary><b>Backup</b>&nbsp;&nbsp;&bull;&nbsp;&nbsp; Simple utilities to handle creating and restoring backups of the native binary or `cli.js` in order to revert patches.</summary>

```ts
/**
 * Backup a file to a specified location, creating parent directories if needed.
 * Leaves the original file untouched.
 */
async function backupFile(
  sourcePath: string,
  backupPath: string
): Promise<void>;

/**
 * Restore a file from a backup, breaking hard links, which are common with pnpm/bun
 * installations, and preserving execute permissions.
 */
async function restoreBackup(
  backupPath: string,
  targetPath: string
): Promise<void>;
```

Demo:

```js
// Make a backup of the original install:
> const native2076Inst = { path: 'C:\\Users\\user\\.local\\share\\claude\\versions\\2.0.76', kind: 'native' };
> const backupPath = path.join(os.homedir(), ".myapp", `cc-${native2076Inst.kind}-backup`);
> await tweakcc.backupFile(native2076Inst.path, backupPath);
undefined
> fs.statSync(backupPath).size
234454688   // <-- It was made successfully; 234.5 MB.

// Now patch the original:
> await tweakcc.writeContent(native2076Inst, "(function(){console.log(\"Hi\")})");
> (await tweakcc.readContent(native2076Inst)).length
31          // <-- Original was successfully modified.

// Restore the backup:
> await tweakcc.restoreBackup(backupPath, native2076Inst.path)
> (await tweakcc.readContent(native2076Inst)).length
234454688   // Original, unpatched size.
```

</details>

<details>
<summary><b>Utilities</b>&nbsp;&nbsp;&bull;&nbsp;&nbsp; General utilities to help with patching.</summary>

````js
// Utilities to find various commonly-used variables in CC's code.
// See the docs for `tweakcc adhoc-patch --script` above for more details.
findChalkVar(fileContents: string): string | undefined;
getModuleLoaderFunction(fileContents: string): string | undefined;
getReactVar(fileContents: string): string | undefined;
getRequireFuncName(fileContents: string): string | undefined;
findTextComponent(fileContents: string): string | undefined;
findBoxComponent(fileContents: string): string | undefined;
/**
 * Clears the process-global caches that some of the above functions populate
 * to speed up subsequent repeated calls.  Use this when processing multiple CC
 * installs in one process.
 */
clearCaches(): void;

/**
 * Debug function for showing diffs between old and new file contents using smart word-level diffing.
 *
 * Uses the `diff` library to compute word-level differences and displays them with
 * chalk-styled colors: green background for additions, red background for removals, and
 * dim text for unchanged portions.
 *
 * Only outputs when --verbose flag is set.
 *
 * @param oldFileContents - The original file content before modification
 * @param newFileContents - The modified file content after patching
 * @param injectedText - The text that was injected (used to calculate context window)
 * @param startIndex - The start index where the modification occurred
 * @param endIndex - The end index of the original content that was replaced
 * @param numContextChars - Number of context characters to show before and after diff.
 */
export const showDiff = (
  oldFileContents: string,
  newFileContents: string,
  injectedText: string,
  startIndex: number,
  endIndex: number,
  numContextChars: number = 40
): void;

/**
 * Performs a global replace on a string, finding all matches first, then replacing
 * them in reverse order (to preserve indices), and calling showDiff for each replacement.
 *
 * @param content - The string to perform replacements on
 * @param pattern - The regex pattern to match (should have 'g' flag for multiple matches)
 * @param replacement - Either a string or a replacer function (same as String.replace)
 * @returns The modified string with all replacements applied
 *
 * @example
 * ```ts
 * const result = globalReplace(
 *   content,
 *   /throw Error\(`something`\);/g,
 *   ''
 * );
 * ```
 */
export const globalReplace = (
  content: string,
  pattern: RegExp,
  replacement: string | ((substring: string, ...args: unknown[]) => string)
): string;
````

Demo of `showDiff`:

```js
const pattern = /function [$\w]+\(\)\{return [$\w]+\("my_feature_flag"/;
const match = file.match(pattern)!;
const insertIndex = match.index + match[0].indexOf('{') + 1;
const insertion = 'return true;';

const newFile = file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

showDiff(file, newFile, insertion, insertIndex, insertIndex);
```

Demo of `globalReplace`:

```js
newFile = globalReplace(newFile, /"Claude Code",/g, '"My App"');
```

</details>

## System prompts

tweakcc allows you to customize the various parts of Claude Code's system prompt, including

- the main system prompt and any conditional bits,
- descriptions for all 17 builtin tools like `Bash`, `TodoWrite`, `Read`, etc.,
- prompts for builtin Task/Plan/Explore subagents, and
- prompts for utilities such as conversation compaction, WebFetch summarization, Bash command analysis, CLAUDE.md/output style/statusline creation, and many more.

👉 See [**Claude Code System Prompts**](https://github.com/Piebald-AI/claude-code-system-prompts) for a breakdown of all the system prompt parts, as well as a changelog and diffs for each CC version.

Because the system prompt is **dynamically composed** based on several factors, **it's not one string** that can be simply modified in a text editor. It's a bunch of smaller strings sprinkled throughout Claude Code's source code.

tweakcc's method for modifying the system prompts involves maintaining one markdown file for each individual portion of the prompt, resulting in a file for each tool description, each agent/utility prompt, and one for the main system prompt and a few more for various large notes inserted into other prompt parts.

#### How the prompt files are created

When tweakcc starts up, it downloads a list of system prompt parts for your Claude Code installation from GitHub (the [`data/prompts`](https://github.com/Piebald-AI/tweakcc/tree/main/data/prompts) folder in the tweakcc repo). It then checks if each prompt part has a corresponding markdown file on disk, creating ones that don't exist and populating them with the default text for the version.

:star: **To customize any part of the system prompt,** simply edit the markdown files in `~/.tweakcc/system-prompts` (or `$XDG_CONFIG_HOME/tweakcc/system-prompts`) and then run `npx tweakcc --apply`.

#### What happens when Anthropic changes the prompts?

When your Claude Code installation is updated, tweakcc will automatically update all of your markdown files that correspond to parts of the system prompt that were changed in the new version, unless you've modified any of them. But if you _did_ modify ones that Anthropic has also modified, then tweakcc will leave the ones you modified unchanged, and rely on you to resolve the conflict.

To assist you with resolving the conflicts, tweakcc will generate an HTML file that shows on the left, the diff of the change you've made, and on the right, the diff of Anthropic's changes. That way you can recall at a glance what you've changed in the prompt, and easily see what's changed in the new prompt. Then you can modify the markdown file for the prompt, incorporate or ignore new changes as you see fit.

> [!tip]
> Make sure to update the `ccVersion` field at the top of the file when you're done resolving the conflicts. If you don't, tweakcc won't know that you've resolved the conflicts and will continue to report conflicts and generate the HTML diff file. **Important:** Also note that the version you update `ccVersion` to is **not** necessarily the new version of CC that you installed; rather, it's the most recent version this particular system prompt was updated in. Different prompt files have different most-recently-modified versions.

Screenshot of the HTML file:

<img width="2525" height="1310" alt="tweakcc_html_diff" src="https://github.com/user-attachments/assets/52b02f2c-7846-4313-90bf-9ff97dae47f7" />

#### Git for version control over your customized prompts

This is a great idea, and we recommend it; in fact, we have one ourselves [here.](https://github.com/bl-ue/tweakcc-system-prompts) It allows you to keep your modified prompt safe in GitHub or elsewhere, and you can also switch from one set of prompts to another via branches, for example. In the future we plan to integrate git repo management for the system prompt markdown files into tweakcc. For now you'll need to manually initialize a git repository in `~/.tweakcc` directory. tweakcc automatically generates a recommended `.gitignore` file in that directory (which you can modify if you'd like).

## Toolsets

Toolsets are collections of built-in tools that Claude is allowed to call. Unlike Claude Code's builtin permission system, however, built-in tools that are not in the currently active toolset are not even sent to the model. As a result, Claude has no idea of tools that are not enabled in the current toolset (unless they happen to be mentioned in other parts of the system prompt), and it's not able to call them.

Toolsets can be helpful both for using Claude in different modes, e.g. a research mode where you might only include `WebFetch` and `WebSearch`, and for reducing the size of your system prompt by trimming out tools you don't ever want Claude to call. The description of each tool call is placed in the system prompt (see [here](https://github.com/Piebald-AI/claude-code-system-prompts#builtin-tool-descriptions)), and if there are multiple tools you don't care about (like `Skill`, `SlashCommand`, `BashOutput`, etc.), the accumulated size of their descriptions and parameters can bloat the context by several thousand tokens.

To create a toolset, run `npx tweakcc`, go to `Toolsets`, and hit `n` to create a new toolset. Set a name and enable/disable some tools, run `tweakcc --apply` to apply your customizations, and then run `claude`. If you marked a toolset as the default in tweakcc, it will be automatically selected.

## Feature: Thinking verbs customization

Customize the thinking verbs that appear while Claude is generating responses, along with the format string. You can change from the default `"Thinking… "` format to something more fun like `"Claude is {verb}ing..."` or anything else you prefer.

Here's a demo showing a custom thinking verb format in action:

![Claude Code showing "Claude is Baking..." as the thinking verb](./assets/demo.gif)

To customize thinking verbs, you can use the tweakcc UI or edit [`~/.tweakcc/config.json`](#configuration-directory) manually.

**Via the UI:**

1. Run `npx tweakcc`
2. Navigate to the **"Thinking verbs"** section
3. Use the tab key to switch between **Format** and **Verbs** sections
4. Edit the format string: the `{}` placeholder will be replaced with a randomly selected verb
5. Add, edit, or remove verbs from the list
6. Apply changes when satisfied

**Via `config.json`:**

In `.settings.thinkingVerbs`, configure the `format` and `verbs`:

```json
"thinkingVerbs": {
  "format": "{}… ",
  "verbs": [
    "Accomplishing",
    "Baking",
    "Cogitating",
    "Fermenting",
    "Moonwalking",
    "Noodling"
  ]
}
```

Here's the schema:

```typescript
{
  format: string;    // Format string, use {} as placeholder for the verb
  verbs: string[];   // Array of verbs (Claude randomly selects one)
}
```

**Examples of different formats:**

- Default format: `"{}… "` → displays as `"Thinking… "`
- Custom format: `"Claude is {verb}ing..."` → displays as `"Claude is Baking..."`
- Custom format: `"✻ {verb} (generating)"` → displays as `"✻ Baking (generating)"`
- Custom format: `"<{verb}> "` → displays as `"<Baking> "`

**Reset to defaults:**

To reset to the default verbs and format, run `npx tweakcc`, navigate to **Thinking verbs**, and press `Ctrl+R` to restore defaults (which include 200+ fun verbs like "Beboppin'", "Fermenting", "Moonwalking", etc.).

## Feature: Thinking indicator customizations

Customize the thinking indicator (spinner) animation that appears alongside the thinking verb. You can change the animation phases, speed, and whether it reverses direction.

The thinking indicator consists of a sequence of characters that cycle through while Claude is thinking, displayed alongside the thinking verb (e.g., `Thinking·` → `Thinking✢` → `Thinking✳` → etc.).

**Via `config.json`:**

In `.settings.thinkingStyle`, configure the animation:

```json
"thinkingStyle": {
  "updateInterval": 120,
  "phases": [
    "·",
    "✢",
    "✳",
    "✶",
    "✻",
    "✽"
  ],
  "reverseMirror": true
}
```

Here's the schema:

```typescript
{
  updateInterval: number;   // Animation speed in milliseconds (lower = faster)
  phases: string[];          // Array of characters that cycle through
  reverseMirror: boolean;    // Whether to reverse the animation sequence
}
```

**Examples of different animations:**

| Animation       | Phases                                               | Description                  |
| --------------- | ---------------------------------------------------- | ---------------------------- |
| Default stars   | `['·', '✢', '✳', '✶', '✻', '✽']`                    | Classic star burst animation |
| Simple dots     | `['.', '..', '...']`                                 | Classic loading dots         |
| Braille spinner | `['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']` | Braille-style spinner        |
| Arrow spinner   | `['←', '↖', '↑', '↗', '→', '↘', '↓', '↙']`       | Rotating arrow               |
| Minimal         | `['○', '◐', '◑', '●']`                               | Minimal circle animation     |

**Speed customization:**

- `updateInterval: 60` → Very fast animation (60ms per phase)
- `updateInterval: 120` → Default speed (120ms per phase)
- `updateInterval: 250` → Slower animation (250ms per phase)

## Feature: Input pattern highlighters

For a few weeks, when you typed the word "ultrathink" into the Claude Code input box, it would be highlighted rainbow. That's gone now, but the underlying highlighting infrastructure is still present in Claude Code today, and tweakcc lets you specify custom highlighters comprised of a **regular expression**, **format string**, and **colors & styling**.

Here's a demo where every word is assigned a different color based on its first letter:

![Input box showing every word colored differently based on its first letter](./assets/input_pattern_highlight_1_all_words_colored.png)

Here's one where various common patterns like environment variables, file paths, numbers, and markdown constructs are highlighted:

![Input box highlighting environment variables, file paths, numbers, and markdown constructs](./assets/input_pattern_highlight_2_common_patterns.png)

Finally, here's one showing how you can render extra characters that aren't really part of the prompt by customizing the **format string**. The first line shows a copy of what I've actually got typed into the prompt, and in the prompt itself you can see that `cluade` was _visually_ (but not _in reality_) replaced with `Claude Code, ...`, etc.

![Input box demonstrating format strings rendering extra characters not in the actual prompt](./assets/input_pattern_highlight_3_with_format_string.png)

To add some patterns, you can use the tweakcc UI or edit [`~/.tweakcc/config.json`](#configuration-directory) manually.

**Via the UI:**

| Listing                                                                                                                 | Edit                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ![Input pattern highlighters listing view showing configured patterns](./assets/input_pattern_highlighters_listing.png) | ![Input pattern highlighter edit view with fields for name, regex, colors, and styling](./assets/input_pattern_highlighters_edit.png) |

**Via `config.json`:**

In `.settings.inputPatternHighlighters` (an array), add a new object:

```json
"inputPatternHighlighters": [
  ...
  {
    "name": "File path",
    "regex": "(?:[a-zA-Z]:)?[/\\\\]?[a-zA-Z0-9._\\-]+(?:[/\\\\][a-zA-Z0-9._\\-]+)+",
    "regexFlags": "g",
    "format": "{MATCH}",
    "styling": [
      "bold"
    ],
    "foregroundColor": "rgb(71,194,10)",
    "backgroundColor": null,
    "enabled": true
  },
]
```

Here's the schema for the object format:

```typescript
{
  name: string;                   // User-friendly name
  regex: string;                  // Regex pattern (stored as string)
  regexFlags: string;             // Flags for the regex, must include 'g' for matchAll
  format: string;                 // Format string, use {MATCH} as placeholder
  styling: string[];              // ['bold', 'italic', 'underline', 'strikethrough', 'inverse']
  foregroundColor: string | null; // null = don't specify, otherwise rgb(r,g,b)
  backgroundColor: string | null; // null = don't specify, otherwise rgb(r,g,b)
  enabled: boolean;               // Temporarily disable this pattern
}
```

## Feature: Opus Plan 1M mode

tweakcc adds support for a new model alias: **`opusplan[1m]`**. This combines the best of both worlds:

- **Plan mode**: Uses **Opus 4.5** for complex reasoning and architecture decisions
- **Execution mode**: Uses **Sonnet 4.5 with 1M context** for code generation

#### Why use this?

Claude Sonnet 4.5 is aware of its context window, so when it gets close to full, the model exhibits [context anxiety](https://cognition.ai/blog/devin-sonnet-4-5-lessons-and-challenges), where it thinks there may not be enough context to complete the given task, so it takes shortcuts or leaves subtasks incomplete.

By using the 1M context model, Claude thinks it has plenty of room and doesn't skip things, and as long as you ensure you stay under 200k tokens you'll be charged the normal input/output rates even though you're using the 1M model. However, once you exceed 200k tokens when using the 1M model, you'll be automatically charged premium rates (2x for input tokens and 1.5x for output tokens)&mdash;see [the 1M context window docs](https://platform.claude.com/docs/en/build-with-claude/context-windows#1-m-token-context-window).

#### How to use it

After applying tweakcc patches, you can use `opusplan[1m]` like any other model alias:

```bash
# Via CLI flag
claude --model opusplan[1m]

# Or set it permanently via /model command in Claude Code
/model opusplan[1m]
```

| Mode                        | Model Used | Context Window |
| --------------------------- | ---------- | -------------- |
| Plan mode (Shift+Tab twice) | Opus 4.5   | 200k           |
| Execution mode (default)    | Sonnet 4.5 | **1M**         |

## Feature: MCP startup optimization

If you use multiple MCP servers, Claude Code's startup can be slow—waiting 10-15+ seconds for all servers to connect before you can start typing.

tweakcc fixes this with two optimizations (based on [this blog post](https://cuipengfei.is-a.dev/blog/2026/01/24/claude-code-mcp-startup-optimization/)):

1. **Non-blocking MCP connections** (enabled by default): Start typing immediately while MCP servers connect in the background
2. **Configurable batch size**: Connect more servers in parallel (default: 3, configurable from 1-20)

#### Results

| Configuration       | Startup Time | Improvement     |
| ------------------- | ------------ | --------------- |
| Default Claude Code | ~15s         | —               |
| With non-blocking   | ~7s          | **~50% faster** |

#### Configuration

**Via the UI:** Run `npx tweakcc`, go to **Misc**, and adjust:

- **Non-blocking MCP startup** — Toggle on/off (default: on)
- **MCP server batch size** — Use ←/→ arrows to adjust (1-20)

**Via `config.json`:**

```json
{
  "settings": {
    "misc": {
      "mcpConnectionNonBlocking": true,
      "mcpServerBatchSize": 8
    }
  }
}
```

| Setting                    | Default                         | Description                                   |
| -------------------------- | ------------------------------- | --------------------------------------------- |
| `mcpConnectionNonBlocking` | `true`                          | Start immediately, connect MCPs in background |
| `mcpServerBatchSize`       | `null` (uses CC's default of 3) | Number of parallel MCP connections (1-20)     |

## Feature: Table format

Recent Claude Code versions render tables using Unicode box-drawing characters. While these have a more elegant look compared to the traditional plain markdown table rendering, they take up more room due to the row dividers:

**`default`** — Original box-drawing with all row separators:

```
┌───────────┬───────────────────────────────┬───────┐
│  Library  │            Purpose            │ Size  │
├───────────┼───────────────────────────────┼───────┤
│ React     │ UI components, virtual DOM    │ ~40kb │
├───────────┼───────────────────────────────┼───────┤
│ Vue       │ Progressive framework         │ ~34kb │
├───────────┼───────────────────────────────┼───────┤
│ Svelte    │ Compile-time framework        │ ~2kb  │
└───────────┴───────────────────────────────┴───────┘
```

tweakcc provides three alternative formats:

**`ascii`** — ASCII/Markdown style using `|` and `-` (easy to copy-paste):

```
|  Library  |            Purpose            | Size  |
|-----------|-------------------------------|-------|
| React     | UI components, virtual DOM    | ~40kb |
| Vue       | Progressive framework         | ~34kb |
| Svelte    | Compile-time framework        | ~2kb  |
```

**`clean`** — Box-drawing without top/bottom borders or row separators:

```
│  Library  │            Purpose            │ Size  │
├───────────┼───────────────────────────────┼───────┤
│ React     │ UI components, virtual DOM    │ ~40kb │
│ Vue       │ Progressive framework         │ ~34kb │
│ Svelte    │ Compile-time framework        │ ~2kb  │
```

**`clean-top-bottom`** — Box-drawing with top/bottom borders but no row separators:

```
┌───────────┬───────────────────────────────┬───────┐
│  Library  │            Purpose            │ Size  │
├───────────┼───────────────────────────────┼───────┤
│ React     │ UI components, virtual DOM    │ ~40kb │
│ Vue       │ Progressive framework         │ ~34kb │
│ Svelte    │ Compile-time framework        │ ~2kb  │
└───────────┴───────────────────────────────┴───────┘
```

**Via the UI:** Run `npx tweakcc`, go to `Misc`, and cycle through the **Table format** options with spacebar. Then apply your customizations.

**Via `config.json`:**

```json
{
  "settings": {
    "misc": {
      "tableFormat": "ascii"
    }
  }
}
```

Valid values are `"default"`, `"ascii"`, `"clean"`, and `"clean-top-bottom"`.

## Feature: Swarm mode (native multi-agent)

Claude Code 2.1.16+ includes native multi-agent features that are gated behind the `tengu_brass_pebble` Statsig flag. tweakcc patches this gate to enable these features for everyone.

![Screenshot showing swarm mode status](./assets/swarm_1_swarm_status.png)
![Screenshot showing one of the workers requesting permission](./assets/swarm_2_worker_permission_request.png)

**Features unlocked:**

| Feature              | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| **TeammateTool**     | Tool for spawning and coordinating teammate agents         |
| **Delegate mode**    | Task tool mode option for delegating work                  |
| **Swarm spawning**   | `launchSwarm` + `teammateCount` parameters in ExitPlanMode |
| **Teammate mailbox** | Inter-agent messaging system                               |
| **Task teammates**   | Task list teammate display and coordination                |

**Enable/disable**

**Via the UI:** Run `npx tweakcc`, go to **Misc**, and check/uncheck **Enable swarm mode (native multi-agent)**. Then **Apply customizations**.

**Via `config.json`:**

```json
{
  "settings": {
    "misc": {
      "enableSwarmMode": true
    }
  }
}
```

## Feature: Token count rounding

In the generation status, where the thinking verb is displayed, e.g. `✻ Improvising… (35s · ↓ 279 tokens)`, the token count estimate will increase very rapidly at times. While it's helpful to know that the connection isn't stalled, such frequent UI updates can cause rendering issues in slow terminals, and if Claude Code is being run from a network, frequent updates can clog the network.

tweakcc can automatically round the token counters to the nearest multiple of a custom base number. For example, here are two demo clips showing the token count rounded to multiples of 50, and multiples of 1000:

| Description           | GIF                                          |
| --------------------- | -------------------------------------------- |
| **Multiples of 50**   | ![](./assets/token_count_rounding_by_50.gif) |
| **Multiples of 1000** | ![](./assets/token_count_rounding_by_1k.gif) |

**Configuration via UI:** Go to _Misc &rarr; Token count rounding_ towards the bottom.

![](./assets/token_count_rounding_setting_ui.png)

**Configuration via `config.json`:** While the tweakcc UI only allows common values like 10, 25, 500, 1000, etc., you can use any integer value for the setting itself in `config.json`. Open `~/.tweakcc/config.json` and set the `settings.misc.tokenCountRounding` field to your desired rounding base:

```json
{
  "settings": {
    "misc": {
      "tokenCountRounding": 123
    }
  }
}
```

Now token counts will be rounded to the nearest multiple of 123, e.g. 123, 246, 369, etc.

## Feature: Statusline update customization

Claude Code's statusline feature operates by running a specific command (e.g. a shell script) whenever the conversation history changes (i.e., a message is added), capturing the command's output&mdash;including ANSI escape codes for coloring&mdash;and rendering it in Claude Code under the input box.

It's neat functionality but the updates occur at what appear to be sporadic intervals. According to [the docs](https://code.claude.com/docs/en/statusline#:~:text=Updates%20run%20at%20most%20every%20300%20ms), _"Updates run at most every 300 ms,"_ but this is inaccurate&mdash;technically, updates are _queued_ for 300 milliseconds, meaning an update is triggered each time the chat history is updated, but is then delayed before execution for 300ms.

In the majority of cases, this behavior is fine. However, if you have a specialized use case, you may need updates to be throttled at 300ms like the documentation states, or even have updates automatically triggered at a specific interval.

tweakcc can patch Claude Code to correct this erratic queuing behavior, making it properly throttle updates at a customizable interval. It can also pace the updating, making it be performed at a regular interval, independent of changes to the chat history.

Here are two demos showing 1) updates triggered every 150ms, and 2) updates triggered by history updates, throttled at 1s. The `update = X` is a custom statusline, where _X_ increments each time the statusline is re-rendered.

| 150ms interval                                     | 1000ms throttling                               |
| -------------------------------------------------- | ----------------------------------------------- |
| ![](./assets/statusline_update_interval_150ms.gif) | ![](./assets/statusline_update_throttle_1s.gif) |

**Configuration via UI:** Go to _Misc &rarr; Statusline throttle_

![](./assets/statusline_ui_config.png)

**Configuration via `config.json`:** While the tweakcc UI only allows increments of 50ms for the statusline update interval, you can use any integer value for it by editing `config.json`. Open `~/.tweakcc/config.json` and set the `settings.misc.statuslineThrottleMs` field to your desired interval, and set `settings.misc.statuslineUseFixedInterval` to `true` for a fixed-pace interval or `false` for throttling.

```json
{
  "settings": {
    "misc": {
      "statuslineThrottleMs": 500,
      "statuslineUseFixedInterval": false
    }
  }
}
```

## Feature: AGENTS.md support

<sub><i>Supported Claude Code versions: 1.0.24 (and likely older) to 2.1.32+.</i></sub>

Claude Code is the only coding agent that doesn't support `AGENTS.md`; it only supports `CLAUDE.md` and `CLAUDE.local.md`. ([This issue](https://github.com/anthropics/claude-code/issues/6235) has over 2200 upvotes.) tweakcc automatically patches Claude Code to fall back to `AGENTS.md` and several others when `CLAUDE.md` doesn't exist.

The patch happens automatically, with a default set of `AGENTS.md`, `GEMINI.md`, `CRUSH.md`, `QWEN.md`, `IFLOW.md`, `WARP.md`, and `copilot-instructions.md`&mdash;you don't need to configure it specifically. However, if you'd like to support other file names, you can do so easily:

**Via UI:** Run `npx tweakcc@latest` and go to `CLAUDE.md alternate names`. Use <kbd>e</kbd> to edit a name, <kbd>d</kbd> to delete one, <kbd>n</kbd> to add a new one, <kbd>u</kbd>/<kbd>j</kbd> to move one up/down, and <kbd>ctrl + r</kbd> to reset to the default list mentioned above:

![Screenshot of the CLAUDE.md alternative names list](./assets/agents_md_config.png)

**Via `config.json`:** To configure the list of alternate `CLAUDE.md` names headlessly, set `settings.claudeMdAltNames` to a list of your desired names, in descending order of priority:

```json
{
  "settings": {
    "claudeMdAltNames": ["AGENTS.md", "context.md"]
  }
}
```

Note that `CLAUDE.md` is always used above all alternatives when it's available, so it's not required to include it in the list.

Here's a demo video of `AGENTS.md` working:

https://github.com/user-attachments/assets/27513489-bb89-4174-b62f-ab17b0fce7bd

## Feature: Bypass permissions check in sudo

⚠️ **Warning**: This feature disables a security check. Only enable it if you understand the implications.

By default, Claude Code prevents the use of `--dangerously-skip-permissions` when running under `sudo` to avoid accidental system-wide permission bypasses. This patch removes that restriction.

**Why you might need this**: Some system administration tasks or automated deployment scripts may require running Claude Code with elevated privileges while also bypassing permission checks. For example, when deploying to restricted directories or modifying system configuration files.

**Security implications**: When enabled, you can run Claude Code with sudo and bypass permission checks, potentially allowing Claude to perform system-level operations without prompts. Use extreme caution.

**Via the UI:** Run `npx tweakcc`, go to **Misc**, and toggle **Allow bypass permissions in sudo**.

**Via `config.json`:**

```json
{
  "settings": {
    "misc": {
      "allowBypassPermissionsInSudo": true
    }
  }
}
```

**Usage:**

`sudo claude --dangerously-skip-permissions`

## Feature: Auto-accept plan mode

<sub><i>Supported Claude Code versions: 2.1.22 to 2.1.32+.</i></sub>

When Claude finishes writing a plan and calls `ExitPlanMode`, you're normally shown a "Ready to code?" dialog with options to approve or continue editing. This patch automatically selects "Yes, clear context and auto-accept edits" without requiring user interaction.

**Via UI:** Run `npx tweakcc@latest` and navigate to `Miscellaneous Settings`. Scroll down to find `Auto-accept plan mode` and press space to enable it.

**Via `config.json`:** Set `settings.misc.autoAcceptPlanMode` to `true`:

```json
{
  "settings": {
    "misc": {
      "autoAcceptPlanMode": true
    }
  }
}
```

## Feature: Suppress native installer warning

When Claude Code detects that you've installed via npm, it warns you to use the native installer.
**Via the UI:** Run `npx tweakcc`, go to **Misc**, and toggle **Suppress native installer warning**.

**Via `config.json`:**

```json
{
  "settings": {
    "misc": {
      "suppressNativeInstallerWarning": true
    }
  }
}
```

## Feature: Scroll escape sequence filter

Some terminals may experience unwanted scrolling behavior caused by certain cursor positioning escape sequences (e.g., `\x1b[H` and `\x1b[A`). This patch filters out these problematic escape sequences from Claude Code's output to prevent scrolling issues.

**Via the UI:** Run `npx tweakcc`, go to **Misc**, and toggle **Filter scroll escape sequences**.

**Via `config.json`:**

```json
{
  "settings": {
    "misc": {
      "filterScrollEscapeSequences": true
    }
  }
}
```

## Configuration directory

tweakcc stores its configuration files in one of the following locations, in order of priority:

1. **`TWEAKCC_CONFIG_DIR`** environment variable if set, or
2. **`~/.tweakcc/`** if it exists, or
3. **`~/.claude/tweakcc`** if it exists, or
4. **`$XDG_CONFIG_HOME/tweakcc`** if the `XDG_CONFIG_HOME` environment variable is set.

If none of the above exist, `~/.tweakcc` will be created and used. If you version control `~/.claude` for Claude Code configuration and want your tweakcc config and system prompts there too, then manually create the directory first, or move your existing `~/.tweakcc` directory there:

```bash
# For new users
mkdir -p ~/.claude/tweakcc

# For existing users
mv ~/.tweakcc ~/.claude/tweakcc
```

## Building from source

You can use tweakcc by running `npx tweakcc`, or `npm install -g tweakcc` and then `tweakcc`. Or build and run it locally:

```bash
git clone https://github.com/Piebald-AI/tweakcc.git
cd tweakcc
pnpm i
pnpm build
node dist/index.mjs
```

## Troubleshooting

tweakcc stores a backup of your Claude Code `cli.js`/binary for when you want to revert your customizations and for reapplying patches. Before it applies your customizations, it restores the original `cli.js`/binary so that it can start from a clean slate. Sometimes things can get confused and your `claude` can be corrupted.

In particular, you may run into a situation where you have a tweakcc-patched (or maybe a prettier-formatted) `claude` but no tweakcc backup. And then it makes a backup of that modified `claude`. If you then try to reinstall Claude Code and apply your customizations, tweakcc will restore its backup of the old _modified_ `claude`.

To break out of this loop you can install a different version of Claude Code, which will cause tweakcc to discard its existing backup and take a fresh backup of the new `claude` file. Or you can simply delete tweakcc's backup file (located at `~/.tweakcc/cli.backup.js` or `~/.tweakcc/native-binary.backup`). If you do delete `cli.backup.js` or `native-binary.backup`, make sure you reinstall Claude Code _before_ you run tweakcc again, because if your `claude` is still the modified version, it will get into the same loop again.

## FAQ

#### System prompts

<details>
<summary>How can I customize my Claude Code system prompts?</summary>

Run `npx tweakcc` first, and then navigate to the `system-prompts` directory in your config directory (see [Configuration directory](#configuration-directory)), which will have just been created, in your file browser. Each markdown file contains parts of prompts, such as the main system prompt, built-in tool descriptions, and various agent and utility prompts. Modify any of them, and then run `tweakcc --apply` or the tweakcc UI to apply your changes.

</details>

<details>
<summary>Does tweakcc generate the prompt markdown files from my Claude Code installation?</summary>

No, it fetches them fresh from the [data/prompts](https://github.com/Piebald-AI/tweakcc/tree/main/data/prompts) folder in this (`tweakcc`) repo. There is one JSON file for each Claude Code version. When a new CC version is released, we generate a prompts file for it as soon as possible.

</details>

#### Themes

<details>
<summary>How can I customize my Claude Code theme?</summary>

Run `npx tweakcc`, go to `Themes`, and modify existing themes or create a new one. Then go back to the main menu and choose `Apply customizations`.

</details>

<details>
<summary>Why isn't all the text in Claude Code getting its color changed?</summary>

Some of the text Claude Code outputs has no coloring information at all, and unfortunately, that text is rendered using your terminal's default text foreground color and can't be customized.

</details>

<details>
<summary>Is there a way to disable colored output in Claude Code altogether?</summary>

Yes! You can use the [`FORCE_COLOR`](https://force-color.org/) environment variable, a convention which many CLI tools including Claude Code respect. Set it to `0` to disable colors entirely in Claude Code.

</details>

<details>
<summary>Why isn't my new theme being applied?</summary>

Could you have forgotten to actually set Claude Code's theme to your new theme? Run `claude` and then use `/theme` to switch to your new theme if so.

</details>

#### Other

<details>
<summary>tweakcc vs. tweakcn...?</summary>

[tweakcn](https://github.com/jnsahaj/tweakcn), though similarly named, is unrelated to tweakcc or Claude Code. It's a tool for editing your [shadcn/ui](https://github.com/shadcn-ui/ui) themes. Check it out!

</details>

## Contributing

Contributions are welcome! Whether you're fixing a bug, adding a new feature, improving documentation, or adding tests, we appreciate your help.

For detailed guidelines on development setup, code style, testing, and submitting pull requests, see the [CONTRIBUTING.md](https://github.com/Piebald-AI/tweakcc/blob/main/CONTRIBUTING.md) file.

**Quick Start:**

1. Fork the repository and create a new branch
2. Make your changes following the code style guidelines
3. Run tests and linting: `pnpm test && pnpm lint`
4. Submit a pull request with a clear description

## Related projects

- [**cc-mirror**](https://github.com/numman-ali/cc-mirror) - Create multiple isolated Claude Code variants with custom providers (Z.ai, MiniMax, OpenRouter, LiteLLM). Uses tweakcc to customize system prompts, themes, thinking styles, and toolsets.

Other tools for customizing Claude Code or adding functionality to it:

- [**clotilde**](https://github.com/fgrehm/clotilde) - Wrapper for Claude Code that adds powerful manual session naming, resuming, forking, and incognito (ephemeral) session management to Claude Code.
- [**ccstatusline**](https://github.com/sirmalloc/ccstatusline) - Highly customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics in your terminal.
- [**claude-powerline**](https://github.com/Owloops/claude-powerline) - Vim-style powerline statusline for Claude Code with real-time usage tracking, git integration, and custom themes.
- [**CCometixLine**](https://github.com/Haleclipse/CCometixLine) - A high-performance Claude Code statusline tool written in Rust with Git integration, usage tracking, interactive TUI configuration, and Claude Code enhancement utilities.

Forks:

- [**tweakgc-cli**](https://github.com/DanielNappa/tweakgc-cli) - CLI tool to extend the GitHub Copilot CLI to accept more selectable models.

## License

[MIT](https://github.com/Piebald-AI/tweakcc/blob/main/LICENSE)

Copyright © 2026 [Piebald LLC](https://piebald.ai).
