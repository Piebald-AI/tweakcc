#!/usr/bin/env node
import { render } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';

import App from './ui/App';
import {
  CONFIG_FILE,
  readConfigFile,
  updateConfigFile,
  fetchConfigFromUrl,
} from './config';
import {
  enableDebug,
  enableVerbose,
  enableShowUnchanged,
  isShowUnchanged,
} from './utils';
import {
  applyCustomization,
  PatchResult,
  PatchGroup,
  getAllPatchDefinitions,
} from './patches/index';
import {
  preloadStringsFile,
  getSystemPromptDefinitions,
} from './systemPromptSync';
import { migrateConfigIfNeeded } from './migration';
import { completeStartupCheck, startupCheck } from './startup';
import {
  formatNotFoundError,
  InstallationDetectionError,
  selectAndSaveInstallation,
} from './installationDetection';
import { InstallationPicker } from './ui/components/InstallationPicker';
import {
  InstallationCandidate,
  StartupCheckInfo,
  TweakccConfig,
} from './types';
import { handleUnpack, handleRepack, handleAdhocPatch } from './commands';
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
 * @param results - The patch results to display
 * @param patchFilter - Optional list of explicitly requested patch IDs (always shown even if skipped)
 */
function printPatchResults(
  results: PatchResult[],
  patchFilter?: string[] | null
): void {
  // Define group order for display
  const groupOrder = [
    PatchGroup.SYSTEM_PROMPTS,
    PatchGroup.ALWAYS_APPLIED,
    PatchGroup.MISC_CONFIGURABLE,
    PatchGroup.FEATURES,
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

    // Filter based on --show-unchanged (but always show applied, failed, or explicitly requested)
    const filtered = groupResults.filter(
      r =>
        r.applied ||
        r.failed ||
        isShowUnchanged() ||
        (patchFilter && patchFilter.includes(r.id))
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
    .version('4.0.1')
    .option('-d, --debug', 'enable debug mode')
    .option('-v, --verbose', 'enable verbose debug mode (includes diffs)')
    .option('--show-unchanged', 'show unchanged diffs (requires --verbose)')
    .option('-a, --apply', 'apply saved customizations without interactive UI')
    .option('--restore', 'restore Claude Code to its original state')
    .option(
      '--revert',
      'restore Claude Code to its original state (alias for --restore)'
    )
    .option(
      '--patches <ids>',
      'comma-separated list of patch IDs to apply (use with --apply)'
    )
    .option('--list-patches', 'list all available patches with their IDs')
    .option(
      '--list-system-prompts [version]',
      'list all available system prompts for a CC version'
    )
    .option(
      '--config-url <url>',
      'fetch configuration from a URL instead of local config.json'
    )
    .action(async () => {
      // This action handles the default case (no subcommand).
      // All the --flag handling lives here so that Commander's subcommand
      // support doesn't swallow the no-args invocation.
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
          chalk.red(
            'Error: Cannot use --apply and --restore/--revert together.'
          )
        );
        process.exit(1);
      }

      // Handle --list-patches flag
      if (options.listPatches) {
        handleListPatches();
        return;
      }

      // Handle --list-system-prompts flag
      if (options.listSystemPrompts !== undefined) {
        await handleListSystemPrompts(
          options.listSystemPrompts as string | true
        );
        return;
      }

      // Handle --apply flag for non-interactive mode
      if (options.apply) {
        // Parse patch filter if provided
        const patchFilter = options.patches
          ? (options.patches as string)
              .split(',')
              .map((id: string) => id.trim())
          : null;
        await handleApplyMode(patchFilter, options.configUrl);
        return;
      }

      // --config-url is only valid with --apply
      if (options.configUrl) {
        console.error(
          chalk.red('Error: --config-url can only be used with --apply.')
        );
        console.error(
          chalk.gray(
            'The interactive TUI is for editing local configuration only.'
          )
        );
        console.error(chalk.gray('To apply a remote config, use:'));
        console.error(
          chalk.gray(`  ${getInvocationCommand()} --apply --config-url <url>`)
        );
        process.exit(1);
      }

      // Handle --restore or --revert flags for non-interactive mode
      if (options.restore || options.revert) {
        await handleRestoreMode();
        return;
      }

      // Interactive mode
      await handleInteractiveMode(configMigrated);
    });

  // =========================================================================
  // Subcommands
  // =========================================================================

  program
    .command('unpack')
    .argument('<output-js-path>', 'path to write extracted JS')
    .argument('[binary-path]', 'path to native binary (default: auto-detect)')
    .description('Extract JS from a native Claude Code binary')
    .action(async (outputJsPath: string, binaryPath?: string) => {
      await handleUnpack(outputJsPath, binaryPath);
      process.exit(0);
    });

  program
    .command('repack')
    .argument('<input-js-path>', 'path to JS file to embed')
    .argument('[binary-path]', 'path to native binary (default: auto-detect)')
    .description('Embed JS into a native Claude Code binary')
    .action(async (inputJsPath: string, binaryPath?: string) => {
      await handleRepack(inputJsPath, binaryPath);
      process.exit(0);
    });

  program
    .command('adhoc-patch')
    .description('Apply an ad-hoc patch to Claude Code')
    .option(
      '-s, --string <values...>',
      'replace string: <old-string> <new-string>'
    )
    .option('-r, --regex <values...>', 'replace regex: <pattern> <replacement>')
    .option(
      '--script <script>',
      'run a patch script (prefix with @ for file/URL)'
    )
    .option(
      '-i, --index <number>',
      'replace only the Nth occurrence (1-based)',
      parseInt
    )
    .option(
      '-p, --path <path>',
      'path to cli.js or native binary (default: auto-detect)'
    )
    .option(
      '--confirm-possible-dangerous-patch',
      'skip diff preview and apply immediately'
    )
    .option(
      '--dangerous-no-script-sandbox',
      'run --script without the Node.js permission sandbox (use if Node < 20)'
    )
    .action(
      async (options: {
        string?: string[];
        regex?: string[];
        script?: string;
        index?: number;
        path?: string;
        confirmPossibleDangerousPatch?: boolean;
        dangerousNoScriptSandbox?: boolean;
      }) => {
        await handleAdhocPatch(options);
        process.exit(0);
      }
    );

  program.parse();
};

