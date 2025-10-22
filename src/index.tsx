#!/usr/bin/env node
import { render } from 'ink';
import { Command } from 'commander';
import App from './App.js';
import { CLIJS_SEARCH_PATH_INFO, CONFIG_FILE } from './utils/types.js';
import { startupCheck, readConfigFile } from './utils/config.js';
import { enableDebug } from './utils/misc.js';
import { applyCustomization } from './utils/patches/index.js';

const main = async () => {
  const program = new Command();
  program
    .name('tweakcc')
    .description(
      'Command-line tool to customize your Claude Code theme colors, thinking verbs and more.'
    )
    .version('1.6.0')
    .option('-d, --debug', 'enable debug mode')
    .option('-a, --apply', 'apply saved customizations without interactive UI');
  program.parse();
  const options = program.opts();

  if (options.debug) {
    enableDebug();
  }

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
      console.error(`Cannot find Claude Code's cli.js`);
      console.error('Searched at the following locations:');
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
      process.exit(1);
    }

    console.log(`Found Claude Code at: ${startupCheckInfo.ccInstInfo.cliPath}`);
    console.log(`Version: ${startupCheckInfo.ccInstInfo.version}`);

    // Apply the customizations
    console.log('Applying customizations...');
    await applyCustomization(config, startupCheckInfo.ccInstInfo);
    console.log('Customizations applied successfully!');
    process.exit(0);
  }

  const startupCheckInfo = await startupCheck();

  if (startupCheckInfo) {
    render(<App startupCheckInfo={startupCheckInfo} />);
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

    console.error(`Cannot find Claude Code's cli.js -- do you have Claude Code installed?

Searched at the following locations:
${formatSearchPaths()}

If you have it installed but it's in a location not listed above, please open an issue at
https://github.com/piebald-ai/tweakcc/issues and tell us where you have it--we'll add that location
to our search list and release an update today!  And in the meantime, you can get tweakcc working
by manually specifying that location in ${CONFIG_FILE} with the "ccInstallationDir" property:

{
  "ccInstallationDir": "${
    process.platform == 'win32'
      ? 'C:\\\\absolute\\\\path\\\\to\\\\node_modules\\\\@anthropic-ai\\\\claude-code'
      : '/absolute/path/to/node_modules/@anthropic-ai/claude-code'
  }"
}

Notes:
- Don't include cli.js in the path.
- Don't specify the path to your Claude Code executable's directory.  It needs to be the path
  to the folder that contains **cli.js**.
- Please also open an issue so that we can add your path to the search list for all users!
`);
    process.exit(1);
  }
};

main();
