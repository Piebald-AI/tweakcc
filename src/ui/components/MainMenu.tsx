import { CONFIG_FILE } from '@/config';
import { MainMenuItem } from '@/types';
import { useContext, useState } from 'react';
import { SettingsContext } from '../App';
import { SelectInput, SelectItem } from './SelectInput';

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
    name: MainMenuItem.INPUT_PATTERN_HIGHLIGHTERS,
    desc: 'Create custom highlighters for patterns in your input',
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
    name: MainMenuItem.SUBAGENT_MODELS,
    desc: 'Configure which Claude model each subagent uses (Plan, Explore, etc.)',
  },
  {
    name: MainMenuItem.VIEW_SYSTEM_PROMPTS,
    desc: "Opens the system prompts directory where you can customize Claude Code's system prompts",
  },
];

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

const MainMenu = ({ onSubmit }: { onSubmit: (item: MainMenuItem) => void }) => {
  const settings = useContext(SettingsContext);

  const menuItems: SelectItem[] = [
    ...(settings.changesApplied
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
    ...systemMenuItems,
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <SelectInput
      items={menuItems}
      selectedIndex={selectedIndex}
      onSelect={setSelectedIndex}
      onSubmit={item => onSubmit(item as MainMenuItem)}
    />
  );
};

export default MainMenu;
