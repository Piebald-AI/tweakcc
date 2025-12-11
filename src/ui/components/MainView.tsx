import { useContext, useState } from 'react';
import { Box, Text } from 'ink';
import Link from 'ink-link';

import { MainMenuItem } from '@/types.js';
import { CONFIG_FILE } from '@/config.js';

import { SelectInput, SelectItem } from './SelectInput.js';
import Header from './Header.js';
import { SettingsContext } from '../App.js';

interface MainViewProps {
  onSubmit: (item: MainMenuItem) => void;
  notification: {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null;
  isNativeInstallation: boolean;
  configMigrated: boolean;
}

// prettier-ignore
const baseMenuItems: SelectItem[] = [
  {
    name: MainMenuItem.THEMES,
    desc: "Modify Claude Code's built-in themes or create your own",
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
    name: MainMenuItem.USER_MESSAGE_DISPLAY,
    desc: 'Customize how user messages are displayed',
  },
  {
    name: MainMenuItem.MISC,
    desc: 'Miscellaneous settings (input box border, etc.)',
  },
  {
    name: MainMenuItem.TOOLSETS,
    desc: 'Manage toolsets to control which tools are available',
  },
  {
    name: MainMenuItem.VIEW_SYSTEM_PROMPTS,
    desc: 'Opens the system prompts directory where you can customize Claude Code\'s system prompts',
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

export function MainView({
  onSubmit,
  notification,
  isNativeInstallation,
  configMigrated,
}: MainViewProps) {
  const filteredSystemMenuItems = isNativeInstallation
    ? systemMenuItems.filter(item => item.name !== MainMenuItem.OPEN_CLI)
    : systemMenuItems;

  const menuItems: SelectItem[] = [
    ...(useContext(SettingsContext).changesApplied
      ? []
      : [
          {
            name: MainMenuItem.APPLY_CHANGES,
            desc: 'Required: Updates Claude Code in-place with your changes',
            selectedStyles: {
              color: 'green',
            },
          },
        ]),
    ...baseMenuItems,
    ...filteredSystemMenuItems,
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <Box flexDirection="column">
      {configMigrated && (
        <Box marginBottom={1}>
          <Text color="blue" bold>
            INFO: `ccInstallationDir` config is deprecated; migrated to
            `ccInstallationPath` which supports npm and native installs.
          </Text>
        </Box>
      )}
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
