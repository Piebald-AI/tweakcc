import { useState, useContext, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ThemePreview } from './ThemePreview.js';
import { ColoredColorName } from './ColoredColorName.js';
import { ColorPicker } from './ColorPicker.js';
import { Theme } from '../utils/types.js';
import { SettingsContext } from '../App.js';
import { isValidColorFormat, normalizeColorToRgb } from '../utils/misc.js';

interface ThemeEditViewProps {
  onBack: () => void;
  themeId: string;
}

type ColorFormat = 'rgb' | 'hex' | 'hsl';

export function ThemeEditView({ onBack, themeId }: ThemeEditViewProps) {
  const {
    settings: { themes },
    updateSettings,
  } = useContext(SettingsContext);

  const [currentThemeId, setCurrentThemeId] = useState(themeId);
  const currentTheme = themes.find(t => t.id === currentThemeId) || themes[0];

  const [colorFormat, setColorFormat] = useState<ColorFormat>('rgb');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(
    null
  );
  const [editingNameId, setEditingNameId] = useState<'name' | 'id' | null>(
    null
  );
  const [editingValue, setEditingValue] = useState('');
  const [originalValue, setOriginalValue] = useState('');

  const updateTheme = useCallback(
    (updateFn: (theme: Theme) => void) => {
      updateSettings(settings => {
        const themeIndex = settings.themes.findIndex(
          t => t.id === currentThemeId
        );
        if (themeIndex !== -1) {
          updateFn(settings.themes[themeIndex]);
        }
      });
    },
    [currentThemeId, updateSettings]
  );

  const handlePastedColor = (pastedText: string) => {
    if (selectedIndex >= 2 && isValidColorFormat(pastedText)) {
      const normalizedColor = normalizeColorToRgb(pastedText);
      const colorIndex = selectedIndex - 2;
      const colorKey = colorKeys[colorIndex];

      updateTheme(theme => {
        theme.colors[colorKey] = normalizedColor;
      });
    }
  };

  useInput((input, key) => {
    if (editingColorIndex === null && editingNameId === null) {
      // Handle pasted text (multi-character input indicates paste)
      if (input.length > 1 && !key.ctrl && !key.meta) {
        handlePastedColor(input);
        return;
      }

      // Handle navigation when not editing
      if (key.escape) {
        onBack();
      } else if (key.ctrl && input === 'a') {
        setColorFormat(prev => {
          if (prev === 'rgb') return 'hex';
          if (prev === 'hex') return 'hsl';
          return 'rgb';
        });
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(colorKeys.length + 1, prev + 1));
      } else if (key.return) {
        if (selectedIndex === 0) {
          // Edit theme name
          setEditingNameId('name');
          setEditingValue(currentTheme.name);
          setOriginalValue(currentTheme.name);
        } else if (selectedIndex === 1) {
          // Edit theme id
          setEditingNameId('id');
          setEditingValue(currentTheme.id);
          setOriginalValue(currentTheme.id);
        } else {
          // Start editing the selected color
          const colorIndex = selectedIndex - 2;
          const colorKey = colorKeys[colorIndex];
          const currentValue = currentTheme.colors[colorKey];
          setEditingColorIndex(colorIndex);
          setEditingValue(currentValue);
          setOriginalValue(currentValue);
        }
      }
    } else if (editingColorIndex !== null) {
      // Handle Ctrl+A when editing color (ColorPicker handles other keys)
      if (key.ctrl && input === 'a') {
        setColorFormat(prev => {
          if (prev === 'rgb') return 'hex';
          if (prev === 'hex') return 'hsl';
          return 'rgb';
        });
      }
    } else if (editingNameId !== null) {
      // Handle text input when editing name/id
      if (key.return) {
        if (editingNameId === 'id') {
          // For ID changes, update currentThemeId first, then update the theme
          const oldThemeId = currentThemeId;
          setCurrentThemeId(editingValue);
          updateSettings(settings => {
            const themeIndex = settings.themes.findIndex(
              t => t.id === oldThemeId
            );
            if (themeIndex !== -1) {
              settings.themes[themeIndex].id = editingValue;
            }
          });
        } else {
          // For name changes, use the normal updateTheme function
          updateTheme(theme => {
            theme.name = editingValue;
          });
        }
        setEditingNameId(null);
        setEditingValue('');
        setOriginalValue('');
      } else if (key.escape) {
        setEditingNameId(null);
        setEditingValue('');
        setOriginalValue('');
      } else if (key.backspace || key.delete) {
        setEditingValue(prev => prev.slice(0, -1));
      } else if (input) {
        setEditingValue(prev => prev + input);
      }
    }
  });

  const colorKeys = Object.keys(currentTheme.colors) as Array<
    keyof typeof currentTheme.colors
  >;

  const formatColor = (color: string, format: ColorFormat): string => {
    // Parse the RGB color and convert to desired format
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!rgbMatch) return color; // Return as-is if not RGB format

    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);

    switch (format) {
      case 'hex': {
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }

      case 'hsl': {
        // Convert RGB to HSL
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;

        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        const diff = max - min;

        // Calculate lightness
        const l = (max + min) / 2;

        // Calculate saturation
        let s = 0;
        if (diff !== 0) {
          s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
        }

        // Calculate hue
        let h = 0;
        if (diff !== 0) {
          if (max === rNorm) {
            h = ((gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0)) / 6;
          } else if (max === gNorm) {
            h = ((bNorm - rNorm) / diff + 2) / 6;
          } else {
            h = ((rNorm - gNorm) / diff + 4) / 6;
          }
        }

        return `hsl(${Math.round(h * 360)}, ${Math.round(
          s * 100
        )}%, ${Math.round(l * 100)}%)`;
      }

      case 'rgb':
      default:
        return color; // Already in RGB format
    }
  };

  const getColorDescription = (
    key: keyof typeof currentTheme.colors
  ): string => {
    const descriptions: Record<keyof typeof currentTheme.colors, string> = {
      claude:
        'Claude branding color.  Used for the Claude logo, the welcome message, and the thinking text.',
      text: 'Code color.  Used in diffs.',
      inverseText:
        'Inverse text color.  Used for the text of tabs, where the background is filled in.',
      secondaryText:
        'Secondary/dimmed text.  Used for keyboard shortcuts and other help text.',
      secondaryBorder: 'Secondary border color.  Used for various boxes.',
      suggestion:
        'Suggestion text color.  Used for suggestions for theme names and various other things.',
      remember:
        'Remember/note color.  Used for various text relating to memories.',
      success:
        'Success indicator.  Used for the bullet on successful tool calls, and various success messages (such as sign in successful).',
      error: 'Error indicator',
      warning: 'Warning indicator',
      autoAccept: 'Auto-accept mode indicator',
      bashBorder: 'Bash command border',
      permission: 'Permission prompt color',
      planMode: 'Plan mode indicator',
      diffAdded: 'Added diff background',
      diffRemoved: 'Removed diff background',
      diffAddedDimmed: 'Added diff background (dimmed)',
      diffRemovedDimmed: 'Removed diff background (dimmed)',
      diffAddedWord: 'Added word highlight',
      diffRemovedWord: 'Removed word highlight',
      diffAddedWordDimmed: 'Added word highlight (dimmed)',
      diffRemovedWordDimmed: 'Removed word highlight (dimmed)',
    };
    return descriptions[key] || '';
  };

  const maxKeyLength = Math.max(...colorKeys.map(key => key.length));

  return (
    <Box>
      <Box flexDirection="column" width="50%">
        <Box>
          <Text backgroundColor="#ffd500" color="black" bold>
            {' '}
            Editing theme &ldquo;{currentTheme.name}&rdquo; ({currentTheme.id}
            ){' '}
          </Text>
        </Box>

        {editingColorIndex === null && editingNameId === null ? (
          <>
            <Box marginBottom={1} flexDirection="column">
              <Text dimColor>enter to edit theme name, id, or color</Text>
              <Text dimColor>ctrl+a to toggle rgb, hex, hsl</Text>
              <Text dimColor>paste color from clipboard (when on color)</Text>
              <Text dimColor>esc to go back</Text>
            </Box>

            {selectedIndex < 2 ? (
              <Box
                marginBottom={1}
                borderStyle="single"
                borderTop={false}
                borderBottom={false}
                borderRight={false}
                borderColor="yellow"
                flexDirection="column"
                paddingLeft={1}
              >
                <Text bold>
                  {selectedIndex === 0 ? 'Theme Name' : 'Theme ID'}
                </Text>
                <Text>
                  {selectedIndex === 0
                    ? 'The display name for this theme'
                    : 'Unique identifier for this theme; used in `.claude.json` to select the theme.'}
                </Text>
              </Box>
            ) : (
              <Box
                marginBottom={1}
                borderStyle="single"
                borderTop={false}
                borderBottom={false}
                borderRight={false}
                borderColor={currentTheme.colors[colorKeys[selectedIndex - 2]]}
                flexDirection="column"
                paddingLeft={1}
              >
                <ColoredColorName
                  colorKey={colorKeys[selectedIndex - 2]}
                  theme={currentTheme}
                  bold
                />
                <Text>{getColorDescription(colorKeys[selectedIndex - 2])}</Text>
              </Box>
            )}

            <Box flexDirection="column">
              <Box>
                <Text color={selectedIndex === 0 ? 'yellow' : 'white'}>
                  {selectedIndex === 0 ? '❯ ' : '  '}
                </Text>
                <Text bold>Name: </Text>
                <Text>{currentTheme.name}</Text>
              </Box>
              <Box marginBottom={1}>
                <Text color={selectedIndex === 1 ? 'yellow' : 'white'}>
                  {selectedIndex === 1 ? '❯ ' : '  '}
                </Text>
                <Text bold>ID: </Text>
                <Text>{currentTheme.id}</Text>
              </Box>

              {colorKeys.map((key, index) => {
                const adjustedIndex = index + 2;
                return (
                  <Box key={key}>
                    <Text
                      color={
                        selectedIndex === adjustedIndex ? 'yellow' : 'white'
                      }
                    >
                      {selectedIndex === adjustedIndex ? '❯ ' : '  '}
                    </Text>
                    <Box width={maxKeyLength + 2}>
                      <Text>
                        <ColoredColorName
                          colorKey={key}
                          theme={currentTheme}
                          bold
                        />
                      </Text>
                    </Box>
                    <Text color={currentTheme.colors[key]}>
                      {formatColor(currentTheme.colors[key], colorFormat)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </>
        ) : editingNameId ? (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              Editing {editingNameId === 'name' ? 'theme name' : 'theme ID'}:
            </Text>
            <Box borderStyle="round" borderColor="yellow" paddingX={1}>
              <Text>{editingValue}</Text>
            </Box>
            <Text dimColor>enter to save, esc to cancel</Text>
          </Box>
        ) : (
          <ColorPicker
            initialValue={originalValue}
            colorKey={colorKeys[editingColorIndex!]}
            theme={currentTheme}
            onColorChange={color => {
              setEditingValue(color);
              // Update the theme live for preview and auto-save
              updateTheme(theme => {
                theme.colors[colorKeys[editingColorIndex!]] = color;
              });
            }}
            onExit={() => {
              // Save the final editing value before exiting
              updateTheme(theme => {
                theme.colors[colorKeys[editingColorIndex!]] = editingValue;
              });
              setEditingColorIndex(null);
              setEditingValue('');
              setOriginalValue('');
            }}
            onCancel={() => {
              // Restore original value and exit
              updateTheme(theme => {
                theme.colors[colorKeys[editingColorIndex!]] = originalValue;
              });
              setEditingColorIndex(null);
              setEditingValue('');
              setOriginalValue('');
            }}
          />
        )}
      </Box>

      <Box width="50%">
        <ThemePreview theme={currentTheme} />
      </Box>
    </Box>
  );
}
