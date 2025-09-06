import { Box, Text, useInput } from 'ink';
import { useContext, useState } from 'react';
import { SettingsContext } from '../App.js';
import Header from './Header.js';

interface InputBoxViewProps {
  onSubmit: () => void;
}

export function InputBoxView({ onSubmit }: InputBoxViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleRemoveBorderToggle = () => {
    updateSettings(settings => {
      if (!settings.inputBox) {
        settings.inputBox = { removeBorder: false };
      }
      settings.inputBox.removeBorder = !settings.inputBox.removeBorder;
    });
  };

  useInput((input, key) => {
    if (key.return || key.escape) {
      onSubmit();
    } else if (input === ' ' && selectedIndex === 0) {
      handleRemoveBorderToggle();
    }
  });

  const checkboxChar = settings.inputBox?.removeBorder ? '☑' : '☐';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Header>Input Box Settings</Header>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          <Text bold>
            Customize the appearance of the Claude Code input box.
          </Text>{' '}
          <Text dimColor>
            Press space to toggle settings, enter to go back.
          </Text>
        </Text>
      </Box>

      <Box>
        <Text>
          <Text color={selectedIndex === 0 ? 'cyan' : undefined}>
            {selectedIndex === 0 ? '❯ ' : '  '}
          </Text>
          <Text bold color={selectedIndex === 0 ? 'cyan' : undefined}>
            Remove border
          </Text>
        </Text>
      </Box>

      {selectedIndex === 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>{'  '}space to toggle</Text>
        </Box>
      )}

      <Box marginLeft={2} marginBottom={1}>
        <Text>
          {checkboxChar}{' '}
          {settings.inputBox?.removeBorder ? 'Enabled' : 'Disabled'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          When enabled, removes the rounded border around the input box for a
          cleaner look.
        </Text>
      </Box>
    </Box>
  );
}
