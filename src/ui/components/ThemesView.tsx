import { useState, useContext } from 'react';
import { Box, Text, useInput } from 'ink';

import { Theme } from '@/types.js';
import { DEFAULT_SETTINGS } from '@/defaultSettings.js';

import { SettingsContext } from '../App.js';
import { ThemeEditView } from './ThemeEditView.js';
import { ThemePreview } from './ThemePreview.js';
import Header from './Header.js';

function generateThemeItems(themes: Theme[]): string[] {
  return themes.map(theme => `${theme.name} (${theme.id})`);
}

interface ThemesViewProps {
  onBack: () => void;
}

export function ThemesView({ onBack }: ThemesViewProps) {
  const {
    settings: { themes },
    updateSettings,
  } = useContext(SettingsContext);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [inputActive, setInputActive] = useState(true);

  const handleCreateTheme = () => {
    const baseTheme = themes[0] || DEFAULT_SETTINGS.themes[0];
    const newTheme: Theme = {
      colors: { ...baseTheme.colors },
      name: 'New Custom Theme',
      id: `custom-${Date.now()}`,
    };

    updateSettings(settings => {
      settings.themes.push(newTheme);
    });

    setEditingThemeId(newTheme.id);
    setInputActive(false);
  };

  const handleDeleteTheme = (themeId: string) => {
    if (themes.length <= 1) return; // Don't delete the last theme

    updateSettings(settings => {
      settings.themes = settings.themes.filter(theme => theme.id !== themeId);
    });

    if (selectedIndex >= themes.length - 1) {
      setSelectedIndex(Math.max(0, themes.length - 2));
    }
  };

  const handleResetThemes = () => {
    updateSettings(settings => {
      settings.themes = [...DEFAULT_SETTINGS.themes]; // Copy to avoid mutation later.
    });
    setSelectedIndex(0);
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(themes.length - 1, prev + 1));
      } else if (key.return) {
        const selectedTheme = themes[selectedIndex];
        if (selectedTheme) {
          setEditingThemeId(selectedTheme.id);
          setInputActive(false);
        }
      } else if (input === 'n') {
        handleCreateTheme();
      } else if (input === 'd') {
        const selectedTheme = themes[selectedIndex];
        if (selectedTheme) {
          handleDeleteTheme(selectedTheme.id);
        }
      } else if (key.ctrl && input === 'r') {
        handleResetThemes();
      }
    },
    { isActive: inputActive }
  );

  // Handle editing theme view after all hooks are called
  if (editingThemeId) {
    return (
      <ThemeEditView
        themeId={editingThemeId}
        onBack={() => {
          setEditingThemeId(null);
          setInputActive(true);
        }}
      />
    );
  }

  const themeItems = generateThemeItems(themes);
  const selectedTheme =
    themes.find(t => themeItems[selectedIndex]?.includes(`(${t.id})`)) ||
    themes[0];

  // If no themes exist, show a message
  if (themes.length === 0) {
    return (
      <Box>
        <Box flexDirection="column" width="100%">
          <Header>Themes</Header>
          <Box marginBottom={1} flexDirection="column">
            <Text dimColor>n to create a new theme</Text>
            <Text dimColor>esc to go back</Text>
          </Box>
          <Text>No themes available!</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Box flexDirection="column" width="50%">
        <Header>Themes</Header>
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>n to create a new theme</Text>
          <Text dimColor>d to delete a theme</Text>
          <Text dimColor>ctrl+r to delete all themes and restore built-in</Text>
          <Text dimColor>enter to edit theme</Text>
          <Text dimColor>esc to go back</Text>
        </Box>

        <Box flexDirection="column">
          {themeItems.map((item, index) => (
            <Text
              key={index}
              color={selectedIndex === index ? 'yellow' : undefined}
            >
              {selectedIndex === index ? '❯ ' : '  '}
              {item}
            </Text>
          ))}
        </Box>
      </Box>

      <Box width="50%">
        <ThemePreview theme={selectedTheme} />
      </Box>
    </Box>
  );
}
