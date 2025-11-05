import { Box, Text, useInput } from 'ink';
import { useContext, useState } from 'react';
import { SettingsContext } from '../App.js';
import Header from './Header.js';

interface MiscViewProps {
  onSubmit: () => void;
}

export function MiscView({ onSubmit }: MiscViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleRemoveBorderToggle = () => {
    updateSettings(settings => {
      if (!settings.inputBox) {
        settings.inputBox = { removeBorder: false };
      }
      settings.inputBox.removeBorder = !settings.inputBox.removeBorder;
    });
  };

  const handleShowVersionToggle = () => {
    updateSettings(settings => {
      if (!settings.misc) {
        settings.misc = { showTweakccVersion: true, showPatchesApplied: true };
      }
      settings.misc.showTweakccVersion = !settings.misc.showTweakccVersion;
    });
  };

  const handleShowPatchesToggle = () => {
    updateSettings(settings => {
      if (!settings.misc) {
        settings.misc = { showTweakccVersion: true, showPatchesApplied: true };
      }
      settings.misc.showPatchesApplied = !settings.misc.showPatchesApplied;
    });
  };

  useInput((input, key) => {
    if (key.return || key.escape) {
      onSubmit();
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(2, prev + 1));
    } else if (input === ' ') {
      if (selectedIndex === 0) {
        handleRemoveBorderToggle();
      } else if (selectedIndex === 1) {
        handleShowVersionToggle();
      } else if (selectedIndex === 2) {
        handleShowPatchesToggle();
      }
    }
  });

  const removeBorderCheckbox = settings.inputBox?.removeBorder ? '☑' : '☐';
  const showVersionCheckbox = settings.misc?.showTweakccVersion ? '☑' : '☐';
  const showPatchesCheckbox = settings.misc?.showPatchesApplied ? '☑' : '☐';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Header>Miscellaneous Settings</Header>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          <Text bold>Various tweaks and customizations.</Text>{' '}
          <Text dimColor>
            Press space to toggle settings, enter to go back.
          </Text>
        </Text>
      </Box>

      {/* Remove Border Option */}
      <Box>
        <Text>
          <Text color={selectedIndex === 0 ? 'cyan' : undefined}>
            {selectedIndex === 0 ? '❯ ' : '  '}
          </Text>
          <Text bold color={selectedIndex === 0 ? 'cyan' : undefined}>
            Remove input box border
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
          {removeBorderCheckbox}{' '}
          {settings.inputBox?.removeBorder ? 'Enabled' : 'Disabled'}
        </Text>
      </Box>

      {selectedIndex === 0 && (
        <Box marginBottom={1}>
          <Text color="gray" dimColor>
            Removes the rounded border around the input box for a cleaner look.
          </Text>
        </Box>
      )}

      {/* Show tweakcc Version Option */}
      <Box>
        <Text>
          <Text color={selectedIndex === 1 ? 'cyan' : undefined}>
            {selectedIndex === 1 ? '❯ ' : '  '}
          </Text>
          <Text bold color={selectedIndex === 1 ? 'cyan' : undefined}>
            Show tweakcc version at startup
          </Text>
        </Text>
      </Box>

      {selectedIndex === 1 && (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>{'  '}space to toggle</Text>
        </Box>
      )}

      <Box marginLeft={2} marginBottom={1}>
        <Text>
          {showVersionCheckbox}{' '}
          {settings.misc?.showTweakccVersion ? 'Enabled' : 'Disabled'}
        </Text>
      </Box>

      {selectedIndex === 1 && (
        <Box marginBottom={1}>
          <Text color="gray" dimColor>
            Shows the blue &quot;+ tweakcc v&lt;VERSION&gt;&quot; message when starting
            Claude Code.
          </Text>
        </Box>
      )}

      {/* Show Patches Applied Option */}
      <Box>
        <Text>
          <Text color={selectedIndex === 2 ? 'cyan' : undefined}>
            {selectedIndex === 2 ? '❯ ' : '  '}
          </Text>
          <Text bold color={selectedIndex === 2 ? 'cyan' : undefined}>
            Show patches applied indicator at startup
          </Text>
        </Text>
      </Box>

      {selectedIndex === 2 && (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>{'  '}space to toggle</Text>
        </Box>
      )}

      <Box marginLeft={2} marginBottom={1}>
        <Text>
          {showPatchesCheckbox}{' '}
          {settings.misc?.showPatchesApplied ? 'Enabled' : 'Disabled'}
        </Text>
      </Box>

      {selectedIndex === 2 && (
        <Box marginBottom={1}>
          <Text color="gray" dimColor>
            Shows the green &quot;tweakcc patches are applied&quot; indicator when
            starting Claude Code.
          </Text>
        </Box>
      )}
    </Box>
  );
}
