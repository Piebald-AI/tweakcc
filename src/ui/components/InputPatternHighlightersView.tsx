import { useState, useContext } from 'react';
import { Box, Text, useInput } from 'ink';

import { InputPatternHighlighter } from '@/types';
import { getCurrentClaudeCodeTheme } from '@/utils';
import { DEFAULT_SETTINGS } from '@/defaultSettings';

import { InputPatternHighlighterEditView } from './InputPatternHighlighterEditView';
import Header from './Header';
import { SettingsContext } from '../App';

interface InputPatternHighlightersViewProps {
  onBack: () => void;
}

export function InputPatternHighlightersView({
  onBack,
}: InputPatternHighlightersViewProps) {
  const {
    settings: { inputPatternHighlighters, themes },
    updateSettings,
  } = useContext(SettingsContext);

  // Get current theme colors
  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme = themes.find(t => t.id === currentThemeId) || themes[0];

  const defaultTheme = DEFAULT_SETTINGS.themes[0]; // Dark mode theme
  const successColor =
    currentTheme?.colors.success || defaultTheme.colors.success;
  const errorColor = currentTheme?.colors.error || defaultTheme.colors.error;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingHighlighterIndex, setEditingHighlighterIndex] = useState<
    number | null
  >(null);
  const [inputActive, setInputActive] = useState(true);

  const handleCreateHighlighter = () => {
    const newHighlighter: InputPatternHighlighter = {
      name: 'New Highlighter',
      regex: '',
      regexFlags: 'g',
      format: '{MATCH}',
      styling: [],
      foregroundColor: 'rgb(255,0,255)', // Default to custom magenta
      backgroundColor: null,
      enabled: true,
    };

    updateSettings(settings => {
      settings.inputPatternHighlighters.push(newHighlighter);
    });

    setEditingHighlighterIndex(inputPatternHighlighters.length);
    setInputActive(false);
  };

  const handleDeleteHighlighter = (index: number) => {
    updateSettings(settings => {
      settings.inputPatternHighlighters.splice(index, 1);
    });

    if (selectedIndex >= inputPatternHighlighters.length - 1) {
      setSelectedIndex(Math.max(0, inputPatternHighlighters.length - 2));
    }
  };

  const handleToggleEnabled = (index: number) => {
    updateSettings(settings => {
      settings.inputPatternHighlighters[index].enabled =
        !settings.inputPatternHighlighters[index].enabled;
    });
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    updateSettings(settings => {
      const item = settings.inputPatternHighlighters[index];
      settings.inputPatternHighlighters.splice(index, 1);
      settings.inputPatternHighlighters.splice(index - 1, 0, item);
    });
    setSelectedIndex(index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (index >= inputPatternHighlighters.length - 1) return;
    updateSettings(settings => {
      const item = settings.inputPatternHighlighters[index];
      settings.inputPatternHighlighters.splice(index, 1);
      settings.inputPatternHighlighters.splice(index + 1, 0, item);
    });
    setSelectedIndex(index + 1);
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow && inputPatternHighlighters.length > 0) {
        setSelectedIndex(prev =>
          Math.min(inputPatternHighlighters.length - 1, prev + 1)
        );
      } else if (key.return && inputPatternHighlighters.length > 0) {
        setEditingHighlighterIndex(selectedIndex);
        setInputActive(false);
      } else if (input === 'n') {
        handleCreateHighlighter();
      } else if (input === 'x' && inputPatternHighlighters.length > 0) {
        handleDeleteHighlighter(selectedIndex);
      } else if (input === ' ' && inputPatternHighlighters.length > 0) {
        handleToggleEnabled(selectedIndex);
      } else if (
        input === 'u' &&
        inputPatternHighlighters.length > 0 &&
        selectedIndex > 0
      ) {
        handleMoveUp(selectedIndex);
      } else if (
        input === 'd' &&
        inputPatternHighlighters.length > 0 &&
        selectedIndex < inputPatternHighlighters.length - 1
      ) {
        handleMoveDown(selectedIndex);
      }
    },
    { isActive: inputActive }
  );

  // Handle editing highlighter view
  if (editingHighlighterIndex !== null) {
    return (
      <InputPatternHighlighterEditView
        highlighterIndex={editingHighlighterIndex}
        onBack={() => {
          setEditingHighlighterIndex(null);
          setInputActive(true);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Header>Input Pattern Highlighters</Header>
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>
          Create custom highlighters for patterns in your input prompt.
        </Text>
        <Text dimColor>
          Matched text will be styled and optionally reformatted.
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>n to create a new highlighter</Text>
        {inputPatternHighlighters.length > 0 && (
          <Text dimColor>space to toggle enabled/disabled</Text>
        )}
        {inputPatternHighlighters.length > 0 && (
          <Text dimColor>u/d to move highlighter up/down</Text>
        )}
        {inputPatternHighlighters.length > 0 && (
          <Text dimColor>x to delete a highlighter</Text>
        )}
        {inputPatternHighlighters.length > 0 && (
          <Text dimColor>enter to edit highlighter</Text>
        )}
        <Text dimColor>esc to go back</Text>
      </Box>

      {inputPatternHighlighters.length === 0 ? (
        <Text>No highlighters created yet. Press n to create one.</Text>
      ) : (
        <Box flexDirection="column">
          {inputPatternHighlighters.map((highlighter, index) => {
            const isSelected = selectedIndex === index;

            // Determine the color for the entire line
            let lineColor: string | undefined = undefined;
            if (isSelected) {
              lineColor = 'yellow';
            }

            return (
              <Box key={index} flexDirection="row">
                <Text color={lineColor}>
                  {isSelected ? '❯ ' : '  '}
                  {highlighter.enabled ? '● ' : '○ '}
                  {highlighter.name}{' '}
                </Text>

                <Text dimColor>(</Text>

                {highlighter.regex ? (
                  <Text dimColor>
                    /{highlighter.regex}/{highlighter.regexFlags}
                  </Text>
                ) : (
                  <Text dimColor>(no regex)</Text>
                )}

                {highlighter.styling.length > 0 && (
                  <>
                    <Text color={lineColor} dimColor={!highlighter.enabled}>
                      {' '}
                      · {highlighter.styling.join(', ')}
                    </Text>
                  </>
                )}

                <Text dimColor>)</Text>

                {highlighter.enabled ? (
                  <Text color={successColor}> enabled</Text>
                ) : (
                  <Text color={errorColor}> disabled</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
