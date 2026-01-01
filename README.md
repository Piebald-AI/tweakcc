<div>
<div align="right">
<a href="https://piebald.ai"><img width="200" top="20" align="right" src="https://github.com/Piebald-AI/.github/raw/main/Wordmark.svg"></a>
</div>

<div align="left">

### Announcement: Piebald is released!
We've released **Piebald**, the ultimate agentic AI developer experience. \
Download it and try it out for free!  **https://piebald.ai/**

<sub>[Scroll down for tweakcc.](#tweakcc) :point_down:</sub>

</div>
</div>

<div align="left">
<a href="https://piebald.ai">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://piebald.ai/screenshot-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://piebald.ai/screenshot-light.png">
  <img alt="hero" width="600" src="https://piebald.ai/screenshot-light.png">
</picture>
</a>
</div>

# tweakcc

[![tweakcc on npm](https://img.shields.io/npm/v/tweakcc?color)](https://www.npmjs.com/package/tweakcc)
[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge.svg)](https://github.com/hesreallyhim/awesome-claude-code)
[![ClaudeLog - A comprehensive knowledge base for Claude.](https://claudelog.com/img/claude_log_badge.svg)](https://claudelog.com/)

**tweakcc is a CLI tool that upgrades your Claude Code experience.**  Customize its system prompts, add custom themes, create toolsets, and personalize the UI.  From the team behind [<img src="https://github.com/Piebald-AI/piebald/raw/main/assets/logo.svg" width="15"> **Piebald.**](https://piebald.ai/)

<!--
> [!note]
> ⭐ **If you find tweakcc useful, please consider [starring the repository](https://github.com/Piebald-AI/tweakcc) to show your support!** ⭐
-->

<img src="./assets/demo.gif" alt="Animated GIF demonstrating running `npx tweakcc`, creating a new theme, changing all of Claude Code's UI colors to purple, changing the thinking format from '<verb>ing...' to 'Claude is <verb>ing', changing the generating spinner style to a 50m glow animation, applying the changes, running Claude, and using '/config' to switch to the new theme, and sending a message to see the new thinking verb format." width="800">

With tweakcc, you can

- Customize all of Claude Code's **system prompts** (**NEW:** also see all of [**Claude Code's system prompts**](https://github.com/Piebald-AI/claude-code-system-prompts))
- Create custom **toolsets** that can be used in Claude Code with the new **`/toolset`** command
- Manually name **sessions** in Claude Code with `/title my chat name` or `/rename` (see [**our blog post**](https://piebald.ai/blog/messages-as-commits-claude-codes-git-like-dag-of-conversations) for implementation details)
- Create **custom themes** with a graphical HSL/RGB color picker
- Add custom **thinking verbs** that will show while Claude's working
- Create custom **thinking spinner animations** with different speeds and phases
- Style the **user messages in the chat history** beyond the default plain gray text
- Remove the **ASCII border** from the input box
- Expand **thinking blocks** by default, so that you don't need to use the transcript (<kbd>Ctrl+O</kbd>) to see them

tweakcc also
- Fixes a bug where the **spinner animation** is frozen if you have the `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` environment variable set ([#46](https://github.com/Piebald-AI/tweakcc/issues/46))
- Allows you to **change the context limit** (default: 200k tokens) used with models from custom Anthropic-compatible APIs with a new environment variable, `CLAUDE_CODE_CONTEXT_LIMIT`
- Adds a message to Claude Code's startup banner indicating that you're running the patched version of CC (configurable)

Additionally, we're working on features that will allow you to
- Pick from over **70+ spinning/thinking animations** from [`cli-spinners`](https://github.com/sindresorhus/cli-spinners)
- Apply **custom styling** to the markdown elements in Claude's responses like code, bold, headers, etc

tweakcc supports Claude Code installed on **Windows, macOS, and Linux**, both **native/binary installations** and those installed via npm, yarn, pnpm, bun, Homebrew/Linuxbrew, nvm, fnm, n, volta, nvs, and nodenv, as well as custom locations.

Run without installation:

```bash
$ npx tweakcc

# Or use pnpm:
$ pnpm dlx tweakcc
```

## How it works

tweakcc works by patching Claude Code's minified `cli.js` file.  For npm-based installations this file is modified directly, but for native installation it's extracted from the binary, patched, and then the binary is repacked.  When you update your Claude Code installation, your customizations will be overwritten, but they're remembered in your configuration file, so they can be reapplied by just running `npx tweakcc --apply`.

tweakcc is verified to work with Claude Code **2.0.69**.

### Configuration directory

tweakcc stores its configuration files in one of the following locations, in order of priority:

1. **`TWEAKCC_CONFIG_DIR`** environment variable if set, or
2. **`~/.tweakcc/`** if it exists, or
3. **`~/.claude/tweakcc`** if it exists, or
4. **`$XDG_CONFIG_HOME/tweakcc`** if the `XDG_CONFIG_HOME` environment variable is set.

If none of the above exist, `~/.tweakcc` will be created and used.  If you version control `~/.claude` for Claude Code configuration and want your tweakcc config and system prompts there too, then manually create the directory first, or move your existing `~/.tweakcc` directory there:

```bash
# For new users
mkdir -p ~/.claude/tweakcc

# For existing users
mv ~/.tweakcc ~/.claude/tweakcc
```

## Building from source

You can use tweakcc by running `npx tweakcc`, or `npm install -g tweakcc` and then `tweakcc`.  Or build and run it locally:

```bash
git clone https://github.com/Piebald-AI/tweakcc.git
cd tweakcc
pnpm i
pnpm build
node dist/index.js
```

## Related projects

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

Because the system prompt is **dynamically composed** based on several factors, **it's not one string** that can be simply modified in a text editor.  It's a bunch of smaller strings sprinkled throughout Claude Code's source code.

tweakcc's method for modifying involves maintaining one markdown file for each individual portion of the prompt, resulting in a file for each tool description, each agent/utility prompt, and one for the main system prompt and a few more for various large notes inserted into other prompt parts.

#### How the prompt files are created

When tweakcc starts up, it downloads a list of system prompt parts for your Claude Code installation from GitHub (the [`data/prompts`](https://github.com/Piebald-AI/tweakcc/tree/main/data/prompts) folder in the tweakcc repo).  It then checks if each prompt part has a corresponding markdown file on disk, creating ones that don't exist and populating them with the default text for the version.

Simply edit the markdown files in `~/.tweakcc/system-prompts` (or `$XDG_CONFIG_HOME/tweakcc/system-prompts`) and then run `npx tweakcc --apply`.

#### What happens when Anthropic changes the prompts?

When your Claude Code installation is updated, tweakcc will automatically update all of your markdown files that correspond to parts of the system prompt that were changed in the new version, unless you've modified any of them.  But if you _did_ modify ones that Anthropic has also modified, then tweakcc will leave the ones you modified unchanged, and rely on you to resolve the conflict.

To assist you with resolving the conflicts, tweakcc will generate an HTML file that shows on the left, the diff of the change you've made, and on the right, the diff of Anthropic's changes.  That way you can recall at a glance what you've changed in the prompt, and easily see what's changed in the new prompt.  Then you can modify the markdown file for the prompt, incorporate or ignore new changes as you see fit.

> [!tip]
> Make sure to update the `ccVersion` field at the top of the file when you're done resolving the conflicts.  If you don't, tweakcc won't know that you've resolved the conflicts and will continue to report conflicts and generate the HTML diff file.  **Important:** Also note that the version you update `ccVersion` to is **not** necessarily the new version of CC that you installed; rather, it's the most recent version this particular system prompt was updated in.  Different prompt files have different most-recently-modified versions.

Screenshot of the HTML file:

<img width="2525" height="1310" alt="tweakcc_html_diff" src="https://github.com/user-attachments/assets/52b02f2c-7846-4313-90bf-9ff97dae47f7" />

#### Git for version control over your customized prompts

This is a great idea, and we recommend it; in fact, we have one ourselves [here.](https://github.com/bl-ue/tweakcc-system-prompts)  It allows you to keep your modified prompt safe in GitHub or elsewhere, and you can also switch from one set of prompts to another via branches, for example.  In the future we plan to integrate git repo management for the system prompt markdown files into tweakcc.  For now you'll need to manually initialize a git repository in `~/.tweakcc` directory.  tweakcc automatically generates a recommended `.gitignore` file in that directory (which you can modify if you'd like).

## Toolsets

Toolsets are collections of built-in tools that Claude is allowed to call.  Unlike Claude Code's builtin permission system, however, built-in tools that are not in the currently active toolset are not even sent to the model.  As a result, Claude has no idea of tools that are not enabled in the current toolset (unless they happen to be mentioned in other parts of the system prompt), and it's not able to call them.

Toolsets can be helpful both for using Claude in different modes, e.g. a research mode where you might only include `WebFetch` and `WebSearch`, and for keeping the size of your system prompt by trimming out tools you don't ever want Claude to call.  The description of each tool call is placed in the system prompt (see [here](https://github.com/Piebald-AI/claude-code-system-prompts#builtin-tool-descriptions)), and if there are multiple tools you don't care about (like `Skill`, `SlashCommand`, `BashOutput`, etc.), the accumulated size of their descriptions and parameters can bloat the context by several thousand tokens.

To create a toolset, run `npx tweakcc`, go to `Toolsets`, and hit `n` to create a new toolset.  Set tapply your customizations, and then run `claude`.  If you marked a toolset as the default in tweakcc, it will be automatically selected.

## Troubleshooting

tweakcc stores a backup of your Claude Code `cli.js`/binary for when you want to revert your customizations and for reapplying patches.  Before it applies your customizations, it restores the original `cli.js`/binary so that it can start from a clean slate.  Sometimes things can get confused and your `claude` can be corrupted.

In particular, you may run into a situation where you have a tweakcc-patched (or maybe a formatted) `claude` but no tweakcc backup.  And then it makes a backup of that modified `claude`.  If you then try to reinstall Claude Code and apply your customizations, tweakcc will restore its backup of the old _modified_ `claude`.

To break out of this loop you can install a different version of Claude Code, which will cause tweakcc to discard its existing backup and take a fresh backup of the new `claude` file.  Or you can simply delete tweakcc's backup file (located at `~/.tweakcc/cli.backup.js` or `~/.tweakcc/native-binary.backup`).  If you do delete `cli.backup.js` or `native-binary.backup`, make sure you reinstall Claude Code _before_ you run tweakcc again, because if your `claude` is still the modified version, it will get into the same loop again.

## FAQ

#### System prompts

<details>
<summary>How can I customize my Claude Code system prompts?</summary>

Run `npx tweakcc` first, and then navigate to the `system-prompts` directory in your config directory (see [Configuration directory](#configuration-directory)), which will have just been created, in your file browser.  Each markdown file contains parts of prompts, such as the main system prompt, built-in tool descriptions, and various agent and utility prompts.  Modify any of them, and then run `tweakcc --apply` or the tweakcc UI to apply your changes.

</details>

<details>
<summary>Does tweakcc generate the prompt markdown files from my Claude Code installation?</summary>

No, it fetches them fresh from the [data/prompts](https://github.com/Piebald-AI/tweakcc/tree/main/data/prompts) folder in this (`tweakcc`) repo.  There is one JSON file for each Claude Code version.  When a new CC version is released, we generate a prompts file for it as soon as possible.

</details>


#### Themes

<details>
<summary>How can I customize my Claude Code theme?</summary>

Run `npx tweakcc`, go to `Themes`, and modify existing themes or create a new one.  Then go back to the main menu and choose `Apply customizations`.

</details>

<details>
<summary>Why isn't all the text in Claude Code getting its color changed?</summary>

Some of the text Claude Code outputs has no coloring information at all, and unfortunately, that text is rendered using your terminal's default text foreground color and can't be customized.

</details>

<details>
<summary>Is there a way to disable colored output in Claude Code altogether?</summary>

Yes!  You can use the [`FORCE_COLOR`](https://force-color.org/) environment variable, a convention which many CLI tools including Claude Code respect.  Set it to `0` to disable colors entirely in Claude Code.

</details>

<details>
<summary>Why isn't my new theme being applied?</summary>

Could you have forgotten to actually set Claude Code's theme to your new theme?  Run `claude` and then use `/theme` to switch to your new theme if so.

</details>

#### Other

<details>
<summary>tweakcc vs. tweakcn...?</summary>

[tweakcn](https://github.com/jnsahaj/tweakcn), though similarly named, is unrelated to tweakcc or Claude Code.  It's a tool for editing your [shadcn/ui](https://github.com/shadcn-ui/ui) themes.  Check it out!

</details>

## License

[MIT](https://github.com/Piebald-AI/tweakcc/blob/main/LICENSE)

Copyright © 2025 [Piebald LLC](https://piebald.ai).
