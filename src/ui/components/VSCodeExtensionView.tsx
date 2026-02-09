import { Box, Text, useInput } from 'ink';
import { useContext, useState, useMemo } from 'react';
import { SettingsContext } from '../App';
import Header from './Header';
import { TableFormat } from '../../types';

const ITEMS_PER_PAGE = 4;

interface VSCodeExtensionItem {
  id: string;
  title: string;
  description: string;
  getValue: () => boolean | number | null;
  toggle: () => void;
  increment?: () => void;
  decrement?: () => void;
  getDisplayValue?: () => string;
}

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

const getTokenRoundingDisplay = (value: number | null): string => {
  if (value === null) return 'Off (exact counts)';
  return `Round to ${value}`;
};

const cycleTokenRounding = (
  current: number | null,
  direction: 'next' | 'prev'
): number | null => {
  const currentIndex = TOKEN_ROUNDING_OPTIONS.indexOf(current);
  if (currentIndex === -1) return TOKEN_ROUNDING_OPTIONS[0];

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

export function VSCodeExtensionView({ onBack }: { onBack: () => void }) {
  const { settings, updateSettings } = useContext(SettingsContext);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const defaultVSCodeExtensions = {
    enableConversationTitle: true,
    hideStartupBanner: false,
    hideCtrlGToEdit: false,
    removeNewSessionShortcut: false,
    tableFormat: 'default' as TableFormat,
    enableSwarmMode: true,
    tokenCountRounding: null as number | null,
  };

  const ensureVSCodeExtensions = () => {
    if (!settings.vscodeExtensions) {
      settings.vscodeExtensions = { ...defaultVSCodeExtensions };
    }
  };

  const items: VSCodeExtensionItem[] = useMemo(
    () => [
      {
        id: 'conversationTitle',
        title: 'Allow renaming sessions via /title',
        description:
          'Enables /title and /rename commands for manually naming conversations.',
        getValue: () =>
          settings.vscodeExtensions?.enableConversationTitle ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.enableConversationTitle =
              !settings.vscodeExtensions!.enableConversationTitle;
          });
        },
      },
      {
        id: 'hideStartupBanner',
        title: 'Hide startup banner',
        description:
          'Hides startup banner message displayed before first prompt.',
        getValue: () => settings.vscodeExtensions?.hideStartupBanner ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.hideStartupBanner =
              !settings.vscodeExtensions!.hideStartupBanner;
          });
        },
      },
      {
        id: 'hideCtrlGToEdit',
        title: 'Hide ctrl-g to edit prompt hint',
        description:
          'Hides "ctrl-g to edit prompt" hint shown during streaming.',
        getValue: () => settings.vscodeExtensions?.hideCtrlGToEdit ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.hideCtrlGToEdit =
              !settings.vscodeExtensions!.hideCtrlGToEdit;
          });
        },
      },
      {
        id: 'removeNewSessionShortcut',
        title: 'Remove Ctrl-K (new session) shortcut',
        description:
          'Removes Ctrl-K global shortcut for starting a new session to prevent accidental triggers.',
        getValue: () =>
          settings.vscodeExtensions?.removeNewSessionShortcut ?? false,
        toggle: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.removeNewSessionShortcut =
              !settings.vscodeExtensions!.removeNewSessionShortcut;
          });
        },
      },
      {
        id: 'enableSwarmMode',
        title: 'Enable swarm mode (native multi-agent)',
        description:
          'Force-enable native multi-agent features (TeammateTool, delegate mode, swarm spawning) by bypassing tengu_brass_pebble statsig flag.',
        getValue: () => settings.vscodeExtensions?.enableSwarmMode ?? true,
        toggle: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.enableSwarmMode =
              !settings.vscodeExtensions!.enableSwarmMode;
          });
        },
      },
      {
        id: 'tokenCountRounding',
        title: 'Token count rounding',
        description:
          'Round displayed token counts to nearest multiple. Use ←/→ to cycle: Off, 1, 5, 10, 25, 50, 100, 200, 250, 500, 1000.',
        getValue: () => settings.vscodeExtensions?.tokenCountRounding ?? null,
        getDisplayValue: () =>
          getTokenRoundingDisplay(
            settings.vscodeExtensions?.tokenCountRounding ?? null
          ),
        toggle: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.tokenCountRounding = null;
          });
        },
        increment: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.tokenCountRounding = cycleTokenRounding(
              settings.vscodeExtensions!.tokenCountRounding ?? null,
              'next'
            );
          });
        },
        decrement: () => {
          updateSettings(settings => {
            ensureVSCodeExtensions();
            settings.vscodeExtensions!.tokenCountRounding = cycleTokenRounding(
              settings.vscodeExtensions!.tokenCountRounding ?? null,
              'prev'
            );
          });
        },
      },
    ],
    [settings, updateSettings]
  );

  const totalItems = items.length;
  const maxIndex = totalItems - 1;

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
      onBack();
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
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Header>VS Code Extension Settings</Header>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          Use ↑/↓ to navigate, space to toggle, ←/→ to adjust numbers, enter to
          go back.
        </Text>
      </Box>

      {hasMoreAbove && (
        <Box>
          <Text dimColor> ↑ {scrollOffset} more above</Text>
        </Box>
      )}

      {visibleItems.map((item, i) => {
        const actualIndex = scrollOffset + i;
        const isSelected = actualIndex === selectedIndex;
        const value = item.getValue();
        const hasCustomDisplay = !!item.getDisplayValue;
        const isNumeric = !!item.increment;

        let indicator: string;
        if (isNumeric) {
          indicator = '◆';
        } else if (hasCustomDisplay) {
          indicator = '◉';
        } else {
          indicator = value ? '☑' : '☐';
        }

        let statusText: string;
        if (hasCustomDisplay) {
          statusText = item.getDisplayValue!();
        } else if (typeof value === 'boolean') {
          statusText = value ? 'Enabled' : 'Disabled';
        } else {
          statusText = String(value ?? 'Default');
        }

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

      {hasMoreBelow && (
        <Box>
          <Text dimColor>
            {' '}
            ↓ {totalItems - scrollOffset - ITEMS_PER_PAGE} more below
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Item {selectedIndex + 1} of {totalItems}
        </Text>
      </Box>
    </Box>
  );
}
