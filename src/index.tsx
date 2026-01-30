#!/usr/bin/env node
import { render } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';

import App from './ui/App';
import { CONFIG_FILE, readConfigFile, updateConfigFile } from './config';
import {
  enableDebug,
  enableVerbose,
  enableShowUnchanged,
  isShowUnchanged,
} from './utils';
import { applyCustomization, PatchResult, PatchGroup } from './patches/index';
import { preloadStringsFile } from './systemPromptSync';
import { migrateConfigIfNeeded } from './migration';
import { completeStartupCheck, startupCheck } from './startup';
import {
  formatNotFoundError,
  InstallationDetectionError,
  selectAndSaveInstallation,
} from './installationDetection';
import { InstallationPicker } from './ui/components/InstallationPicker';
import { InstallationCandidate, StartupCheckInfo } from './types';
import {
  restoreClijsFromBackup,
  restoreNativeBinaryFromBackup,
} from './installationBackup';
import { clearAllAppliedHashes } from './systemPromptHashIndex';

// =============================================================================
// Invocation Command Detection
// =============================================================================

/**
 * Detects how the user invoked tweakcc to show the correct --apply command.
 * Handles: tweakcc, npx tweakcc, pnpm dlx tweakcc, yarn dlx tweakcc, etc.
 */
function getInvocationCommand(): string {
  const args = process.argv;

  // args[0] is the node executable, args[1] is the script path
  // For npx/pnpm/yarn, the script path often contains clues
  const scriptPath = args[1] || '';

  // Check for package manager dlx/npx patterns in the path
  if (scriptPath.includes('npx') || scriptPath.includes('.npm/_npx')) {
    return 'npx tweakcc';
  }
  if (scriptPath.includes('pnpm') || scriptPath.includes('.pnpm')) {
    return 'pnpm dlx tweakcc';
  }
  if (scriptPath.includes('yarn')) {
    return 'yarn dlx tweakcc';
  }
  if (scriptPath.includes('bun')) {
    return 'bunx tweakcc';
  }

  // Default to just 'tweakcc' (globally installed or via PATH)
  return 'tweakcc';
}

// =============================================================================
// Patch Results Display
// =============================================================================

/**
 * Prints patch results to console, organized by group.
 * Respects --show-unchanged flag for filtering.
 */
function printPatchResults(results: PatchResult[]): void {
  // Define group order for display
  const groupOrder = [
    PatchGroup.SYSTEM_PROMPTS,
    PatchGroup.ALWAYS_APPLIED,
    PatchGroup.MISC_CONFIGURABLE,
    PatchGroup.NEW_FEATURES,
  ];

  // Group results by PatchGroup
  const byGroup = new Map<PatchGroup, PatchResult[]>();
  for (const group of groupOrder) {
    byGroup.set(group, []);
  }
  for (const result of results) {
    const groupResults = byGroup.get(result.group);
    if (groupResults) {
      groupResults.push(result);
    }
  }

  console.log(
    '\nPatches applied (run with --show-unchanged to show all patches):'
  );

  for (const group of groupOrder) {
    const groupResults = byGroup.get(group)!;

    // Filter based on --show-unchanged (but always show applied and failed)
    const filtered = groupResults.filter(
      r => r.applied || r.failed || isShowUnchanged()
    );
    if (filtered.length === 0) continue;

    console.log(`\n  ${chalk.bold(group)}:`);

    for (const result of filtered) {
      const status = result.failed
        ? chalk.red('✗')
        : result.applied
          ? chalk.green('✓')
          : chalk.dim('○');
      const details = result.details ? `: ${result.details}` : '';
      // Show description in gray on the same line for applied patches only
      const description =
        result.applied && result.description
          ? ` ${chalk.gray('—')} ${chalk.gray(result.description)}`
          : '';
      console.log(`    ${status} ${result.name}${details}${description}`);
    }
  }

  console.log('');
}

const main = async () => {
  const program = new Command();
  program
    .name('tweakcc')
    .description(
      'Command-line tool to customize your Claude Code theme colors, thinking verbs and more.'
    )
    .version('3.4.0')
    .option('-d, --debug', 'enable debug mode')
    .option('-v, --verbose', 'enable verbose debug mode (includes diffs)')
    .option('--show-unchanged', 'show unchanged diffs (requires --verbose)')
    .option('-a, --apply', 'apply saved customizations without interactive UI')
    .option('--restore', 'restore Claude Code to its original state')
    .option(
      '--revert',
      'restore Claude Code to its original state (alias for --restore)'
    );
  program.parse();
  const options = program.opts();

  if (options.verbose) {
    enableVerbose();
  } else if (options.debug) {
    enableDebug();
  }

  if (options.showUnchanged) {
    enableShowUnchanged();
  }

  // Migrate old ccInstallationDir config to ccInstallationPath if needed
  const configMigrated = await migrateConfigIfNeeded();

  // Check for conflicting flags
  if (options.apply && (options.restore || options.revert)) {
    console.error(
      chalk.red('Error: Cannot use --apply and --restore/--revert together.')
    );
    process.exit(1);
  }

  // Handle --apply flag for non-interactive mode
  if (options.apply) {
    await handleApplyMode();
    return;
  }

  // Handle --restore or --revert flags for non-interactive mode
  if (options.restore || options.revert) {
    await handleRestoreMode();
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
    const { results } = await applyCustomization(config, ccInstInfo);

    // Print patch results
    printPatchResults(results);

    console.log(chalk.green('Customizations applied successfully!'));
    console.log(
      chalk.gray(
        'Run with --restore/--revert to revert Claude Code to its original state.'
      )
    );
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
 * Handles the --restore/--revert flags for non-interactive mode.
 * Restores Claude Code to its original state by reverting from backup.
 */
async function handleRestoreMode(): Promise<void> {
  console.log('Restoring Claude Code to its original state...');

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

    // Restore from backup based on installation type
    console.log('Restoring from backup...');
    let restored: boolean;
    if (ccInstInfo.nativeInstallationPath) {
      restored = await restoreNativeBinaryFromBackup(ccInstInfo);
    } else {
      restored = await restoreClijsFromBackup(ccInstInfo);
    }

    if (!restored) {
      console.error(
        chalk.red('No backup found. Cannot restore original Claude Code.')
      );
      console.error(
        chalk.yellow(
          'Tip: A backup is created automatically when you first apply customizations.'
        )
      );
      process.exit(1);
    }

    // Clear all applied hashes since we're restoring to defaults
    await clearAllAppliedHashes();

    // Update config to mark changes as not applied
    await updateConfigFile(config => {
      config.changesApplied = false;
    });

    console.log(chalk.blue('Original Claude Code restored successfully!'));
    console.log(
      chalk.gray(
        `Your customizations are still saved in ${CONFIG_FILE} and can be reapplied with --apply.`
      )
    );
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

  const invocationCommand = getInvocationCommand();

  render(
    <App
      startupCheckInfo={startupCheckInfo}
      configMigrated={configMigrated}
      invocationCommand={invocationCommand}
    />
  );
}

main();
