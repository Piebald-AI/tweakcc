#!/usr/bin/env node
import { render } from 'ink';
import { Command } from 'commander';
import App from './App.js';
import { CLIJS_SEARCH_PATHS, CONFIG_FILE } from './utils/types.js';
import { startupCheck, readConfigFile } from './utils/config.js';
import { enableDebug } from './utils/misc.js';
import { applyCustomization } from './utils/patching.js';
import chalk from 'chalk';

const main = async () => {
  const program = new Command();

  program
    .name('tweakcc')
    .description(
      'Command-line tool to customize your Claude Code theme colors, thinking verbs and more.'
    )
    .version('1.1.4')
    .option('-d, --debug', 'enable debug mode')
    .option('-a, --apply', 'apply saved customizations without interactive UI');

  program.parse();

  const options = program.opts();

  if (options.debug) {
    enableDebug();
  }

  // Handle --apply flag for non-interactive mode
  if (options.apply) {
    console.log(
      chalk.cyan('🔧 Applying saved customizations to Claude Code...')
    );

    try {
      // Read the saved configuration
      const config = await readConfigFile();

      if (!config.settings || Object.keys(config.settings).length === 0) {
        console.error(
          chalk.red('❌ No saved customizations found in ' + CONFIG_FILE)
        );
        process.exit(1);
      }

      // Find Claude Code installation
      const startupCheckInfo = await startupCheck();

      if (!startupCheckInfo || !startupCheckInfo.ccInstInfo) {
        console.error(chalk.red(`❌ Cannot find Claude Code's cli.js`));
        console.error(chalk.yellow('Searched at the following locations:'));
        CLIJS_SEARCH_PATHS.forEach(p => console.error(chalk.gray('  - ' + p)));
        process.exit(1);
      }

      console.log(
        chalk.gray(
          `📁 Found Claude Code at: ${startupCheckInfo.ccInstInfo.cliPath}`
        )
      );
      console.log(
        chalk.gray(`📦 Version: ${startupCheckInfo.ccInstInfo.version}`)
      );

      // Note: startupCheck() already creates/updates backup as needed
      console.log(chalk.gray('✓ Backup handled by startup check'));

      // Apply the customizations
      console.log(chalk.cyan('🎨 Applying customizations...'));
      try {
        await applyCustomization(config, startupCheckInfo.ccInstInfo);
        console.log(chalk.green('✅ Customizations applied successfully!'));
        console.log(chalk.gray(`💾 Configuration saved at: ${CONFIG_FILE}`));
      } catch (patchError) {
        console.error(chalk.red('❌ Failed to apply patches:'));
        console.error(
          chalk.red(
            patchError instanceof Error
              ? patchError.message
              : String(patchError)
          )
        );

        // Check if patching errors were non-critical (warnings)
        if (
          patchError instanceof Error &&
          patchError.message.includes('patch:')
        ) {
          console.log(
            chalk.yellow(
              '⚠️  Some patches failed to apply, but the file was updated.'
            )
          );
          console.log(
            chalk.yellow('    This may happen if Claude Code was updated.')
          );
          console.log(
            chalk.gray(
              '    Run tweakcc interactively to review and update your customizations.'
            )
          );
        }
      }

      process.exit(0);
    } catch (error) {
      console.error(chalk.red('❌ Unexpected error:'));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  }

  const startupCheckInfo = await startupCheck();

  if (startupCheckInfo) {
    render(<App startupCheckInfo={startupCheckInfo} />);
  } else {
    console.error(`\x1b[31mCannot find Claude Code's cli.js -- do you have Claude Code installed?

Searched at the following locations:
${CLIJS_SEARCH_PATHS.map(p => '- ' + p).join('\n')}

If you have it installed but it's in a location not listed above, please open an issue at
https://github.com/piebald-ai/tweakcc/issues and tell us where you have it--we'll add that
location to our search list and release an update today!  Or you can specify the path to its
\`cli.js\` file in ${CONFIG_FILE}:

{
  "ccInstallationDir": "${
    process.platform == 'win32'
      ? 'C:\\\\absolute\\\\path\\\\to\\\\node_modules\\\\@anthropic-ai\\\\claude-code'
      : '/absolute/path/to/node_modules/+@anthropic-ai/claude-code'
  }"
}

Notes:
- Don't include cli.js in the path.

- Don't specify the path to your Claude Code executable's directory.  It needs to be the path
  to the folder that contains **cli.js**.
\x1b[0m`);
    process.exit(1);
  }
};

main();
