import { Box, Text, useInput } from 'ink';
import { useContext, useState, useMemo } from 'react';
import { SettingsContext } from '../App';
import Header from './Header';
import { TableFormat } from '../../types';

interface MiscViewProps {
  onSubmit: () => void;
}

interface MiscItem {
  id: string;
  title: string;
  description: string;
  getValue: () => boolean | string | number | null;
  toggle: () => void;
  // For numeric items that support increment/decrement
  increment?: () => void;
  decrement?: () => void;
  getDisplayValue?: () => string;
}

const ITEMS_PER_PAGE = 4;

// MCP batch size constraints
const MCP_BATCH_SIZE_MIN = 1;
const MCP_BATCH_SIZE_MAX = 20;
const MCP_BATCH_SIZE_DEFAULT = 3;

// Token count rounding options (null = off, then these values)
const TOKEN_ROUNDING_OPTIONS: (number | null)[] = [
  null,
  1,
  5,
  10,
  25,
  50,
  100,
  200,
  250,
  500,
  1000,
];

// Statusline throttle constraints
const STATUSLINE_THROTTLE_MIN = 0;
const STATUSLINE_THROTTLE_MAX = 1000;
const STATUSLINE_THROTTLE_DEFAULT = 300;
const STATUSLINE_THROTTLE_STEP = 50;

