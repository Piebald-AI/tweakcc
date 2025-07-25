import { useContext, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getCurrentClaudeCodeTheme } from '../utils/misc.js';
import { DEFAULT_SETTINGS } from '../utils/types.js';
import { SettingsContext } from '../App.js';

interface ThinkingVerbsViewProps {
  onBack: () => void;
}

export function ThinkingVerbsView({ onBack }: ThinkingVerbsViewProps) {
  const {
    settings: {
      thinkingVerbs: { useHaikuGenerated, punctuation, verbs },
      themes,
    },
    updateSettings,
  } = useContext(SettingsContext);

  const options = useHaikuGenerated
    ? (['useHaikuGenerated'] as const)
    : (['useHaikuGenerated', 'punctuation', 'verbs'] as const);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const selectedOption = options[selectedOptionIndex];
  const [selectedVerbIndex, setSelectedVerbIndex] = useState(0);
  const [editingVerb, setEditingVerb] = useState(false);
  const [verbInput, setVerbInput] = useState('');
  const [addingNewVerb, setAddingNewVerb] = useState(false);
  const [editingPunctuation, setEditingPunctuation] = useState(false);
  const [punctuationInput, setPunctuationInput] = useState(punctuation);
  // Get current Claude theme and color
  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme =
    themes.find(t => t.id === currentThemeId) ||
    themes.find(t => t.id === 'dark');
  const claudeColor = currentTheme?.colors.claude || 'rgb(215,119,87)';

  useInput((input, key) => {
    if (editingPunctuation) {
      if (key.return) {
        updateSettings(settings => {
          settings.thinkingVerbs.punctuation = punctuationInput;
        });
        setEditingPunctuation(false);
      } else if (key.escape) {
        setPunctuationInput(punctuation);
        setEditingPunctuation(false);
      } else if (key.backspace || key.delete) {
        setPunctuationInput(prev => prev.slice(0, -1));
      } else if (input) {
        setPunctuationInput(prev => prev + input);
      }
      return;
    }

    if (editingVerb || addingNewVerb) {
      if (key.return && verbInput.trim()) {
        if (addingNewVerb) {
          updateSettings(settings => {
            settings.thinkingVerbs.verbs.push(verbInput.trim());
          });
          setAddingNewVerb(false);
        } else {
          updateSettings(settings => {
            settings.thinkingVerbs.verbs[selectedVerbIndex] = verbInput.trim();
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
    } else if (key.return) {
      if (selectedOption === 'punctuation') {
        setPunctuationInput(punctuation);
        setEditingPunctuation(true);
      }
    } else if (key.tab) {
      if (key.shift) {
        // Shift+Tab: go backwards
        setSelectedOptionIndex(prev =>
          prev === 0 ? options.length - 1 : prev - 1
        );
      } else {
        // Tab: go forwards
        setSelectedOptionIndex(prev =>
          prev === options.length - 1 ? 0 : prev + 1
        );
      }
    } else if (key.upArrow) {
      if (
        selectedOption === 'verbs' &&
        !useHaikuGenerated &&
        verbs.length > 0
      ) {
        setSelectedVerbIndex(prev => (prev > 0 ? prev - 1 : verbs.length - 1));
      }
    } else if (key.downArrow) {
      if (
        selectedOption === 'verbs' &&
        !useHaikuGenerated &&
        verbs.length > 0
      ) {
        setSelectedVerbIndex(prev => (prev < verbs.length - 1 ? prev + 1 : 0));
      }
    } else if (input === ' ') {
      if (selectedOption === 'useHaikuGenerated') {
        updateSettings(settings => {
          settings.thinkingVerbs.useHaikuGenerated =
            !settings.thinkingVerbs.useHaikuGenerated;
        });
        setSelectedOptionIndex(0); // Reset to first option when toggling
      }
    } else if (
      input === 'e' &&
      selectedOption === 'verbs' &&
      !useHaikuGenerated
    ) {
      // Edit verb
      if (verbs.length > 0) {
        setVerbInput(verbs[selectedVerbIndex]);
        setEditingVerb(true);
      }
    } else if (
      input === 'd' &&
      selectedOption === 'verbs' &&
      !useHaikuGenerated
    ) {
      // Delete verb
      if (verbs.length > 1) {
        updateSettings(settings => {
          settings.thinkingVerbs.verbs = settings.thinkingVerbs.verbs.filter(
            (_, index) => index !== selectedVerbIndex
          );
        });
        if (selectedVerbIndex >= verbs.length - 1) {
          setSelectedVerbIndex(Math.max(0, verbs.length - 2));
        }
      }
    } else if (
      input === 'n' &&
      selectedOption === 'verbs' &&
      !useHaikuGenerated
    ) {
      // Add new verb
      setAddingNewVerb(true);
      setVerbInput('');
    } else if (
      key.ctrl &&
      input === 'r' &&
      selectedOption === 'verbs' &&
      !useHaikuGenerated
    ) {
      // Reset to default
      updateSettings(settings => {
        settings.thinkingVerbs.verbs = [
          ...DEFAULT_SETTINGS.thinkingVerbs.verbs,
        ];
      });
      setSelectedVerbIndex(0);
    }
  });

  const checkboxChar = useHaikuGenerated ? 'x' : ' ';
  const previewWidth = useHaikuGenerated ? 0 : 50;

  return (
    <Box>
      <Box
        flexDirection="column"
        width={useHaikuGenerated ? '100%' : `${100 - previewWidth}%`}
      >
        <Box marginBottom={1} flexDirection="column">
          <Text bold backgroundColor="#ffd500" color="black">
            {' '}
            Thinking verbs{' '}
          </Text>
          <Box>
            <Text dimColor>
              {selectedOption === 'punctuation'
                ? 'enter to edit punctuation'
                : 'changes auto-saved'}
            </Text>
          </Box>
          <Box>
            <Text dimColor>esc to go back</Text>
          </Box>
        </Box>

        <Box>
          <Text>
            <Text
              color={
                selectedOption === 'useHaikuGenerated' ? 'yellow' : undefined
              }
            >
              {selectedOption === 'useHaikuGenerated' ? '❯ ' : '  '}
            </Text>
            <Text
              bold
              color={
                selectedOption === 'useHaikuGenerated' ? 'yellow' : undefined
              }
            >
              Use Haiku-generated verbs
            </Text>
          </Text>
        </Box>

        {selectedOption === 'useHaikuGenerated' && (
          <Text dimColor>{'  '}space to toggle</Text>
        )}

        <Box marginLeft={2} marginBottom={1}>
          <Text>
            [{checkboxChar}] {useHaikuGenerated ? 'Enabled' : 'Disabled'}
          </Text>
        </Box>

        {useHaikuGenerated ? (
          <Box marginLeft={2} marginBottom={1}>
            <Text dimColor>
              Claude Code will automatically generate verbs using Claude Haiku
              3.5 based on your session.
            </Text>
          </Box>
        ) : (
          <>
            <Box marginLeft={2} marginBottom={1}>
              <Text dimColor>
                A hard-coded selection of verbs will be used, defined below.
              </Text>
            </Box>

            <Box flexDirection="column">
              <Text>
                <Text
                  color={
                    selectedOption === 'punctuation' ? 'yellow' : undefined
                  }
                >
                  {selectedOption === 'punctuation' ? '❯ ' : '  '}
                </Text>
                <Text
                  bold
                  color={
                    selectedOption === 'punctuation' ? 'yellow' : undefined
                  }
                >
                  Punctuation
                </Text>
              </Text>
              {selectedOption === 'punctuation' &&
                (editingPunctuation ? (
                  <Text dimColor>{'  '}enter to save</Text>
                ) : (
                  <Text dimColor>{'  '}enter to edit</Text>
                ))}
            </Box>

            <Box marginLeft={2} marginBottom={1}>
              <Box
                borderStyle="round"
                borderColor={editingPunctuation ? 'yellow' : 'gray'}
              >
                <Text>
                  {editingPunctuation ? punctuationInput : punctuation}
                </Text>
              </Box>
            </Box>

            <Box>
              <Text>
                <Text color={selectedOption === 'verbs' ? 'yellow' : undefined}>
                  {selectedOption === 'verbs' ? '❯ ' : '  '}
                </Text>
                <Text
                  bold
                  color={selectedOption === 'verbs' ? 'yellow' : undefined}
                >
                  Verbs
                </Text>
              </Text>
            </Box>

            {selectedOption === 'verbs' && (
              <Box flexDirection="column">
                <Text dimColor>
                  {'  '}e to edit · d to delete · n to add new · ctrl+r to reset
                </Text>
              </Box>
            )}

            <Box marginLeft={2} marginBottom={1}>
              <Box flexDirection="column">
                {(() => {
                  const maxVisible = 8; // Show 8 verbs at a time
                  const startIndex = Math.max(
                    0,
                    selectedVerbIndex - Math.floor(maxVisible / 2)
                  );
                  const endIndex = Math.min(
                    verbs.length,
                    startIndex + maxVisible
                  );
                  const adjustedStartIndex = Math.max(0, endIndex - maxVisible);

                  const visibleVerbs = verbs.slice(
                    adjustedStartIndex,
                    endIndex
                  );

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
                            color={
                              selectedOption === 'verbs' &&
                              actualIndex === selectedVerbIndex
                                ? 'cyan'
                                : undefined
                            }
                          >
                            {selectedOption === 'verbs' &&
                            actualIndex === selectedVerbIndex
                              ? '❯ '
                              : '  '}
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
          </>
        )}
      </Box>

      {!useHaikuGenerated && (
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
                ✻ {verbs[selectedVerbIndex]}
                {punctuation}{' '}
              </Text>
              <Text color={currentTheme?.colors.secondaryText}>
                (10s · ↑ 456 tokens · esc to interrupt)
              </Text>
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
