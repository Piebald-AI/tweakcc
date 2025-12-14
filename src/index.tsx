#!/usr/bin/env node
import { render } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';

import App from './ui/App.js';
import { CONFIG_FILE, readConfigFile } from './config.js';
import { enableDebug } from './utils.js';
import { applyCustomization } from './patches/index.js';
import { preloadStringsFile } from './systemPromptSync.js';
import { migrateConfigIfNeeded } from './migration.js';
import { completeStartupCheck, startupCheck } from './startup.js';
import {
  formatNotFoundError,
  InstallationDetectionError,
  selectAndSaveInstallation,
} from './installationDetection.js';
import { InstallationPicker } from './ui/components/InstallationPicker.js';
import { InstallationCandidate, StartupCheckInfo } from './types.js';

const main = async () => {
  const program = new Command();
  program
    .name('tweakcc')
    .description(
      'Command-line tool to customize your Claude Code theme colors, thinking verbs and more.'
    )
    .version('3.2.0')
    .option('-d, --debug', 'enable debug mode')
    .option('-a, --apply', 'apply saved customizations without interactive UI');
  program.parse();
  const options = program.opts();

  if (options.debug) {
    enableDebug();
  }

  // Migrate old ccInstallationDir config to ccInstallationPath if needed
  const configMigrated = await migrateConfigIfNeeded();

  // Handle --apply flag for non-interactive mode
  if (options.apply) {
    await handleApplyMode();
    return;
  }

  // Interactive mode
  await handleInteractiveMode(configMigrated);
};

/**
 * Handles the --apply flag for non-interactive mode.
 * All errors in detection will throw with detailed messages.
 */
async function handleApplyMode(): Promise<void> {
  console.log('Applying saved customizations to Claude Code...');
  console.log(`Configuration saved at: ${CONFIG_FILE}`);

  // Read the saved configuration
  const config = await readConfigFile();

  if (!config.settings || Object.keys(config.settings).length === 0) {
    console.error('No saved customizations found in ' + CONFIG_FILE);
    process.exit(1);
  }

  try {
    // Find Claude Code installation (non-interactive mode throws on ambiguity)
    const result = await startupCheck({ interactive: false });

    if (!result.startupCheckInfo || !result.startupCheckInfo.ccInstInfo) {
      // This shouldn't happen in non-interactive mode (should throw instead),
      // but handle it just in case
      console.error(formatNotFoundError());
      process.exit(1);
    }

    const { ccInstInfo } = result.startupCheckInfo;

    if (ccInstInfo.nativeInstallationPath) {
      console.log(
        `Found Claude Code (native installation): ${ccInstInfo.nativeInstallationPath}`
      );
    } else {
      console.log(`Found Claude Code at: ${ccInstInfo.cliPath}`);
    }
    console.log(`Version: ${ccInstInfo.version}`);

    // Preload strings file for system prompts
    console.log('Loading system prompts...');
    const preloadResult = await preloadStringsFile(ccInstInfo.version);
    if (!preloadResult.success) {
      console.log(chalk.red('\n✖ Error downloading system prompts:'));
      console.log(chalk.red(`  ${preloadResult.errorMessage}`));
      console.log(
        chalk.yellow(
          '\n⚠ System prompts not available - skipping system prompt customizations'
        )
      );
    }

    // Apply the customizations
    console.log('Applying customizations...');
    await applyCustomization(config, ccInstInfo);
    console.log('Customizations applied successfully!');
    process.exit(0);
  } catch (error) {
    if (error instanceof InstallationDetectionError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Handles interactive mode with the full UI.
 */
async function handleInteractiveMode(configMigrated: boolean): Promise<void> {
  try {
    const result = await startupCheck({ interactive: true });

    // Check if we need user to select from multiple candidates
    if (result.pendingCandidates) {
      await handleInstallationSelection(
        result.pendingCandidates,
        configMigrated
      );
      return;
    }

    // Check if we found an installation
    if (!result.startupCheckInfo) {
      console.error(chalk.red(formatNotFoundError()));
      process.exit(1);
    }

    // We have a valid installation, start the app
    await startApp(result.startupCheckInfo, configMigrated);
  } catch (error) {
    if (error instanceof InstallationDetectionError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Handles the case where multiple installations are found and user needs to select one.
 */
async function handleInstallationSelection(
  candidates: InstallationCandidate[],
  configMigrated: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSelect = async (candidate: InstallationCandidate) => {
      try {
        // Save the selection and get the installation info
        const ccInstInfo = await selectAndSaveInstallation(candidate);

        // Complete the startup check with the selected installation
        const config = await readConfigFile();
        const startupCheckInfo = await completeStartupCheck(config, ccInstInfo);

        if (!startupCheckInfo) {
          console.error(
            chalk.red(
              'Error: Failed to complete startup check after selection.'
            )
          );
          process.exit(1);
        }

        // Clear the picker and start the main app
        // We need to unmount the picker first
        pickerInstance.unmount();

        await startApp(startupCheckInfo, configMigrated);
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    const pickerInstance = render(
      <InstallationPicker candidates={candidates} onSelect={handleSelect} />
    );
  });
}

/**
 * Starts the main app with the given startup info.
 */
async function startApp(
  startupCheckInfo: StartupCheckInfo,
  configMigrated: boolean
): Promise<void> {
  // Preload strings file for system prompts (for interactive mode)
  const result = await preloadStringsFile(startupCheckInfo.ccInstInfo.version);
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
    <App startupCheckInfo={startupCheckInfo} configMigrated={configMigrated} />
  );
}

main();
