import * as os from 'node:os';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { InstallationCandidate } from '../../types';
import { CONFIG_DIR } from '@/config';

interface InstallationPickerProps {
  candidates: InstallationCandidate[];
  onSelect: (candidate: InstallationCandidate) => void;
}

export function InstallationPicker({
  candidates,
  onSelect,
}: InstallationPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      process.exit(0);
    } else if (key.upArrow) {
      setSelectedIndex(i => (i > 0 ? i - 1 : candidates.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(i => (i < candidates.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      onSelect(candidates[selectedIndex]);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        No claude executable was found in PATH, and multiple Claude Code
        installations were found. Please select one:
      </Text>
      <Text> </Text>
      {candidates.map((candidate, index) => (
        <Box key={candidate.path}>
          <Text
            bold={index === selectedIndex}
            color={index === selectedIndex ? 'cyan' : undefined}
          >
            {index === selectedIndex ? '❯ ' : '  '}
            {candidate.path}
          </Text>
          <Text dimColor>
            {' '}
            ({candidate.kind}, v{candidate.version})
          </Text>
        </Box>
      ))}
      <Text> </Text>
      <Text>
        Your choice will be saved to{' '}
        <Text color="blue">ccInstallationPath</Text> in{' '}
        <Text color="blue">
          {CONFIG_DIR.replace(os.homedir(), '~')}/config.json
        </Text>
        .
      </Text>
      <Text> </Text>
      <Text dimColor>
        Use ↑↓ arrows to navigate, Enter to select, Esc to quit
      </Text>
    </Box>
  );
}
