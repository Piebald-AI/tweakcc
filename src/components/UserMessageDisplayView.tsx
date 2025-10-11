import { useState, useContext, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ColorPicker } from './ColorPicker.js';
import { SettingsContext } from '../App.js';
import {
  UserMessageDisplayElementConfig,
  DEFAULT_SETTINGS,
} from '../utils/types.js';
import { getCurrentClaudeCodeTheme } from '../utils/misc.js';
import Header from './Header.js';

interface UserMessageDisplayViewProps {
  onBack: () => void;
}

const STYLING_OPTIONS = [
  { label: 'bold', value: 'bold' },
  { label: 'italic', value: 'italic' },
  { label: 'underline', value: 'underline' },
  { label: 'strikethrough', value: 'strikethrough' },
  { label: 'inverse', value: 'inverse' },
];

export function UserMessageDisplayView({
  onBack,
}: UserMessageDisplayViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);

  // Track which column is active (prefix or message)
  const [activeColumn, setActiveColumn] = useState<'prefix' | 'message'>(
    'prefix'
  );

  // Prefix state - initialize from settings
  const [prefixSelectedOptionIndex, setPrefixSelectedOptionIndex] = useState(0);
  const [prefixEditingFormat, setPrefixEditingFormat] = useState(false);
  const [prefixFormatInput, setPrefixFormatInput] = useState(
    () => settings.userMessageDisplay.prefix.format
  );
  const [prefixStylingIndex, setPrefixStylingIndex] = useState(0);
  const [prefixActiveStylings, setPrefixActiveStylings] = useState<string[]>(
    () => [...settings.userMessageDisplay.prefix.styling]
  );
  const [prefixForegroundColor, setPrefixForegroundColor] = useState(
    () => settings.userMessageDisplay.prefix.foreground_color
  );
  const [prefixBackgroundColor, setPrefixBackgroundColor] = useState(
    () => settings.userMessageDisplay.prefix.background_color
  );

  // Message state - initialize from settings
  const [messageSelectedOptionIndex, setMessageSelectedOptionIndex] =
    useState(0);
  const [messageStylingIndex, setMessageStylingIndex] = useState(0);
  const [messageActiveStylings, setMessageActiveStylings] = useState<string[]>(
    () => [...settings.userMessageDisplay.message.styling]
  );
  const [messageForegroundColor, setMessageForegroundColor] = useState(
    () => settings.userMessageDisplay.message.foreground_color
  );
  const [messageBackgroundColor, setMessageBackgroundColor] = useState(
    () => settings.userMessageDisplay.message.background_color
  );

  // Shared state for color picker
  const [colorPickerMode, setColorPickerMode] = useState<{
    column: 'prefix' | 'message';
    type: 'foreground' | 'background';
  } | null>(null);
  const [originalColor, setOriginalColor] = useState('');

  // Get current theme
  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme =
    settings.themes?.find(t => t.id === currentThemeId) || settings.themes?.[0];

  const prefixOptions = [
    'format',
    'styling',
    'foreground',
    'background',
  ] as const;
  const messageOptions = ['styling', 'foreground', 'background'] as const;

  const selectedPrefixOption = prefixOptions[prefixSelectedOptionIndex];
  const selectedMessageOption = messageOptions[messageSelectedOptionIndex];

  // Update element config and save to settings
  const updateElementConfig = (
    elementType: 'prefix' | 'message',
    updater: (config: UserMessageDisplayElementConfig) => void
  ) => {
    updateSettings(settings => {
      const config =
        elementType === 'prefix'
          ? settings.userMessageDisplay.prefix
          : settings.userMessageDisplay.message;
      updater(config);
    });
  };

  // Restore element to original/default settings
  const restoreToOriginal = (elementType: 'prefix' | 'message') => {
    updateSettings(settings => {
      if (elementType === 'prefix') {
        settings.userMessageDisplay.prefix = {
          ...DEFAULT_SETTINGS.userMessageDisplay.prefix,
        };
      } else {
        settings.userMessageDisplay.message = {
          ...DEFAULT_SETTINGS.userMessageDisplay.message,
        };
      }
    });

    // Update UI state
    if (elementType === 'prefix') {
      setPrefixFormatInput(DEFAULT_SETTINGS.userMessageDisplay.prefix.format);
      setPrefixActiveStylings([
        ...DEFAULT_SETTINGS.userMessageDisplay.prefix.styling,
      ]);
      setPrefixForegroundColor(
        DEFAULT_SETTINGS.userMessageDisplay.prefix.foreground_color
      );
      setPrefixBackgroundColor(
        DEFAULT_SETTINGS.userMessageDisplay.prefix.background_color
      );
    } else {
      setMessageActiveStylings([
        ...DEFAULT_SETTINGS.userMessageDisplay.message.styling,
      ]);
      setMessageForegroundColor(
        DEFAULT_SETTINGS.userMessageDisplay.message.foreground_color
      );
      setMessageBackgroundColor(
        DEFAULT_SETTINGS.userMessageDisplay.message.background_color
      );
    }
  };

  // Load existing configuration when component mounts
  useEffect(() => {
    const prefixConfig = settings.userMessageDisplay.prefix;
    setPrefixFormatInput(prefixConfig.format);
    setPrefixActiveStylings([...prefixConfig.styling]);
    setPrefixForegroundColor(prefixConfig.foreground_color);
    setPrefixBackgroundColor(prefixConfig.background_color);

    const messageConfig = settings.userMessageDisplay.message;
    setMessageActiveStylings([...messageConfig.styling]);
    setMessageForegroundColor(messageConfig.foreground_color);
    setMessageBackgroundColor(messageConfig.background_color);
  }, []);

  useInput((input, key) => {
    // Handle format editing for prefix
    if (prefixEditingFormat) {
      if (key.return) {
        updateElementConfig('prefix', config => {
          config.format = prefixFormatInput;
        });
        setPrefixEditingFormat(false);
      } else if (key.escape) {
        const config = settings.userMessageDisplay.prefix;
        setPrefixFormatInput(config.format);
        setPrefixEditingFormat(false);
      } else if (key.backspace || key.delete) {
        setPrefixFormatInput(prev => prev.slice(0, -1));
      } else if (input) {
        setPrefixFormatInput(prev => prev + input);
      }
      return;
    }

    if (colorPickerMode !== null) {
      return;
    }

    if (key.escape) {
      onBack();
    } else if (key.ctrl && input === 'r') {
      restoreToOriginal(activeColumn);
    } else if (key.leftArrow || key.rightArrow) {
      // Switch between columns
      setActiveColumn(prev => (prev === 'prefix' ? 'message' : 'prefix'));
    } else if (key.tab) {
      // Navigate within active column
      if (activeColumn === 'prefix') {
        if (key.shift) {
          setPrefixSelectedOptionIndex(prev =>
            prev === 0 ? prefixOptions.length - 1 : prev - 1
          );
        } else {
          setPrefixSelectedOptionIndex(prev =>
            prev === prefixOptions.length - 1 ? 0 : prev + 1
          );
        }
      } else {
        if (key.shift) {
          setMessageSelectedOptionIndex(prev =>
            prev === 0 ? messageOptions.length - 1 : prev - 1
          );
        } else {
          setMessageSelectedOptionIndex(prev =>
            prev === messageOptions.length - 1 ? 0 : prev + 1
          );
        }
      }
    } else if (key.return) {
      if (activeColumn === 'prefix') {
        if (selectedPrefixOption === 'format') {
          setPrefixEditingFormat(true);
        } else if (selectedPrefixOption === 'foreground') {
          setOriginalColor(prefixForegroundColor);
          setColorPickerMode({ column: 'prefix', type: 'foreground' });
        } else if (selectedPrefixOption === 'background') {
          setOriginalColor(prefixBackgroundColor);
          setColorPickerMode({ column: 'prefix', type: 'background' });
        }
      } else {
        if (selectedMessageOption === 'foreground') {
          setOriginalColor(messageForegroundColor);
          setColorPickerMode({ column: 'message', type: 'foreground' });
        } else if (selectedMessageOption === 'background') {
          setOriginalColor(messageBackgroundColor);
          setColorPickerMode({ column: 'message', type: 'background' });
        }
      }
    } else if (key.upArrow) {
      if (activeColumn === 'prefix' && selectedPrefixOption === 'styling') {
        setPrefixStylingIndex(prev => Math.max(0, prev - 1));
      } else if (
        activeColumn === 'message' &&
        selectedMessageOption === 'styling'
      ) {
        setMessageStylingIndex(prev => Math.max(0, prev - 1));
      }
    } else if (key.downArrow) {
      if (activeColumn === 'prefix' && selectedPrefixOption === 'styling') {
        setPrefixStylingIndex(prev =>
          Math.min(STYLING_OPTIONS.length - 1, prev + 1)
        );
      } else if (
        activeColumn === 'message' &&
        selectedMessageOption === 'styling'
      ) {
        setMessageStylingIndex(prev =>
          Math.min(STYLING_OPTIONS.length - 1, prev + 1)
        );
      }
    } else if (input === ' ') {
      if (activeColumn === 'prefix' && selectedPrefixOption === 'styling') {
        const option = STYLING_OPTIONS[prefixStylingIndex].value;
        const newStylings =
          prefixActiveStylings.indexOf(option) >= 0
            ? prefixActiveStylings.filter(s => s !== option)
            : [...prefixActiveStylings, option];
        setPrefixActiveStylings(newStylings);
        updateElementConfig('prefix', config => {
          config.styling = [...newStylings];
        });
      } else if (
        activeColumn === 'message' &&
        selectedMessageOption === 'styling'
      ) {
        const option = STYLING_OPTIONS[messageStylingIndex].value;
        const newStylings =
          messageActiveStylings.indexOf(option) >= 0
            ? messageActiveStylings.filter(s => s !== option)
            : [...messageActiveStylings, option];
        setMessageActiveStylings(newStylings);
        updateElementConfig('message', config => {
          config.styling = [...newStylings];
        });
      }
    }
  });

  // Apply styling to preview text
  const applyStylesToText = (
    text: string,
    elementType: 'prefix' | 'message',
    useConfig: boolean = true
  ) => {
    const styling = useConfig
      ? elementType === 'prefix'
        ? prefixActiveStylings
        : messageActiveStylings
      : [];
    const fgColor = useConfig
      ? elementType === 'prefix'
        ? prefixForegroundColor
        : messageForegroundColor
      : 'rgb(255,255,255)';
    const bgColor = useConfig
      ? elementType === 'prefix'
        ? prefixBackgroundColor
        : messageBackgroundColor
      : 'rgb(0,0,0)';

    // Check if both colors are black (which means "no color" in the patching logic)
    const isBlackOnBlack = fgColor === 'rgb(0,0,0)' && bgColor === 'rgb(0,0,0)';
    const hasStyling = styling.length > 0;

    // If black on black with no styling, don't apply any colors (use defaults)
    if (isBlackOnBlack && !hasStyling) {
      return <Text>{text}</Text>;
    }

    return (
      <Text
        bold={styling.includes('bold')}
        italic={styling.includes('italic')}
        underline={styling.includes('underline')}
        strikethrough={styling.includes('strikethrough')}
        inverse={styling.includes('inverse')}
        color={isBlackOnBlack ? undefined : fgColor}
        backgroundColor={isBlackOnBlack ? undefined : bgColor}
      >
        {text}
      </Text>
    );
  };

  // Create preview showing prefix followed by message
  const createMixedStylePreview = (useConfig: boolean = true) => {
    const messageSampleText = 'list the dir';

    return (
      <Text>
        {prefixFormatInput && (
          <>{applyStylesToText(prefixFormatInput, 'prefix', useConfig)} </>
        )}
        {applyStylesToText(messageSampleText, 'message', useConfig)}
      </Text>
    );
  };

  // Render element configuration column
  const renderElementColumn = (elementType: 'prefix' | 'message') => {
    const isActive = activeColumn === elementType;
    const options = elementType === 'prefix' ? prefixOptions : messageOptions;
    const selectedOptionIndex =
      elementType === 'prefix'
        ? prefixSelectedOptionIndex
        : messageSelectedOptionIndex;
    const selectedOption = options[selectedOptionIndex];
    const stylingIndex =
      elementType === 'prefix' ? prefixStylingIndex : messageStylingIndex;
    const activeStylings =
      elementType === 'prefix' ? prefixActiveStylings : messageActiveStylings;
    const foregroundColor =
      elementType === 'prefix' ? prefixForegroundColor : messageForegroundColor;
    const backgroundColor =
      elementType === 'prefix' ? prefixBackgroundColor : messageBackgroundColor;

    return (
      <Box
        flexDirection="column"
        width="45%"
        borderStyle={isActive ? 'round' : 'single'}
        borderColor={isActive ? 'yellow' : 'gray'}
        padding={1}
      >
        <Box marginBottom={1}>
          <Text bold color={isActive ? 'yellow' : undefined}>
            {elementType.charAt(0).toUpperCase() + elementType.slice(1)}{' '}
            Configuration
          </Text>
        </Box>

        {/* Format Section - only for prefix */}
        {elementType === 'prefix' && (
          <>
            <Box>
              <Text
                color={
                  isActive && selectedOption === 'format' ? 'yellow' : undefined
                }
                bold={isActive && selectedOption === 'format'}
              >
                {isActive && selectedOption === 'format' ? '❯ ' : '  '}Prefix
                Text
              </Text>
            </Box>

            {isActive && selectedOption === 'format' && (
              <Box marginLeft={2}>
                <Text dimColor>
                  {prefixEditingFormat
                    ? 'enter to save'
                    : 'enter to edit (appears before message)'}
                </Text>
              </Box>
            )}

            <Box marginLeft={2} marginBottom={1}>
              <Box
                borderStyle="round"
                borderColor={prefixEditingFormat ? 'yellow' : 'gray'}
              >
                <Text>{prefixFormatInput}</Text>
              </Box>
            </Box>
          </>
        )}

        {/* Styling Section */}
        <Box>
          <Text
            color={
              isActive && selectedOption === 'styling' ? 'yellow' : undefined
            }
            bold={isActive && selectedOption === 'styling'}
          >
            {isActive && selectedOption === 'styling' ? '❯ ' : '  '}Styling
          </Text>
        </Box>

        {isActive && selectedOption === 'styling' && (
          <Box marginLeft={2}>
            <Text dimColor>up/down to navigate · space to toggle</Text>
          </Box>
        )}

        <Box marginLeft={2} marginBottom={1} flexDirection="column">
          {STYLING_OPTIONS.map((option, index) => (
            <Box key={option.value}>
              <Text
                color={
                  isActive &&
                  selectedOption === 'styling' &&
                  stylingIndex === index
                    ? 'cyan'
                    : undefined
                }
              >
                {isActive &&
                selectedOption === 'styling' &&
                stylingIndex === index
                  ? '❯ '
                  : '  '}
                {activeStylings.includes(option.value) ? '●' : '○'}{' '}
                {option.label}
              </Text>
            </Box>
          ))}
        </Box>

        {/* Foreground Color Section */}
        <Box>
          <Text
            color={
              isActive && selectedOption === 'foreground' ? 'yellow' : undefined
            }
            bold={isActive && selectedOption === 'foreground'}
          >
            {isActive && selectedOption === 'foreground' ? '❯ ' : '  '}
            Foreground color
          </Text>
        </Box>

        {isActive && selectedOption === 'foreground' && (
          <Box marginLeft={2}>
            <Text dimColor>enter to open color picker</Text>
          </Box>
        )}

        <Box marginLeft={2} marginBottom={1}>
          <Text color={foregroundColor}>{foregroundColor}</Text>
        </Box>

        {/* Background Color Section */}
        <Box>
          <Text
            color={
              isActive && selectedOption === 'background' ? 'yellow' : undefined
            }
            bold={isActive && selectedOption === 'background'}
          >
            {isActive && selectedOption === 'background' ? '❯ ' : '  '}
            Background color
          </Text>
        </Box>

        {isActive && selectedOption === 'background' && (
          <Box marginLeft={2}>
            <Text dimColor>enter to open color picker</Text>
          </Box>
        )}

        <Box marginLeft={2}>
          <Text backgroundColor={backgroundColor}>{backgroundColor}</Text>
        </Box>
      </Box>
    );
  };

  // Color picker mode
  if (colorPickerMode) {
    const { column, type } = colorPickerMode;
    return (
      <ColorPicker
        initialValue={originalColor}
        theme={currentTheme}
        onColorChange={color => {
          if (column === 'prefix') {
            if (type === 'foreground') {
              setPrefixForegroundColor(color);
              updateElementConfig('prefix', config => {
                config.foreground_color = color;
              });
            } else {
              setPrefixBackgroundColor(color);
              updateElementConfig('prefix', config => {
                config.background_color = color;
              });
            }
          } else {
            if (type === 'foreground') {
              setMessageForegroundColor(color);
              updateElementConfig('message', config => {
                config.foreground_color = color;
              });
            } else {
              setMessageBackgroundColor(color);
              updateElementConfig('message', config => {
                config.background_color = color;
              });
            }
          }
        }}
        onExit={() => {
          setColorPickerMode(null);
          setOriginalColor('');
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Header>Customize how user messages are displayed</Header>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>
          left/right arrows to switch columns · tab to navigate options
        </Text>
        <Text dimColor>
          enter to edit · ctrl+r to reset active column · esc to go back
        </Text>
      </Box>

      <Box flexDirection="row" gap={1}>
        {/* Prefix Configuration Column */}
        {renderElementColumn('prefix')}

        {/* Message Configuration Column */}
        {renderElementColumn('message')}
      </Box>

      {/* Preview Panel */}
      <Box borderStyle="round" padding={1} marginTop={1}>
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Preview</Text>
          </Box>

          <Box flexDirection="row" gap={2}>
            {/* Before (Original) */}
            <Box flexDirection="column" width="50%">
              <Box marginBottom={1}>
                <Text underline>Before (Claude Code default):</Text>
              </Box>
              <Box marginLeft={1} marginTop={1}>
                <Text>
                  <Text
                    color={currentTheme?.colors?.inactive || '#888888'}
                  >
                    ●
                  </Text>
                  <Text> The directory </Text>
                  <Text color={currentTheme?.colors?.permission || '#00ff00'}>
                    C:\Users\user
                  </Text>
                  <Text> contains </Text>
                  <Text bold>123</Text>
                  <Text> files.</Text>
                </Text>
              </Box>
            </Box>

            {/* After (Customized) */}
            <Box flexDirection="column" width="50%">
              <Box marginBottom={1}>
                <Text underline>After (Your customization):</Text>
              </Box>
              <Box marginLeft={1}>{createMixedStylePreview(true)}</Box>
              <Box marginLeft={1} marginTop={1}>
                <Text>
                  <Text
                    color={currentTheme?.colors?.inactive || '#888888'}
                  >
                    ●
                  </Text>
                  <Text> The directory </Text>
                  <Text color={currentTheme?.colors?.permission || '#00ff00'}>
                    C:\Users\user
                  </Text>
                  <Text> contains </Text>
                  <Text bold>123</Text>
                  <Text> files.</Text>
                </Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
