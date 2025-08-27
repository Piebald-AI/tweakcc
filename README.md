# 🎨 tweakcc

[![tweakcc on npm](https://img.shields.io/npm/v/tweakcc?color=yellow")](https://www.npmjs.com/package/tweakcc)
[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge.svg)](https://github.com/hesreallyhim/awesome-claude-code)
[![ClaudeLog - A comprehensive knowledge base for Claude.](https://claudelog.com/img/claude_log_badge.svg)](https://claudelog.com/)

`tweakcc` is a lightweight, interactive CLI tool that lets you personalize your Claude Code interface.

- Create **custom themes** with a graphical HSL/RGB color picker
- Add custom **thinking verbs** that will show while Claude's working
- Create custom **thinking spinner animations** with different speeds and phases
- Change the "CLAUDE CODE" banner text to your own text with your own [figlet](http://www.figlet.org/) fonts
- Supports Claude Code installed on **Windows, macOS, and Linux**, using npm, yarn, pnpm, bun, Homebrew, nvm, fnm, n, volta, nvs, and nodenv, or a custom location

Planned / in progress:
- Pick from over **70+ spinning/thinking animations** from [`cli-spinners`](https://github.com/sindresorhus/cli-spinners)
- Apply **custom styling** to the markdown elements in Claude's responses like code, bold, headers, etc
- Customize the **shimmering effect** on the thinking verb: disable it; change its speed, width, and colors
- Style the **user messages in the chat history** beyond the default plain gray text

Run without installation:

```bash
$ npx tweakcc

# Or use pnpm:
$ pnpm dlx tweakcc
```

Demo video:

https://github.com/user-attachments/assets/5800342e-3adc-4914-ab6f-44a73294a872

## How it works

`tweakcc` works by patching the Claude Code's minified `cli.js` file.  When you update your Claude Code installation, your customizations will be overwritten, but they're remembered in your `~/.tweakcc/config.js` configuration file, so they can be reapplied by just rerunning the tool.

Works with Claude Code 1.0.92

## Running

Run with installing it with `npx tweakcc`.  Or build and run it locally:

```bash
git clone https://github.com/Piebald-AI/tweakcc.git
cd tweakcc
pnpm i
pnpm build
node dist/index.js
```

## Related projects

- [**ccstatusline**](https://github.com/sirmalloc/ccstatusline) - Highly customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics in your terminal.
- [**claude-powerline**](https://github.com/Owloops/claude-powerline) - Vim-style powerline statusline for Claude Code with real-time usage tracking, git integration, and custom themes.

## FAQ

#### How can I customize my Claude Code theme?

Run `npx tweakcc`, go to `Themes`, and modify existing themes or create a new one.  Then go back to the main menu and choose `Apply customizations to cli.js`.

#### Why isn't all the text in Claude Code is getting its color changed?

Some of the text Claude Code outputs has no coloring information at all, and unfortunately, that text is rendered using your terminal's default text foreground color and can't be customized.

#### Is there a way to disable colored output in Claude Code altogether?

Yes!  You can use the [`FORCE_COLOR`](https://force-color.org/) environment variable, a convention which many CLI tools including Claude Code respect.  Set it to `0` to disable colors entirely in Claude Code.

#### Why isn't my new theme being applied?

Could you have have forgotten to actually set Claude Code's theme to your new theme?  Run `claude` and then use `/theme` to switch to your new theme if so.

#### `tweakcc` vs. `tweakcn`...?

[`tweakcn`](https://github.com/jnsahaj/tweakcn), though similarly named, is unrelated to `tweakcc` or Claude Code.  It's a tool for editing your [shadcn/ui](https://github.com/shadcn-ui/ui) themes.  Check it out!

## License

[MIT](https://github.com/Piebald-AI/tweakcc/blob/main/LICENSE)

Copyright © 2025 [Piebald LLC](https://piebald.ai).