export function MiscView({ onSubmit }: MiscViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSudoWarning, setShowSudoWarning] = useState(false);

  const defaultMisc = {
    showTweakccVersion: true,
    showPatchesApplied: true,
    expandThinkingBlocks: true,
    enableConversationTitle: true,
    hideStartupBanner: false,
    hideCtrlGToEdit: false,
    hideStartupClawd: false,
    increaseFileReadLimit: false,
    suppressLineNumbers: false,
    suppressRateLimitOptions: false,
    mcpConnectionNonBlocking: true,
    mcpServerBatchSize: null as number | null,
    statuslineThrottleMs: null as number | null,
    statuslineUseFixedInterval: false,
    tableFormat: 'default' as TableFormat,
    enableSwarmMode: true,
    enableSessionMemory: true,
    enableRememberSkill: false,
    tokenCountRounding: null as number | null,
    autoAcceptPlanMode: false,
    removeNewSessionShortcut: false,
    allowBypassPermissionsInSudo: false,
    suppressNativeInstallerWarning: false,
  };

  const ensureMisc = () => {
    if (!settings.misc) {
      settings.misc = { ...defaultMisc };
    }
  };

  // Helper to cycle through table format options
  const cycleTableFormat = (current: TableFormat): TableFormat => {
    const formats: TableFormat[] = [
      'default',
      'ascii',
      'clean',
      'clean-top-bottom',
    ];
    const currentIndex = formats.indexOf(current);
    return formats[(currentIndex + 1) % formats.length];
  };

  const getTableFormatDisplay = (format: TableFormat): string => {
    switch (format) {
      case 'ascii':
        return 'ASCII (| and -)';
      case 'clean':
        return 'Clean (no row separators)';
      case 'clean-top-bottom':
        return 'Clean with top/bottom';
      case 'default':
      default:
        return 'Default (box-drawing)';
    }
  };

  const getMcpBatchSizeDisplay = (size: number | null): string => {
    if (size === null) return `Default (${MCP_BATCH_SIZE_DEFAULT})`;
    if (size <= 3) return `${size} (conservative)`;
    if (size <= 8) return `${size} (recommended)`;
    return `${size} (aggressive)`;
  };

  const getStatusLineThrottleDisplay = (ms: number | null): string => {
    if (ms === null) return 'Disabled';
    if (ms === 0) return '0ms (instant)';
    return `${ms}ms`;
  };

  const getTokenRoundingDisplay = (value: number | null): string => {
    if (value === null) return 'Off (exact counts)';
    return `Round to ${value}`;
  };

  // Helper to cycle through token rounding options
  const cycleTokenRounding = (
    current: number | null,
    direction: 'next' | 'prev'
  ): number | null => {
    const currentIndex = TOKEN_ROUNDING_OPTIONS.indexOf(current);
    if (currentIndex === -1) return TOKEN_ROUNDING_OPTIONS[0]; // Reset to first if not found

    let newIndex: number;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % TOKEN_ROUNDING_OPTIONS.length;
    } else {
      newIndex =
        (currentIndex - 1 + TOKEN_ROUNDING_OPTIONS.length) %
        TOKEN_ROUNDING_OPTIONS.length;
    }
    return TOKEN_ROUNDING_OPTIONS[newIndex];
  };

  const items: MiscItem[] = useMemo(
    () => [
      {
        id: 'removeBorder',
        title: 'Remove input box border',
        description:
          'Removes the rounded border around the input box for a cleaner look.',
        getValue: () => settings.inputBox?.removeBorder ?? false,
        toggle: () => {
          updateSettings(settings => {
            if (!settings.inputBox) {
              settings.inputBox = { removeBorder: false };
            }
            settings.inputBox.removeBorder = !settings.inputBox.removeBorder;
          });
        },
      },
      {
        id: 'showVersion',
        title: 'Show tweakcc version at startup',
        description:
          'Shows the blue "+ tweakcc v<VERSION>" message when starting Claude Code.',
        getValue: () => settings.misc?.showTweakccVersion ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.showTweakccVersion =
              !settings.misc!.showTweakccVersion;
          });
        },
      },
      {
        id: 'showPatches',
        title: 'Show patches applied indicator at startup',
        description:
          'Shows the green "tweakcc patches are applied" indicator when starting Claude Code.',
        getValue: () => settings.misc?.showPatchesApplied ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.showPatchesApplied =
              !settings.misc!.showPatchesApplied;
          });
        },
      },
      {
        id: 'expandThinking',
        title: 'Expand thinking blocks',
        description:
          'Makes thinking blocks always expanded by default instead of collapsed.',
        getValue: () => settings.misc?.expandThinkingBlocks ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.expandThinkingBlocks =
              !settings.misc!.expandThinkingBlocks;
          });
        },
      },
      {
        id: 'conversationTitle',
        title: 'Allow renaming sessions via /title',
        description:
          'Enables /title and /rename commands for manually naming conversations.',
        getValue: () => settings.misc?.enableConversationTitle ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.enableConversationTitle =
              !settings.misc!.enableConversationTitle;
          });
        },
      },
      {
        id: 'hideStartupBanner',
        title: 'Hide startup banner',
        description:
          'Hides the startup banner message displayed before first prompt.',
        getValue: () => settings.misc?.hideStartupBanner ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.hideStartupBanner =
              !settings.misc!.hideStartupBanner;
          });
        },
      },
      {
        id: 'hideCtrlG',
        title: 'Hide ctrl-g to edit prompt hint',
        description:
          'Hides the "ctrl-g to edit prompt" hint shown during streaming.',
        getValue: () => settings.misc?.hideCtrlGToEdit ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.hideCtrlGToEdit = !settings.misc!.hideCtrlGToEdit;
          });
        },
      },
      {
        id: 'hideClawd',
        title: 'Hide startup Clawd ASCII art',
        description: 'Hides the Clawd ASCII art character shown at startup.',
        getValue: () => settings.misc?.hideStartupClawd ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.hideStartupClawd = !settings.misc!.hideStartupClawd;
          });
        },
      },
      {
        id: 'increaseFileReadLimit',
        title: 'Increase file read token limit',
        description:
          'Increases the maximum file read limit from 25,000 to 1,000,000 tokens.',
        getValue: () => settings.misc?.increaseFileReadLimit ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.increaseFileReadLimit =
              !settings.misc!.increaseFileReadLimit;
          });
        },
      },
      {
        id: 'suppressLineNumbers',
        title: 'Suppress line numbers in file reads/edits',
        description:
          'Removes line number prefixes from file content to reduce token usage.',
        getValue: () => settings.misc?.suppressLineNumbers ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.suppressLineNumbers =
              !settings.misc!.suppressLineNumbers;
          });
        },
      },
      {
        id: 'suppressRateLimitOptions',
        title: 'Suppress rate limit options popup',
        description:
          'Prevents the automatic /rate-limit-options command from being triggered when hitting rate limits.',
        getValue: () => settings.misc?.suppressRateLimitOptions ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.suppressRateLimitOptions =
              !settings.misc!.suppressRateLimitOptions;
          });
        },
      },
      {
        id: 'mcpNonBlocking',
        title: 'Non-blocking MCP startup',
        description:
          'Start immediately while MCP servers connect in background. Reduces startup time ~50% with multiple MCPs.',
        getValue: () => settings.misc?.mcpConnectionNonBlocking ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.mcpConnectionNonBlocking =
              !settings.misc!.mcpConnectionNonBlocking;
          });
        },
      },
      {
        id: 'mcpBatchSize',
        title: 'MCP server batch size',
        description: `Parallel MCP connections (${MCP_BATCH_SIZE_MIN}-${MCP_BATCH_SIZE_MAX}). Use ←/→ to adjust. Higher = faster startup, more resources.`,
        getValue: () => settings.misc?.mcpServerBatchSize ?? null,
        getDisplayValue: () =>
          getMcpBatchSizeDisplay(settings.misc?.mcpServerBatchSize ?? null),
        toggle: () => {
          // Space resets to default
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.mcpServerBatchSize = null;
          });
        },
        increment: () => {
          updateSettings(settings => {
            ensureMisc();
            const current =
              settings.misc!.mcpServerBatchSize ?? MCP_BATCH_SIZE_DEFAULT;
            settings.misc!.mcpServerBatchSize = Math.min(
              MCP_BATCH_SIZE_MAX,
              current + 1
            );
          });
        },
        decrement: () => {
          updateSettings(settings => {
            ensureMisc();
            const current =
              settings.misc!.mcpServerBatchSize ?? MCP_BATCH_SIZE_DEFAULT;
            const newValue = current - 1;
            // If going below min, set to null (default)
            settings.misc!.mcpServerBatchSize =
              newValue < MCP_BATCH_SIZE_MIN ? null : newValue;
          });
        },
      },
      {
        id: 'tableFormat',
        title: 'Table output format',
        description:
          'Controls how Claude formats tables. Default: full borders. ASCII: | and -. Clean: no top/bottom/row separators. Clean+top/bottom: borders but no row separators.',
        getValue: () => settings.misc?.tableFormat ?? 'default',
        isMultiValue: true,
        getDisplayValue: () =>
          getTableFormatDisplay(settings.misc?.tableFormat ?? 'default'),
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.tableFormat = cycleTableFormat(
              settings.misc!.tableFormat ?? 'default'
            );
          });
        },
      },
      {
        id: 'enableSwarmMode',
        title: 'Enable swarm mode (native multi-agent)',
        description:
          'Force-enable native multi-agent features (TeammateTool, delegate mode, swarm spawning) by bypassing the tengu_brass_pebble statsig flag.',
        getValue: () => settings.misc?.enableSwarmMode ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.enableSwarmMode = !settings.misc!.enableSwarmMode;
          });
        },
      },
      {
        id: 'statuslineThrottle',
        title: 'Statusline throttle',
        description: `Throttle statusline updates (${STATUSLINE_THROTTLE_MIN}-${STATUSLINE_THROTTLE_MAX}ms). Use ←/→ to adjust by ${STATUSLINE_THROTTLE_STEP}ms. Space to disable. 0 = instant updates.`,
        getValue: () => settings.misc?.statuslineThrottleMs ?? null,
        getDisplayValue: () =>
          getStatusLineThrottleDisplay(
            settings.misc?.statuslineThrottleMs ?? null
          ),
        toggle: () => {
          // Space toggles between disabled and default
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.statuslineThrottleMs =
              settings.misc!.statuslineThrottleMs === null
                ? STATUSLINE_THROTTLE_DEFAULT
                : null;
          });
        },
        increment: () => {
          updateSettings(settings => {
            ensureMisc();
            const current =
              settings.misc!.statuslineThrottleMs ??
              STATUSLINE_THROTTLE_DEFAULT;
            settings.misc!.statuslineThrottleMs = Math.min(
              STATUSLINE_THROTTLE_MAX,
              current + STATUSLINE_THROTTLE_STEP
            );
          });
        },
        decrement: () => {
          updateSettings(settings => {
            ensureMisc();
            const current =
              settings.misc!.statuslineThrottleMs ??
              STATUSLINE_THROTTLE_DEFAULT;
            settings.misc!.statuslineThrottleMs = Math.max(
              STATUSLINE_THROTTLE_MIN,
              current - STATUSLINE_THROTTLE_STEP
            );
          });
        },
      },
      {
        id: 'statuslineFixedInterval',
        title: 'Statusline fixed interval mode',
        description:
          'Use setInterval instead of throttle. Updates happen on a fixed schedule rather than on-demand.',
        getValue: () => settings.misc?.statuslineUseFixedInterval ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.statuslineUseFixedInterval =
              !settings.misc!.statuslineUseFixedInterval;
          });
        },
      },
      {
        id: 'enableSessionMemory',
        title: 'Enable session memory',
        description:
          'Force-enable session memory (auto-extraction + past session search) by bypassing the tengu_session_memory and tengu_coral_fern statsig flags.',
        getValue: () => settings.misc?.enableSessionMemory ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.enableSessionMemory =
              !settings.misc!.enableSessionMemory;
          });
        },
      },
      {
        id: 'enableRememberSkill',
        title: 'Enable remember skill',
        description:
          'Register a "remember" skill to review session memories and update CLAUDE.local.md with learnings from past sessions.',
        getValue: () => settings.misc?.enableRememberSkill ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.enableRememberSkill =
              !settings.misc!.enableRememberSkill;
          });
        },
      },
      {
        id: 'tokenCountRounding',
        title: 'Token count rounding',
        description:
          'Round displayed token counts to nearest multiple. Use ←/→ to cycle: Off, 1, 5, 10, 25, 50, 100, 200, 250, 500, 1000.',
        getValue: () => settings.misc?.tokenCountRounding ?? null,
        getDisplayValue: () =>
          getTokenRoundingDisplay(settings.misc?.tokenCountRounding ?? null),
        toggle: () => {
          // Space resets to off (null)
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.tokenCountRounding = null;
          });
        },
        increment: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.tokenCountRounding = cycleTokenRounding(
              settings.misc!.tokenCountRounding ?? null,
              'next'
            );
          });
        },
        decrement: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.tokenCountRounding = cycleTokenRounding(
              settings.misc!.tokenCountRounding ?? null,
              'prev'
            );
          });
        },
      },
      {
        id: 'autoAcceptPlanMode',
        title: 'Auto-accept plan mode',
        description:
          'Automatically accept plans without the "Ready to code?" confirmation prompt.',
        getValue: () => settings.misc?.autoAcceptPlanMode ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.autoAcceptPlanMode =
              !settings.misc!.autoAcceptPlanMode;
          });
        },
      },
      {
        id: 'removeNewSessionShortcut',
        title: 'Remove Ctrl-L (new session) shortcut',
        description:
          'Removes the Ctrl-L global shortcut for starting a new session to prevent accidental triggers.',
        getValue: () => settings.misc?.removeNewSessionShortcut ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.removeNewSessionShortcut =
              !settings.misc!.removeNewSessionShortcut;
          });
        },
      },
      {
        id: 'allowBypassPermissionsInSudo',
        title: 'Allow bypassing permissions in sudo',
        description:
          '⚠️ WARNING: Disables a security check. When enabled, Claude can perform system-level operations without prompts. Use extreme caution.',
        getValue: () => settings.misc?.allowBypassPermissionsInSudo ?? false,
        toggle: () => {
          const currentValue =
            settings.misc?.allowBypassPermissionsInSudo ?? false;
          if (!currentValue) {
            setShowSudoWarning(true);
          } else {
            updateSettings(settings => {
              ensureMisc();
              settings.misc!.allowBypassPermissionsInSudo = false;
            });
          }
        },
      },
      {
        id: 'suppressNativeInstallerWarning',
        title: 'Suppress native installer warning',
        description:
          'Suppress the native installer warning message at startup.',
        getValue: () => settings.misc?.suppressNativeInstallerWarning ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.suppressNativeInstallerWarning =
              !settings.misc!.suppressNativeInstallerWarning;
          });
        },
      },
    ],
    [settings, updateSettings]
  );

  const totalItems = items.length;
  const maxIndex = totalItems - 1;

  // Calculate scroll offset to keep selected item visible
  const scrollOffset = useMemo(() => {
    if (selectedIndex < ITEMS_PER_PAGE) {
      return 0;
    }
    return Math.min(
      selectedIndex - ITEMS_PER_PAGE + 1,
      totalItems - ITEMS_PER_PAGE
    );
  }, [selectedIndex, totalItems]);

  const visibleItems = items.slice(scrollOffset, scrollOffset + ITEMS_PER_PAGE);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + ITEMS_PER_PAGE < totalItems;

  useInput((input, key) => {
    if (showSudoWarning) {
      if (key.return) {
        updateSettings(settings => {
          ensureMisc();
          settings.misc!.allowBypassPermissionsInSudo = true;
        });
        setShowSudoWarning(false);
      } else if (key.escape) {
        setShowSudoWarning(false);
      }
    } else {
      if (key.return || key.escape) {
        onSubmit();
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(maxIndex, prev + 1));
      } else if (input === ' ') {
        items[selectedIndex]?.toggle();
      } else if (key.rightArrow) {
        items[selectedIndex]?.increment?.();
      } else if (key.leftArrow) {
        items[selectedIndex]?.decrement?.();
      }
    }
  });

  return (
    <Box flexDirection="column">
      {showSudoWarning ? (
        <Box flexDirection="column" paddingX={2}>
          <Box
            borderStyle="double"
            borderColor="yellow"
            padding={2}
            flexDirection="column"
          >
            <Box marginBottom={1}>
              <Text bold color="yellow">
                SECURITY WARNING
              </Text>
            </Box>
            <Box marginBottom={1}>
              <Text>
                You are about to enable a feature that allows Claude Code to
                bypass permission checks when running with sudo privileges.
              </Text>
            </Box>
            <Box marginBottom={1}>
              <Text color="red">
                This means Claude can perform system-level operations without
                any prompts or confirmation.
              </Text>
            </Box>
            <Box marginBottom={1}>
              <Text bold>Use with extreme caution.</Text>
            </Box>
            <Box>
              <Text>
                Press <Text color="red">Enter</Text> to enable,{' '}
                <Text color="green">Escape</Text> to cancel
              </Text>
            </Box>
          </Box>
        </Box>
      ) : (
        <>
          <Box marginBottom={1}>
            <Header>Miscellaneous Settings</Header>
          </Box>

          <Box marginBottom={1}>
            <Text dimColor>
              Use ↑/↓ to navigate, space to toggle, ←/→ to adjust numbers, enter
              to go back.
            </Text>
          </Box>

          {/* Scroll indicator - more above */}
          {hasMoreAbove && (
            <Box>
              <Text dimColor> ↑ {scrollOffset} more above</Text>
            </Box>
          )}

          {/* Visible items */}
          {visibleItems.map((item, i) => {
            const actualIndex = scrollOffset + i;
            const isSelected = actualIndex === selectedIndex;
            const value = item.getValue();
            const hasCustomDisplay = !!item.getDisplayValue;
            const isNumeric = !!item.increment;

            // Determine checkbox/indicator
            let indicator: string;
            if (isNumeric) {
              indicator = '◆'; // Diamond for numeric
            } else if (hasCustomDisplay) {
              indicator = '◉'; // Filled circle for multi-value
            } else {
              indicator = value ? '☑' : '☐'; // Checkbox for boolean
            }

            // Determine status text
            let statusText: string;
            if (hasCustomDisplay) {
              statusText = item.getDisplayValue!();
            } else if (typeof value === 'boolean') {
              statusText = value ? 'Enabled' : 'Disabled';
            } else {
              statusText = String(value ?? 'Default');
            }

            // Show arrow hints for numeric items when selected
            const arrowHint = isSelected && isNumeric ? ' ← → ' : '';

            return (
              <Box key={item.id} flexDirection="column">
                <Box>
                  <Text>
                    <Text color={isSelected ? 'cyan' : undefined}>
                      {isSelected ? '❯ ' : '  '}
                    </Text>
                    <Text bold color={isSelected ? 'cyan' : undefined}>
                      {item.title}
                    </Text>
                  </Text>
                </Box>

                <Box>
                  <Text dimColor>
                    {'  '}
                    {item.description}
                  </Text>
                </Box>

                <Box marginLeft={4} marginBottom={1}>
                  <Text>
                    {indicator} {statusText}
                    <Text dimColor>{arrowHint}</Text>
                  </Text>
                </Box>
              </Box>
            );
          })}

          {/* Scroll indicator - more below */}
          {hasMoreBelow && (
            <Box>
              <Text dimColor>
                {' '}
                ↓ {totalItems - scrollOffset - ITEMS_PER_PAGE} more below
              </Text>
            </Box>
          )}

          {/* Page indicator */}
          <Box marginTop={1}>
            <Text dimColor>
              Item {selectedIndex + 1} of {totalItems}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
