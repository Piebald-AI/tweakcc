import { useContext, useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { DEFAULT_SETTINGS } from '@/defaultSettings';

import Header from './Header';
import { SettingsContext } from '../App';

interface ClaudeMdAltNamesViewProps {
  onBack: () => void;
}

export function ClaudeMdAltNamesView({ onBack }: ClaudeMdAltNamesViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);

  const altNames = settings.claudeMdAltNames ?? [];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editInput, setEditInput] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  useInput((input, key) => {
    if (editing || addingNew) {
      if (key.return && editInput.trim()) {
        if (addingNew) {
          updateSettings(s => {
            if (!s.claudeMdAltNames) {
              s.claudeMdAltNames = [];
            }
            s.claudeMdAltNames.push(editInput.trim());
          });
          setAddingNew(false);
        } else {
          updateSettings(s => {
            if (!s.claudeMdAltNames) return;
            s.claudeMdAltNames[selectedIndex] = editInput.trim();
          });
          setEditing(false);
        }
        setEditInput('');
      } else if (key.escape) {
        setEditInput('');
        setEditing(false);
        setAddingNew(false);
      } else if (key.backspace || key.delete) {
        setEditInput(prev => prev.slice(0, -1));
      } else if (input) {
        setEditInput(prev => prev + input);
      }
      return;
    }

    if (key.escape) {
      onBack();
    } else if (key.upArrow) {
      if (altNames.length > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : altNames.length - 1));
      }
    } else if (key.downArrow) {
      if (altNames.length > 0) {
        setSelectedIndex(prev => (prev < altNames.length - 1 ? prev + 1 : 0));
      }
    } else if (input === 'e') {
      // Edit
      if (altNames.length > 0) {
        setEditInput(altNames[selectedIndex]);
        setEditing(true);
      }
    } else if (input === 'd') {
      // Delete
      if (altNames.length > 0) {
        updateSettings(s => {
          if (!s.claudeMdAltNames) return;
          s.claudeMdAltNames = s.claudeMdAltNames.filter(
            (_, index) => index !== selectedIndex
          );
        });
        if (selectedIndex >= altNames.length - 1) {
          setSelectedIndex(Math.max(0, altNames.length - 2));
        }
      }
    } else if (input === 'n') {
      // Add new
      setAddingNew(true);
      setEditInput('');
    } else if (key.ctrl && input === 'r') {
      // Reset to default
      updateSettings(s => {
        s.claudeMdAltNames = [...(DEFAULT_SETTINGS.claudeMdAltNames ?? [])];
      });
      setSelectedIndex(0);
    } else if (input === 'u' || (key.shift && key.upArrow)) {
      // Move up
      if (altNames.length > 1 && selectedIndex > 0) {
        updateSettings(s => {
          if (!s.claudeMdAltNames) return;
          const arr = s.claudeMdAltNames;
          [arr[selectedIndex - 1], arr[selectedIndex]] = [
            arr[selectedIndex],
            arr[selectedIndex - 1],
          ];
        });
        setSelectedIndex(prev => prev - 1);
      }
    } else if (input === 'j' || (key.shift && key.downArrow)) {
      // Move down
      if (altNames.length > 1 && selectedIndex < altNames.length - 1) {
        updateSettings(s => {
          if (!s.claudeMdAltNames) return;
          const arr = s.claudeMdAltNames;
          [arr[selectedIndex], arr[selectedIndex + 1]] = [
            arr[selectedIndex + 1],
            arr[selectedIndex],
          ];
        });
        setSelectedIndex(prev => prev + 1);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Header>CLAUDE.md Alternative Names</Header>
        <Box flexDirection="column">
          <Text dimColor>changes auto-saved</Text>
          <Text dimColor>esc to go back</Text>
        </Box>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>
          When Claude Code looks for CLAUDE.md and doesn&apos;t find it, it will
          try these alternative filenames in order. This lets you use AGENTS.md
          (and other file names).
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          e to edit · d to delete · n to add new · u/j to move up/down · ctrl+r
          to reset
        </Text>
      </Box>

      <Box flexDirection="column">
        {altNames.length === 0 ? (
          <Text>No alternative names configured. Press n to add one.</Text>
        ) : (
          <>
            {(() => {
              const maxVisible = 12;
              const startIndex = Math.max(
                0,
                selectedIndex - Math.floor(maxVisible / 2)
              );
              const endIndex = Math.min(
                altNames.length,
                startIndex + maxVisible
              );
              const adjustedStartIndex = Math.max(0, endIndex - maxVisible);

              const visibleNames = altNames.slice(adjustedStartIndex, endIndex);

              return (
                <>
                  {adjustedStartIndex > 0 && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↑ {adjustedStartIndex} more above
                    </Text>
                  )}
                  {visibleNames.map((name, visibleIndex) => {
                    const actualIndex = adjustedStartIndex + visibleIndex;
                    const isSelected = actualIndex === selectedIndex;
                    return (
                      <Text
                        key={actualIndex}
                        color={isSelected ? 'cyan' : undefined}
                      >
                        {isSelected ? '❯ ' : '  '}
                        {name}
                      </Text>
                    );
                  })}
                  {endIndex < altNames.length && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↓ {altNames.length - endIndex} more below
                    </Text>
                  )}
                </>
              );
            })()}
          </>
        )}
        {addingNew && (
          <Box alignItems="center">
            <Text color="yellow">❯ </Text>
            <Box borderStyle="round" borderColor="yellow">
              <Text>{editInput}</Text>
            </Box>
          </Box>
        )}
        {editing && (
          <Box marginTop={1} alignItems="center">
            <Text>Editing: </Text>
            <Box borderStyle="round" borderColor="yellow">
              <Text>{editInput}</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
