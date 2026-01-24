import { Box, Text, useInput } from 'ink';
import { useContext, useState, useMemo } from 'react';
import { SettingsContext } from '../App';
import Header from './Header';

interface MiscViewProps {
  onSubmit: () => void;
}

interface MiscItem {
  id: string;
  title: string;
  description: string;
  getValue: () => boolean;
  toggle: () => void;
}

const ITEMS_PER_PAGE = 4;

export function MiscView({ onSubmit }: MiscViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);

  const [selectedIndex, setSelectedIndex] = useState(0);

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
    preventUpdateToUnsupportedVersions: false,
  };

  const ensureMisc = () => {
    if (!settings.misc) {
      settings.misc = { ...defaultMisc };
    }
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
        id: 'preventUnsupportedUpdates',
        title: 'Prevent updates to unsupported versions',
        description:
          'Blocks Claude Code auto-updates to versions not yet supported by tweakcc.',
        getValue: () =>
          settings.misc?.preventUpdateToUnsupportedVersions ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureMisc();
            settings.misc!.preventUpdateToUnsupportedVersions =
              !settings.misc!.preventUpdateToUnsupportedVersions;
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
    if (key.return || key.escape) {
      onSubmit();
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(maxIndex, prev + 1));
    } else if (input === ' ') {
      items[selectedIndex]?.toggle();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Header>Miscellaneous Settings</Header>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          Various tweaks and customizations. Press space to toggle settings,
          enter to go back.
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
        const checkbox = item.getValue() ? '☑' : '☐';

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
                {checkbox} {item.getValue() ? 'Enabled' : 'Disabled'}
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
    </Box>
  );
}
