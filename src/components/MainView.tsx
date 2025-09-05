import { Box, Text } from 'ink';
import Link from 'ink-link';
import { SelectInput, SelectItem } from './SelectInput.js';
import { useContext, useState } from 'react';
import { SettingsContext } from '../App.js';
import { CONFIG_FILE, MainMenuItem } from '../utils/types.js';
import Header from './Header.js';

interface MainViewProps {
  onSubmit: (item: MainMenuItem) => void;
  notification: {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null;
}

// prettier-ignore
const baseMenuItems: SelectItem[] = [
  {
    name: MainMenuItem.THEMES,
    desc: "Modify Claude Code's built-in themes or create your own",
  },
  {
    name: MainMenuItem.LAUNCH_TEXT,
    desc: 'Change the "CLAUDE CODE" banner text that\'s shown when you sign in to Claude Code',
  },
  {
    name: MainMenuItem.THINKING_VERBS,
    desc: "Customize the list of verbs that Claude Code uses when it's working",
  },
  {
    name: MainMenuItem.THINKING_STYLE,
    desc: 'Choose custom spinners',
  },
  {
    name: MainMenuItem.PAST_USER_INPUTS,
    desc: 'Customize how past user inputs are displayed (prefix and colors)',
  },
];

// prettier-ignore
const systemMenuItems: SelectItem[] = [
  {
    name: MainMenuItem.RESTORE_ORIGINAL,
    desc: 'Reverts your Claude Code install to its original state (your customizations are remembered and can be reapplied)',
  },
  {
    name: MainMenuItem.OPEN_CONFIG,
    desc: `Opens your tweakcc config file (${CONFIG_FILE})`,
  },
  {
    name: MainMenuItem.OPEN_CLI,
    desc: "Opens Claude Code's cli.js file",
  },
  {
    name: MainMenuItem.EXIT,
    desc: 'Bye!',
  },
];

export function MainView({ onSubmit, notification }: MainViewProps) {
  const menuItems: SelectItem[] = [
    ...(useContext(SettingsContext).changesApplied
      ? []
      : [
          {
            name: MainMenuItem.APPLY_CHANGES,
            desc: "Required: Updates Claude Code's cli.js in-place with your changes",
            selectedStyles: {
              color: 'green',
            },
          },
        ]),
    ...baseMenuItems,
    ...systemMenuItems,
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Header>Tweak Claude Code</Header>
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">
          <Text bold>Customize your Claude Code installation.</Text>{' '}
          <Text dimColor>Settings will be saved to a JSON file.</Text>
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="yellow">
          ⭐ <Text bold>Star the repo at </Text>
          <Link url="https://github.com/Piebald-AI/tweakcc" fallback={false}>
            <Text bold color="cyan">
              https://github.com/Piebald-AI/tweakcc
            </Text>
          </Link>
          <Text bold> if you find this useful!</Text> ⭐
        </Text>
      </Box>

      {notification && (
        <Box
          marginBottom={1}
          borderLeft={true}
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderStyle="bold"
          borderColor={
            notification?.type === 'success'
              ? 'green'
              : notification?.type === 'error'
                ? 'red'
                : notification?.type === 'info'
                  ? 'blue'
                  : 'yellow'
          }
          paddingLeft={1}
          flexDirection="column"
        >
          <Text
            color={
              notification?.type === 'success'
                ? 'green'
                : notification?.type === 'error'
                  ? 'red'
                  : notification?.type === 'info'
                    ? 'blue'
                    : 'yellow'
            }
          >
            {notification?.message}
          </Text>
        </Box>
      )}

      <SelectInput
        items={menuItems}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onSubmit={item => onSubmit(item as MainMenuItem)}
      />
    </Box>
  );
}
