#!/usr/bin/env node
import { render } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import App from './App.js';
import {
  CLIJS_SEARCH_PATH_INFO,
  CONFIG_FILE,
  CONFIG_DIR,
  PATH_CHECK_TEXT,
} from './utils/types.js';
import {
  startupCheck,
  readConfigFile,
  migrateConfigIfNeeded,
} from './utils/config.js';
import { enableDebug } from './utils/misc.js';
import { applyCustomization } from './utils/patches/index.js';
import { preloadStringsFile } from './utils/promptSync.js';

const createExampleConfigIfMissing = async (
  examplePath: string
): Promise<void> => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    // Only create if config file doesn't exist
    try {
      await fs.stat(CONFIG_FILE);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        const exampleConfig = {
          ccInstallation: examplePath + '/cli.js',
        };
        await fs.writeFile(CONFIG_FILE, JSON.stringify(exampleConfig, null, 2));
      }
    }
  } catch {
    // Silently fail if we can't write the config file
  }
};

const main = async () => {
  const program = new Command();
  program
    .name('tweakcc')
    .description(
      'Command-line tool to customize your Claude Code theme colors, thinking verbs and more.'
    )
    .version('3.1.6')
    .option('-d, --debug', 'enable debug mode')
    .option('-a, --apply', 'apply saved customizations without interactive UI');
  program.parse();
  const options = program.opts();

  if (options.debug) {
    enableDebug();
  }

  // Migrate old ccInstallationDir config to ccInstallation if needed
  const configMigrated = await migrateConfigIfNeeded();

  // Handle --apply flag for non-interactive mode
  if (options.apply) {
    console.log('Applying saved customizations to Claude Code...');
    console.log(`Configuration saved at: ${CONFIG_FILE}`);

    // Read the saved configuration
    const config = await readConfigFile();

    if (!config.settings || Object.keys(config.settings).length === 0) {
      console.error('No saved customizations found in ' + CONFIG_FILE);
      process.exit(1);
    }

    // Find Claude Code installation
    const startupCheckInfo = await startupCheck();

    if (!startupCheckInfo || !startupCheckInfo.ccInstInfo) {
      const examplePath =
        process.platform == 'win32'
          ? 'C:\\absolute\\path\\to\\node_modules\\@anthropic-ai\\claude-code'
          : '/absolute/path/to/node_modules/@anthropic-ai/claude-code';

      await createExampleConfigIfMissing(examplePath);

      console.error(`Cannot find Claude Code's cli.js`);
      console.error('Searched for cli.js at the following locations:');
      CLIJS_SEARCH_PATH_INFO.forEach(info => {
        if (info.isGlob) {
          if (info.expandedPaths.length === 0) {
            console.error(`  - ${info.pattern} (no matches)`);
          } else {
            console.error(`  - ${info.pattern}`);
            info.expandedPaths.forEach(path => {
              console.error(`    - ${path}`);
            });
          }
        } else {
          console.error(`  - ${info.pattern}`);
        }
      });
      if (PATH_CHECK_TEXT) {
        console.error(`\n${PATH_CHECK_TEXT}`);
      }
      process.exit(1);
    }

    if (startupCheckInfo.ccInstInfo.nativeInstallationPath) {
      console.log(
        `Found Claude Code (native installation): ${startupCheckInfo.ccInstInfo.nativeInstallationPath}`
      );
    } else {
      console.log(
        `Found Claude Code at: ${startupCheckInfo.ccInstInfo.cliPath}`
      );
    }
    console.log(`Version: ${startupCheckInfo.ccInstInfo.version}`);

    // Preload strings file for system prompts
    console.log('Loading system prompts...');
    const result = await preloadStringsFile(
      startupCheckInfo.ccInstInfo.version
    );
    if (!result.success) {
      console.log(chalk.red('\n✖ Error downloading system prompts:'));
      console.log(chalk.red(`  ${result.errorMessage}`));
      console.log(
        chalk.yellow(
          '\n⚠ System prompts not available - skipping system prompt customizations'
        )
      );
    }

    // Apply the customizations
    console.log('Applying customizations...');
    await applyCustomization(config, startupCheckInfo.ccInstInfo);
    console.log('Customizations applied successfully!');
    process.exit(0);
  }

  const startupCheckInfo = await startupCheck();

  if (startupCheckInfo) {
    // Preload strings file for system prompts (for interactive mode)
    const result = await preloadStringsFile(
      startupCheckInfo.ccInstInfo.version
    );
    if (!result.success) {
      console.log(chalk.red('\n✖ Error downloading system prompts:'));
      console.log(chalk.red(`  ${result.errorMessage}`));
      console.log(
        chalk.yellow(
          '⚠ System prompts not available - system prompt customizations will be skipped\n'
        )
      );
    }

    render(
      <App
        startupCheckInfo={startupCheckInfo}
        configMigrated={configMigrated}
      />
    );
  } else {
    // Format the search paths to show glob patterns with their expansions
    const formatSearchPaths = () => {
      return CLIJS_SEARCH_PATH_INFO.map(info => {
        if (info.isGlob) {
          if (info.expandedPaths.length === 0) {
            return `- ${info.pattern} (no matches)`;
          } else {
            const result = [`- ${info.pattern}`];
            info.expandedPaths.forEach(path => {
              result.push(`  - ${path}`);
            });
            return result.join('\n');
          }
        } else {
          return `- ${info.pattern}`;
        }
      }).join('\n');
    };

    const examplePath =
      process.platform == 'win32'
        ? 'C:\\absolute\\path\\to\\node_modules\\@anthropic-ai\\claude-code'
        : '/absolute/path/to/node_modules/@anthropic-ai/claude-code';

    await createExampleConfigIfMissing(examplePath);

    console.error(`Cannot find Claude Code's cli.js -- do you have Claude Code installed?

Searched for cli.js at the following locations:
${formatSearchPaths()}

${PATH_CHECK_TEXT ? `${PATH_CHECK_TEXT}\n` : ''}

If you have it installed but it's in a location not listed above, please open an issue at
https://github.com/piebald-ai/tweakcc/issues and tell us where you have it--we'll add that location
to our search list and release an update today!  And in the meantime, you can get tweakcc working
by manually specifying that location in ${CONFIG_FILE} with the "ccInstallation" property:

{
  "ccInstallation": "${examplePath}/cli.js"
}

Notes:
- Include cli.js in the path (the full path to the cli.js file).
- Please also open an issue so that we can add your path to the search list for all users!
`);
    process.exit(1);
  }
};

main();
