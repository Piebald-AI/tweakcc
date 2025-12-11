import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Header from './Header.js';

interface ChangeNameViewProps {
  onBack: () => void;
}

export function ChangeNameView({ onBack }: ChangeNameViewProps) {
  const [inputValue, setInputValue] = useState('Claude Code');
  const [isEditing, setIsEditing] = useState(false);

  useInput((input, key) => {
    if (isEditing) {
      if (key.return) {
        setIsEditing(false);
      } else if (key.escape) {
        setInputValue('Claude Code');
        setIsEditing(false);
      } else if (key.backspace || key.delete) {
        setInputValue(prev => prev.slice(0, -1));
      } else if (input) {
        setInputValue(prev => prev + input);
      }
      return;
    }

    if (key.escape) {
      onBack();
    } else if (key.return) {
      setIsEditing(true);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Header>Change name</Header>
        <Box>
          <Text dimColor>enter to {isEditing ? 'save' : 'edit'}</Text>
        </Box>
        <Box>
          <Text dimColor>esc to go back</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text>
          <Text color={!isEditing ? 'yellow' : undefined}>
            {!isEditing ? '❯ ' : '  '}
          </Text>
          <Text bold color={!isEditing ? 'yellow' : undefined}>
            Name
          </Text>
        </Text>
        {isEditing && <Text dimColor>{'  '}enter to save, esc to cancel</Text>}
      </Box>

      <Box marginLeft={2} marginTop={1}>
        <Box
          borderStyle="round"
          borderColor={isEditing ? 'yellow' : 'gray'}
          paddingX={1}
        >
          <Text>
            {inputValue}
            {isEditing && <Text color="yellow">█</Text>}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
