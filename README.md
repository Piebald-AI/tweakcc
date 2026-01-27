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

<img src="./assets/demo.gif" alt="Animated GIF demonstrating running `npx tweakcc`, creating a new theme, changing all of Claude Code's UI colors to purple, changing the thinking format from '<verb>ing...' to 'Claude is <verb>ing', changing the generating spinner style to a 50m glow animation, applying the changes, running Claude, and using '/config' to switch to the new theme, and sending a message to see the new thinking verb format." width="800">

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
- Adds the **`opusplan[1m]`** model alias, combining Opus for planning with Sonnet's 1M context for execution—reducing "[context anxiety](#opus-plan-1m-mode)" ([#108](https://github.com/Piebald-AI/tweakcc/issues/108))
- Adds a message to Claude Code's startup banner indicating that you're running the patched version of CC (configurable)
- Speeds up Claude Code startup by **~50%** with non-blocking MCP connections and configurable parallel connection batch size ([#406](https://github.com/Piebald-AI/tweakcc/issues/406))
- Enables native multi-agent/swarm mode (TeammateTool, delegate mode, swarm spawning) by bypassing the `tengu_brass_pebble` Statsig flag.

Additionally, we're working on features that will allow you to

- Pick from over **70+ spinning/thinking animations** from [`cli-spinners`](https://github.com/sindresorhus/cli-spinners)
- Apply **custom styling** to the markdown elements in Claude's responses like code, bold, headers, etc

tweakcc supports Claude Code installed on **Windows, macOS, and Linux**, both **native/binary installations** and those installed via npm, yarn, pnpm, bun, Homebrew/Linuxbrew, nvm, fnm, n, volta, nvs, and nodenv, as well as custom locations.

tweakcc supports Claude Code's **native installation**, which is a large platform-specific native executable containing the same minified/compiled JavaScript code from npm, just packaged up in a [Bun](https://github.com/oven-sh/bun) binary.  We support patching the native binary on macOS, Windows, and Linux, including ad-hoc signing on Apple Silicon, via [**node-lief**](https://github.com/Piebald-AI/node-lief), our Node.js bindings for [LIEF (Library to Instrument Executables)](https://github.com/lief-project/LIEF).

Run without installation:

```bash
$ npx tweakcc

# Or use pnpm:
$ pnpm dlx tweakcc
```

## Table of contents

- [How it works](#how-it-works)
- [**Features**](#features)
  - [MCP startup optimization](#mcp-startup-optimization)
  - [Input pattern highlighters](#input-pattern-highlighters)
  - [Opus Plan 1M mode](#opus-plan-1m-mode)
  - [Table format](#table-format)
  - [Swarm mode (native multi-agent)](#swarm-mode-native-multi-agent)
- [Configuration directory](#configuration-directory)
- [Building from source](#building-from-source)
- [Related projects](#related-projects)
- [System prompts](#system-prompts)
- [Toolsets](#toolsets)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [License](#license)

## How it works

tweakcc works by patching Claude Code's minified `cli.js` file. For npm-based installations this file is modified directly, but for native installation it's extracted from the binary, patched, and then the binary is repacked. When you update your Claude Code installation, your customizations will be overwritten, but they're remembered in your configuration file, so they can be reapplied by just running `npx tweakcc --apply`.

tweakcc is verified to work with Claude Code **2.1.2.** In newer or earlier versions various patches might not work. However, if we have the [system prompts for your version](https://github.com/Piebald-AI/tweakcc/tree/main/data/prompts) then system prompt patching is guaranteed to work with that version, even if it's significantly different from the verified CC version. We get the latest system prompts within minutes of each new CC release, so unless you're using a CC version older than 2.0.14, your version is supported.

## Features

_More feature documentation coming soon._

### Input pattern highlighters

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

### Opus Plan 1M mode

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

### MCP startup optimization

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

### Table format

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

### Swarm mode (native multi-agent)

Claude Code 2.1.16+ includes native multi-agent features that are gated behind the `tengu_brass_pebble` Statsig flag. tweakcc patches this gate to enable these features for everyone.

![Screenshot showing swarm mode status](./assets/swarm_1_swarm_status.png)
![Screenshot showing one of the workers request permission](./assets/swarm_2_worker_permission_request.png)

**Features unlocked:**

| Feature              | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| **TeammateTool**     | Tool for spawning and coordinating teammate agents         |
| **Delegate mode**    | Task tool mode option for delegating work                  |
| **Swarm spawning**   | `launchSwarm` + `teammateCount` parameters in ExitPlanMode |
| **Teammate mailbox** | Inter-agent messaging system                               |
| **Task teammates**   | Task list teammate display and coordination                |

**Enable/disable**

**Via the UI:** Run `npx tweakcc`, go to **Misc**, and check/uncheck **Enable swarm mode (native multi-agent)**.  Then **Apply customizations**.

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
node dist/index.js
```

## Related projects

- [**cc-mirror**](https://github.com/numman-ali/cc-mirror) - Create multiple isolated Claude Code variants with custom providers (Z.ai, MiniMax, OpenRouter, LiteLLM). Uses tweakcc to customize system prompts, themes, thinking styles, and toolsets.

Other tools for customizing Claude Code or adding functionality to it:

- [**clotilde**](https://github.com/fgrehm/clotilde) - Wrapper for Claude Code that adds powerful manual session naming, resuming, forking, and incognito (ephemeral) session management to Claude Code.
- [**ccstatusline**](https://github.com/sirmalloc/ccstatusline) - Highly customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics in your terminal.
- [**claude-powerline**](https://github.com/Owloops/claude-powerline) - Vim-style powerline statusline for Claude Code with real-time usage tracking, git integration, and custom themes.
- [**CCometixLine**](https://github.com/Haleclipse/CCometixLine) - A high-performance Claude Code statusline tool written in Rust with Git integration, usage tracking, interactive TUI configuration, and Claude Code enhancement utilities.

Forks:

- [**tweakgc-cli**](https://github.com/DanielNappa/tweakgc-cli) - CLI tool to extend the GitHub Copilot CLI to accept more selectable models.

## System prompts

tweakcc allows you to customize the various parts of Claude Code's system prompt, including

- the main system prompt and any conditional bits,
- descriptions for all 17 builtin tools like `Bash`, `TodoWrite`, `Read`, etc.,
- prompts for builtin Task/Plan/Explore subagents, and
- prompts for utilities such as conversation compaction, WebFetch summarization, Bash command analysis, CLAUDE.md/output style/statusline creation, and many more.

👉 See [**Claude Code System Prompts**](https://github.com/Piebald-AI/claude-code-system-prompts) for a breakdown of all the system prompt parts, as well as a changelog and diffs for each CC version.

Because the system prompt is **dynamically composed** based on several factors, **it's not one string** that can be simply modified in a text editor. It's a bunch of smaller strings sprinkled throughout Claude Code's source code.

tweakcc's method for modifying involves maintaining one markdown file for each individual portion of the prompt, resulting in a file for each tool description, each agent/utility prompt, and one for the main system prompt and a few more for various large notes inserted into other prompt parts.

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

Toolsets can be helpful both for using Claude in different modes, e.g. a research mode where you might only include `WebFetch` and `WebSearch`, and for keeping the size of your system prompt by trimming out tools you don't ever want Claude to call. The description of each tool call is placed in the system prompt (see [here](https://github.com/Piebald-AI/claude-code-system-prompts#builtin-tool-descriptions)), and if there are multiple tools you don't care about (like `Skill`, `SlashCommand`, `BashOutput`, etc.), the accumulated size of their descriptions and parameters can bloat the context by several thousand tokens.

To create a toolset, run `npx tweakcc`, go to `Toolsets`, and hit `n` to create a new toolset. Set to apply your customizations, and then run `claude`. If you marked a toolset as the default in tweakcc, it will be automatically selected.

## Troubleshooting

tweakcc stores a backup of your Claude Code `cli.js`/binary for when you want to revert your customizations and for reapplying patches. Before it applies your customizations, it restores the original `cli.js`/binary so that it can start from a clean slate. Sometimes things can get confused and your `claude` can be corrupted.

In particular, you may run into a situation where you have a tweakcc-patched (or maybe a formatted) `claude` but no tweakcc backup. And then it makes a backup of that modified `claude`. If you then try to reinstall Claude Code and apply your customizations, tweakcc will restore its backup of the old _modified_ `claude`.

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

## License

[MIT](https://github.com/Piebald-AI/tweakcc/blob/main/LICENSE)

Copyright © 2025 [Piebald LLC](https://piebald.ai).
