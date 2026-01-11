import { useContext, useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { getCurrentClaudeCodeTheme } from '@/utils';
import { DEFAULT_SETTINGS } from '@/defaultSettings';

import Header from './Header';
import { SettingsContext } from '../App';

interface CompletionVerbsViewProps {
  onBack: () => void;
}

export function CompletionVerbsView({ onBack }: CompletionVerbsViewProps) {
  const {
    settings: {
      completionVerbs: { verbs },
      themes,
    },
    updateSettings,
  } = useContext(SettingsContext);

  const [selectedVerbIndex, setSelectedVerbIndex] = useState(0);
  const [editingVerb, setEditingVerb] = useState(false);
  const [verbInput, setVerbInput] = useState('');
  const [addingNewVerb, setAddingNewVerb] = useState(false);

  // Get current Claude theme and color
  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme =
    themes.find(t => t.id === currentThemeId) ||
    themes.find(t => t.id === 'dark');
  const claudeColor = currentTheme?.colors.claude || 'rgb(215,119,87)';

  useInput((input, key) => {
    if (editingVerb || addingNewVerb) {
      if (key.return && verbInput.trim()) {
        if (addingNewVerb) {
          updateSettings(settings => {
            settings.completionVerbs.verbs.push(verbInput.trim());
          });
          setAddingNewVerb(false);
        } else {
          updateSettings(settings => {
            settings.completionVerbs.verbs[selectedVerbIndex] = verbInput.trim();
          });
          setEditingVerb(false);
        }
        setVerbInput('');
      } else if (key.escape) {
        setVerbInput('');
        setEditingVerb(false);
        setAddingNewVerb(false);
      } else if (key.backspace || key.delete) {
        setVerbInput(prev => prev.slice(0, -1));
      } else if (input) {
        setVerbInput(prev => prev + input);
      }
      return;
    }

    if (key.escape) {
      onBack();
    } else if (key.upArrow) {
      if (verbs.length > 0) {
        setSelectedVerbIndex(prev => (prev > 0 ? prev - 1 : verbs.length - 1));
      }
    } else if (key.downArrow) {
      if (verbs.length > 0) {
        setSelectedVerbIndex(prev => (prev < verbs.length - 1 ? prev + 1 : 0));
      }
    } else if (input === 'e') {
      // Edit verb
      if (verbs.length > 0) {
        setVerbInput(verbs[selectedVerbIndex]);
        setEditingVerb(true);
      }
    } else if (input === 'd') {
      // Delete verb
      if (verbs.length > 1) {
        updateSettings(settings => {
          settings.completionVerbs.verbs = settings.completionVerbs.verbs.filter(
            (_, index) => index !== selectedVerbIndex
          );
        });
        if (selectedVerbIndex >= verbs.length - 1) {
          setSelectedVerbIndex(Math.max(0, verbs.length - 2));
        }
      }
    } else if (input === 'n') {
      // Add new verb
      setAddingNewVerb(true);
      setVerbInput('');
    } else if (key.ctrl && input === 'r') {
      // Reset to default
      updateSettings(settings => {
        settings.completionVerbs.verbs = [
          ...DEFAULT_SETTINGS.completionVerbs.verbs,
        ];
      });
      setSelectedVerbIndex(0);
    }
  });

  const previewWidth = 50;

  return (
    <Box>
      <Box flexDirection="column" width={`${100 - previewWidth}%`}>
        <Box marginBottom={1} flexDirection="column">
          <Header>Completion Verbs</Header>
          <Box flexDirection="column">
            <Text dimColor>changes auto-saved</Text>
            <Text dimColor>esc to go back</Text>
          </Box>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor>
            Customize the past-tense verbs shown after thinking completes
            (e.g., "Baked for 42s").
          </Text>
        </Box>

        <Box>
          <Text bold>Verbs</Text>
        </Box>

        <Box flexDirection="column">
          <Text dimColor>
            {'  '}e to edit · d to delete · n to add new · ctrl+r to reset
          </Text>
        </Box>

        <Box marginLeft={2} marginBottom={1}>
          <Box flexDirection="column">
            {(() => {
              const maxVisible = 8; // Show 8 verbs at a time
              const startIndex = Math.max(
                0,
                selectedVerbIndex - Math.floor(maxVisible / 2)
              );
              const endIndex = Math.min(verbs.length, startIndex + maxVisible);
              const adjustedStartIndex = Math.max(0, endIndex - maxVisible);

              const visibleVerbs = verbs.slice(adjustedStartIndex, endIndex);

              return (
                <>
                  {adjustedStartIndex > 0 && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↑ {adjustedStartIndex} more above
                    </Text>
                  )}
                  {visibleVerbs.map((verb, visibleIndex) => {
                    const actualIndex = adjustedStartIndex + visibleIndex;
                    return (
                      <Text
                        key={actualIndex}
                        color={actualIndex === selectedVerbIndex ? 'cyan' : undefined}
                      >
                        {actualIndex === selectedVerbIndex ? '❯ ' : '  '}
                        {verb}
                      </Text>
                    );
                  })}
                  {endIndex < verbs.length && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↓ {verbs.length - endIndex} more below
                    </Text>
                  )}
                </>
              );
            })()}
            {addingNewVerb && (
              <Box alignItems="center">
                <Text color="yellow">❯ </Text>
                <Box borderStyle="round" borderColor="yellow">
                  <Text>{verbInput}</Text>
                </Box>
              </Box>
            )}
            {editingVerb && (
              <Box marginTop={1} alignItems="center">
                <Text>Editing: </Text>
                <Box borderStyle="round" borderColor="yellow">
                  <Text>{verbInput}</Text>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Box width={`${previewWidth}%`} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Preview</Text>
        </Box>
        <Box
          borderStyle="single"
          borderColor="gray"
          padding={1}
          flexDirection="column"
        >
          <Text>
            <Text color={claudeColor}>
              {verbs[selectedVerbIndex]} for 42s
            </Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

