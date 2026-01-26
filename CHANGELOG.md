# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- Add a fallback for WASMagic when it's not available (#399) - @signadou
- Add opusplan[1m] model alias for 1M context support (#404) - @mike1858
- Add MCP startup optimization settings (#407) - @mike1858
- Add all available CC tools and their aliases to the toolset editor (#410) - @signadou
- Add the option to be able to change the table format - @mike1858
- Enable swarm mode (via `tengu_brass_pebble`) (#414) - @mike1858

## [v3.4.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.4.0) - 2026-01-18

- Add input pattern highlighters (#387) - @bl-ue
- Fix patching for CC 2.1.9 (#388) - @basekevin
- Add missing fields recursively to settings on startup (#389) - @bl-ue

## [v3.3.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.3.0) - 2026-01-18

- Suppress /rate-limit-options from being triggered when rate limits are hit (#358) - @basekevin
- Don't suppress line numbers by default (#360) - @bl-ue
- Fix hideCtrlGToEdit patch (#361) - @basekevin
- Fix context limit patch for CC 2.1.5 (#367) - @bl-ue
- Add a patch to make thinking blocks italic and dim again (#369) - @bl-ue
- Don't trim newlines when reading system prompt markdown files (#380)
- Make the `expandThinkingBlocks` patch optional per the existing setting (#381) - @bl-ue

## [v3.2.5](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.2.5) - 2026-01-09

- Fix patching for CC 2.1.2 (#352) - @basekevin
- Update node-lief to 0.1.8 (#340) - @signadou
- Add subagent model configuration (#331) - @brrock

## [v3.2.4](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.2.4) - 2026-01-04

- Fix macOS and Windows native installation support (#327) - @signadou
- Suppress line numbers in edit/read tools: `1→Line 1` to `Line 1` (#326) - @basekevin

## [v3.2.3](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.2.3) - 2026-01-01

- Increase thinkerFormat search window to 1000 chars (#317) - @ljepson
- Add `--verbose` flag (#320) - @signadou
- Add debug logs for native installation module loading (#321) - @signadou
- Fix native installation support (#322) - @signadou

## [v3.2.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.2.2) - 2025-12-21

- Add an option to increase tokens that can be read in a single file (#314) - @mike1858

## [v3.2.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.2.1) - 2025-12-19

- Remove the patch to hide the thinking banner - the banner itself was removed in CC 2.0.70 (#298) - @basekevin
- Fallback instead of error when claude is in PATH but not cli.js/binary (#307) - @bl-ue

## [v3.2.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.2.0) - 2025-12-14

- Support for `~/.claude/tweakcc` configuration directory location (#259) - @bl-ue
- `TWEAKCC_CONFIG_DIR` environment variable for explicit config location override (#259) - @bl-ue
- Warning when multiple configuration locations are detected (#259) - @bl-ue
- Configuration priority order now: `TWEAKCC_CONFIG_DIR` > `~/.tweakcc` (if exists) > `~/.claude/tweakcc` > `XDG_CONFIG_HOME/tweakcc` > `~/.tweakcc` (default) (#259) - @bl-ue
- Fix Claude Code hanging due to `/title` patches (#265) - @bl-ue
- Allow disabling `/title` patches via the Misc view (#265) - @bl-ue
- Add `EnterPlanMode` and `LSP` to the toolset edit view (#266) - @bl-ue
- Ignore permission errors when searching for cli.js (#268) - @bl-ue
- Improve user message display (#269) - @bl-ue
- Add support for explicitly setting the native install path (#270) - @signadou
- Load `node-lief` using dynamic `import()` (#272) - @signadou
- Prefer latest bunx cached claude-code version when patching (#282) - @y0usaf
- Support `<<BUILD_TIME>>` in newer CC prompts (#281) - @mike1858
- Show a Piebald announcement (#284) - @bl-ue
- Rework logic to find claude: `TWEAKCC_CC_INSTALLATION_DIR`, `ccInstallationPath`, `claude` from PATH, search dirs, user selection (#285) - @bl-ue
- Brought up to speed with CC 2.0.69 (#286) - @bl-ue
- Add new options to hide the Clawd logo, the whole startup banner, and the `ctrl-g to edit prompt` text (#287) - @bl-ue

## [v3.1.6](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.1.6) - 2025-12-05

- Add bunx cache detection and lazy-load node-lief for NixOS compatibility (#255) - @y0usaf

## [v3.1.5](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.1.5) - 2025-11-30

- Fix `$` variable name replacement in system prompts (#241) - @signadou

## [v3.1.4](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.1.4) - 2025-11-29

- Allow making a toolset the default for plan mode (#238) - @bl-ue

## [v3.1.3](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.1.3) - 2025-11-26

- Add paths for mise npm backend (#234) - @coryzibell
- Emit a Rust-style error when system prompt markdown files contain unescaped backslashes (#226) - @bl-ue & @mike1858

## [v3.1.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.1.2) - 2025-11-23

- Fix toolset patching (#224) - @bl-ue
- Remove the `/cost` patch (#223) - @bl-ue
- Fix `/title` patching for CC 2.0.49+ (#222) - @bl-ue

## [v3.1.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.1.1) - 2025-11-17

- Fix Restore menu item to account for native binary too (#208) - @bl-ue
- Detect the native CC version from the active binary instead of the backup (#207) - @bl-ue
- Use `require` instead of `import` in patches (`import` doesn't work in Bun) (closes #205) (#206) - @bl-ue

## [v3.1.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.1.0) - 2025-11-15

- Show the currently-active toolset next to the "accept edits on"/"plan mode on" banner (#200) - @bl-ue
- Add `/title` and `/rename` slash commands to CC for manual session naming per [CC#2112](https://github.com/anthropics/claude-code/issues/2112) (#199) - @bl-ue

## [v3.0.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.0.2) - 2025-11-13

- Create an example `config.json` if it doesn't exist and cli.js isn't found (#195) - @bl-ue
- Add `/usr/local/{+ share/}nvm` to the list of search paths (#190) - @bl-ue

## [v3.0.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.0.1) - 2025-11-11

- Fix Mach-O segment alignment for ARM64 binaries (#183) - @signadou

## [v3.0.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v3.0.0) - 2025-11-10

- Remove the "CLAUDE CODE" figlet ASCII art customization to keep up with Claude Code (#174) - @bl-ue
- Support slight bun-specific differences in React module accessing, `$` identifier frequency, and unicode escaping (#163) - @bl-ue
- Enable a toolset to be the default toolset (#161) - @bl-ue
- Add a misc view - @bl-ue
- Expand thinking blocks by default (#159) - @bl-ue
- Add indicators to CC's startup UI that tweakcc's patching has been applied (#158) - @bl-ue
- Add /toolset to Claude Code (#157) - @bl-ue
- Makes the Claude Code's native LSP support work (#152) - @bl-ue

## [v2.0.3](https://github.com/Piebald-AI/tweakcc/releases/tag/v2.0.3) - 2025-11-02

- Handle ENOTDIR errors when searching for Claude Code installation (#148) - @bl-ue

## [v2.0.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v2.0.2) - 2025-10-31

- Better error handling when the prompt JSON file doesn't exist yet (#130) - @bl-ue
- Add ~/.linuxbrew to the search dirs (#132) - @bl-ue
- Add fnm multishell path to the search dirs (#139) - @wu-json
- Cache prompt JSON files and fix download error handling (#140) - @bl-ue

## [v2.0.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v2.0.1) - 2025-10-23

- Support `XDG_CONFIG_HOME` per #120 (#121) - @bl-ue
- Add `C:\nvm4w\nodejs` to the cli.js search list per #118 (#119) - @bl-ue

## [v2.0.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v2.0.0) - 2025-10-22

- **New:** Add system prompt customization support

## [v1.6.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.6.0) - 2025-10-11

- Update the builtin themes' colors and IDs to account for all the changes in CC over time (#110) - @bl-ue
- Update the theme preview to match the modern CC UI (#110) - @bl-ue
- Properly incorporate new colors in existing config files (#110) - @bl-ue
- Dynamically fetch Claude subscription and current model for live display in the theme preview (#110) - @bl-ue

## [v1.5.5](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.5.5) - 2025-09-29

- Fix input box border customization for CC 1.0.128 (#105) - @bl-ue
- Fix user message styling for CC 1.0.128 (#105) - @bl-ue
- Add the tweakcc version to `claude --version` and `/status` (#106) - @bl-ue

## [v1.5.4](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.5.4) - 2025-09-18

- Fix input box border customization for CC 1.0.115 (#98) - @bl-ue
- Fix user message styling for CC 1.0.115 (#98) - @bl-ue

## [v1.5.3](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.5.3) - 2025-09-12

- Properly glob directories and show the glob paths to the user in the error message when cli.js can't be found--#93 (#94) - @bl-ue

## [v1.5.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.5.2) - 2025-09-11

- **New:** Make /cost work with Pro/Max subscriptions (See Claude Code issue [#1109](https://github.com/anthropics/claude-code/issues/1109)) (#91) - @bl-ue
- Remove colors and emoji from --apply output (#92) - @bl-ue

## [v1.5.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.5.1) - 2025-09-09

- **New:** Make all the select menus (like the /model and /theme lists) show 25 items by default instead of 5 (#85) - @bl-ue
- Sort the models added to /models in descending order of release date (#84) - @bl-ue
- Speed up patching from 8s+ to <=1s (#86) - @bl-ue
- Simplify the diff shown for the context limit patch in debug mode (#89) - @bl-ue

## [v1.5.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.5.0) - 2025-09-08

- **New:** Add all the Anthropic models to Claude Code's /model command (#82) - @bl-ue
- Restore cli.js permissions before deleting it and recreating it to break link networks (#81) - @bl-ue

## [v1.4.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.4.2) - 2025-09-08

- Delete cli.js before overwriting it to avoid any link networks (#78) - @bl-ue
- Fix the black on black preview in the user message display section (#77) - @bl-ue

## [v1.4.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.4.1) - 2025-09-07

- Fix a bug where resetting the past user message's prefix and content background/foreground would set them both to black, making them unreadable in Claude Code (see https://github.com/Piebald-AI/tweakcc/issues/69#issuecomment-3263942674) (#75) - @bl-ue

## [v1.4.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.4.0) - 2025-09-06

- **New:** Add a feature to remove the border from Claude Code's input box (#72) - @bl-ue
- **New:** User message display customization (#71) - @bl-ue

## [v1.3.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.3.0) - 2025-09-02

- **New:** Add support for customizing the context limit with `CLAUDE_CODE_CONTEXT_LIMIT` (#63) - @bl-ue

## [v1.2.5](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.2.5) - 2025-09-01

- Fix n search path (#60) - @bl-ue

## [v1.2.4](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.2.4) - 2025-08-29

- Add star recommendation to the UI home screen

## [v1.2.3](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.2.3) - 2025-08-28

- **New:** Add a patch to fix the generating spinner freezing when CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set (#54) - @heromantf
- Update the thinking verb patching to work with CC 1.0.96 (#55) - @heromantf

## [v1.2.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.2.2) - 2025-08-26

- Continuation of #43

## [v1.2.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.2.1) - 2025-08-26

- **New:** feat: add welcome message customization to replace 'Claude Code' with custom text (#39) - @patrickjaja
- fix(patching): include $ in matched identifier names (#43) - @bl-ue
- feat(search): support local installation, fix ~/.npm\* paths (#44) - @bl-ue

## [v1.2.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.2.0) - 2025-08-25

- **New:** Bring back the token counter and elapsed time metric (#37) - @bl-ue

## [v1.1.4](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.1.4) - 2025-08-25

- **New:** `--apply` CLI option to apply stored customizations without interactive UI (#33) - @patrickjaja
- Updated patching logic to work with Claude Code 1.0.89 (#34) - @bl-ue

## [v1.1.3](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.1.3) - 2025-08-24

- Fix a bug where the backup.cli.js file would sometimes be incorrectly overwritten (closes #30) - @bl-ue

## [v1.1.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.1.2) - 2025-08-21

- Support thinking phases with multiple characters by editing the container's width in CC
- Stop showing subagent colors to reduce vertical space usage in preview
- Don't show the 'Claude Code was updated ...' message on initial startup

## [v1.1.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.1.1) - 2025-08-21

- **New:** Add `--debug` option to print debugging information
- Updated patching to support CC 1.0.86 (breaks compatibility with .85 and earlier)

## [v1.1.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.1.0) - 2025-08-19

- **New:** Support for new colors (claudeShimmer, ide, and subagent-related ones) (closes #26)
- **New:** Add new verbs from Claude Code ~1.0.83
- **New:** Add paths for common operating systems, package managers, and Node managers
- Fix patching of thinking verbs (closes #21)
- Fix support for thinking verb punctuation and generalize to thinking verb format (closes #23)
- Fix breaking the config file when changing colors (closes #18)
- Clarify tab usage for switching sections (closes #20)

## [v1.0.3](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.0.3) - 2025-08-10

- **New:** Support pasting colors into the picker and theme editor (#14) - @bl-ue
- Works with Claude Code 1.0.72
- Remove hardcoded "white" color
- Upgraded dependencies

## [v1.0.2](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.0.2) - 2025-08-02

- **New:** Homebrew path support for macOS (#11) - @petems
- **New:** NVM search directories - @signadou
- Check for cli.js only once at startup (#9) - @signadou
- Remove support for Haiku-generated words

## [v1.0.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.0.1) - 2025-07-27

- Fix theme duplication bug where Theme.colors wasn't properly cloned (closes #7)
- Fix hue slider max value from 360 to 359 in color picker (closes #8)

## [v1.0.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.0.0) - 2025-07-25

- Initial release with theme customization for Claude Code