/**
 * Handles the --apply flag for non-interactive mode.
 * All errors in detection will throw with detailed messages.
 * @param patchFilter - Optional list of patch IDs to apply (if null, apply all)
 * @param configUrl - Optional URL to fetch configuration from
 */
async function handleApplyMode(
  patchFilter: string[] | null,
  configUrl?: string
): Promise<void> {
  console.log('Applying saved customizations to Claude Code...');

  // Read the configuration (from URL or local file)
  let config;
  if (configUrl) {
    console.log(`Fetching configuration from: ${configUrl}`);
    try {
      config = await fetchConfigFromUrl(configUrl);
      console.log('Configuration fetched successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${message}`));
      process.exit(1);
    }
  } else {
    console.log(`Configuration saved at: ${CONFIG_FILE}`);
    config = await readConfigFile();
  }

  if (!config.settings || Object.keys(config.settings).length === 0) {
    const source = configUrl ? configUrl : CONFIG_FILE;
    console.error('No saved customizations found in ' + source);
    process.exit(1);
  }

  try {
    // Find Claude Code installation (non-interactive mode throws on ambiguity)
    const result = await startupCheck({ interactive: false }, config);

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
    const { results } = await applyCustomization(
      config,
      ccInstInfo,
      patchFilter
    );

    // Print patch results
    printPatchResults(results, patchFilter);

    // Check if any patches failed
    const hasFailures = results.some(r => r.failed);
    const hasSystemPromptChanges = results.some(
      r => r.group === PatchGroup.SYSTEM_PROMPTS && r.applied
    );

    if (hasFailures) {
      console.log(chalk.yellow('Customizations applied with some failures.'));
      console.log(
        chalk.dim(
          'These patching errors do not affect your system prompt patches.'
        )
      );
      if (hasSystemPromptChanges) {
        console.log(
          chalk.dim(
            'Your system prompt customizations were still applied successfully.'
          )
        );
      }
      console.log(
        chalk.dim(
          'Please open an issue on https://github.com/Piebald-AI/tweakcc/issues/new reporting these patching errors.'
        )
      );
    } else {
      console.log(chalk.green('Customizations applied successfully!'));
    }
    console.log(
      chalk.dim(
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
 * Handles the --list-patches flag.
 * Lists all available patches with their IDs, names, and descriptions.
 */
function handleListPatches(): void {
  const patches = getAllPatchDefinitions();

  // Define group order for display
  const groupOrder = [
    PatchGroup.ALWAYS_APPLIED,
    PatchGroup.MISC_CONFIGURABLE,
    PatchGroup.FEATURES,
  ];

  // Group patches by PatchGroup
  const byGroup = new Map<PatchGroup, typeof patches>();
  for (const group of groupOrder) {
    byGroup.set(group, []);
  }
  for (const patch of patches) {
    const groupPatches = byGroup.get(patch.group);
    if (groupPatches) {
      groupPatches.push(patch);
    }
  }

  console.log(
    chalk.gray(
      'Use --patches <ids> with --apply to apply specific patches, e.g.:'
    )
  );
  console.log();
  console.log(chalk.gray('  tweakcc --apply --patches "themes,toolsets"'));
  console.log();
  console.log(chalk.blue.bold('Available patches'));
  console.log();

  for (const group of groupOrder) {
    const groupPatches = byGroup.get(group)!;
    if (groupPatches.length === 0) continue;

    console.log(chalk.bold(group) + ':');

    for (const patch of groupPatches) {
      console.log(`  ${chalk.cyan(patch.id)}`);
      console.log(
        `    ${chalk.white(patch.name)} ${chalk.gray('—')} ${chalk.gray(patch.description)}`
      );
    }
    console.log('');
  }

  console.log(chalk.bold('System Prompts:'));
  console.log(
    chalk.dim(
      '  System prompts also have IDs that can be used with --patches.  Use --list-system-prompts [version] to see them.'
    )
  );
}

/**
 * Handles the --list-system-prompts flag.
 * Lists all available system prompts for a given CC version.
 * @param versionArg - Optional CC version to use (defaults to detecting installed version)
 */
async function handleListSystemPrompts(
  versionArg: string | true
): Promise<void> {
  let version: string;

  if (typeof versionArg === 'string') {
    // User provided a specific version
    version = versionArg;
  } else {
    // Try to detect the installed CC version
    console.log('Detecting installed Claude Code version...');
    try {
      const result = await startupCheck({ interactive: false });
      if (!result.startupCheckInfo?.ccInstInfo?.version) {
        console.error(
          chalk.red(
            'Could not detect Claude Code version. Please specify a version:'
          )
        );
        console.error(chalk.gray('  tweakcc --list-system-prompts 1.0.20'));
        process.exit(1);
      }
      version = result.startupCheckInfo.ccInstInfo.version;
    } catch {
      console.error(
        chalk.red(
          'Could not detect Claude Code installation. Please specify a version:'
        )
      );
      console.error(chalk.gray('  tweakcc --list-system-prompts 1.0.20'));
      process.exit(1);
    }
  }

  console.log(`Loading system prompts for CC version ${version}...`);

  const preloadResult = await preloadStringsFile(version);
  if (!preloadResult.success) {
    console.error(chalk.red(`\n✖ Error loading system prompts:`));
    console.error(chalk.red(`  ${preloadResult.errorMessage}`));
    process.exit(1);
  }

  const prompts = getSystemPromptDefinitions();
  if (!prompts || prompts.length === 0) {
    console.error(chalk.yellow('No system prompts found for this version.'));
    process.exit(1);
  }

  // Group prompts by the prefix before the colon in the name
  // e.g., "Tool Parameter: Computer action" -> group is "Tool Parameters"
  const getGroupName = (name: string): string => {
    const colonIndex = name.indexOf(':');
    if (colonIndex === -1) return 'Other';
    const group = name.substring(0, colonIndex).trim();
    // Pluralize group names (except "Data" which is already plural-ish)
    if (group === 'Data') return group;
    return group + 's';
  };

  // Group prompts
  const byGroup = new Map<string, typeof prompts>();
  for (const prompt of prompts) {
    const group = getGroupName(prompt.name);
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
    }
    byGroup.get(group)!.push(prompt);
  }

  // Sort groups alphabetically, and sort prompts within each group by name
  const sortedGroups = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));

  console.log(
    chalk.gray(
      'Use --patches <ids> with --apply to apply specific prompts, e.g.:'
    )
  );
  console.log();
  console.log(chalk.gray('  tweakcc --apply --patches "identity,environment"'));
  console.log();
  console.log(chalk.blue.bold(`System prompts for CC ${version}`));
  console.log();

  for (const group of sortedGroups) {
    const groupPrompts = byGroup.get(group)!;
    // Sort prompts within group by name
    groupPrompts.sort((a, b) => a.name.localeCompare(b.name));

    console.log(chalk.bold(group) + ':');

    for (const prompt of groupPrompts) {
      console.log(`  ${chalk.cyan(prompt.id)}`);
      console.log(
        `    ${chalk.white(prompt.name)} ${chalk.gray('—')} ${chalk.gray(prompt.description)}`
      );
    }
    console.log('');
  }
  console.log(
    chalk.yellow(
      'To see all original system prompts for a given Claude Code version, visit:'
    )
  );
  console.log(
    chalk.yellow.bold(
      '  https://github.com/Piebald-AI/claude-code-system-prompts'
    )
  );
}

/**
 * Handles interactive mode with the full UI.
 * The TUI is for editing local configuration only - remote config URLs are
 * only supported with --apply mode.
 *
 * @param configMigrated - Whether the config was migrated
 */
async function handleInteractiveMode(configMigrated: boolean): Promise<void> {
  try {
    const result = await startupCheck({ interactive: true });

    if (result.pendingCandidates) {
      await handleInstallationSelection(
        result.pendingCandidates,
        configMigrated
      );
      return;
    }

    if (!result.startupCheckInfo) {
      console.error(chalk.red(formatNotFoundError()));
      process.exit(1);
    }

    await startApp(result.startupCheckInfo, configMigrated, result.config);
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
 *
 * @param candidates - List of installation candidates
 * @param configMigrated - Whether the config was migrated
 */
async function handleInstallationSelection(
  candidates: InstallationCandidate[],
  configMigrated: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSelect = async (candidate: InstallationCandidate) => {
      try {
        const ccInstInfo = await selectAndSaveInstallation(candidate);

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

        pickerInstance.unmount();

        await startApp(startupCheckInfo, configMigrated, config);
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

async function startApp(
  startupCheckInfo: StartupCheckInfo,
  configMigrated: boolean,
  initialConfig: TweakccConfig
): Promise<void> {
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
      initialConfig={initialConfig}
    />
  );
}

main();
