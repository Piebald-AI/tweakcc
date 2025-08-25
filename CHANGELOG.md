# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- **New:** Homebrew path support for macOS (#11) - @Peter Souter
- **New:** NVM search directories - @signadou
- Check for cli.js only once at startup (#9) - @signadou
- Remove support for Haiku-generated words

## [v1.0.1](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.0.1) - 2025-07-27

- Fix theme duplication bug where Theme.colors wasn't properly cloned (closes #7)
- Fix hue slider max value from 360 to 359 in color picker (closes #8)

## [v1.0.0](https://github.com/Piebald-AI/tweakcc/releases/tag/v1.0.0) - 2025-07-25

- Initial release with theme customization for Claude Code
