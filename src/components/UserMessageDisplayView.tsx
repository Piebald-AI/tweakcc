import { useState, useContext } from 'react';
import { Box, BoxProps, Text, useInput } from 'ink';
import { ColorPicker } from './ColorPicker.js';
import { SettingsContext } from '../App.js';
import { DEFAULT_SETTINGS, UserMessageDisplayConfig } from '../utils/types.js';
import { getCurrentClaudeCodeTheme } from '../utils/misc.js';
import Header from './Header.js';
import { useNonInitialEffect } from '../hooks/useNonInitialEffect.js';

type Writable<T> = { -readonly [P in keyof T]: T[P] };

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

const BORDER_STYLE_OPTIONS: Array<{
  label: string;
  value: UserMessageDisplayConfig['borderStyle'];
}> = [
  { label: 'none', value: 'none' },
  { label: 'single', value: 'single' },
  { label: 'double', value: 'double' },
  { label: 'round', value: 'round' },
  { label: 'bold', value: 'bold' },
  { label: 'singleDouble', value: 'singleDouble' },
  { label: 'doubleSingle', value: 'doubleSingle' },
  { label: 'classic', value: 'classic' },
  { label: 'topBottomSingle', value: 'topBottomSingle' },
  { label: 'topBottomDouble', value: 'topBottomDouble' },
  { label: 'topBottomBold', value: 'topBottomBold' },
];

type ColorMode = 'default' | 'custom';
type ColorPickerType = 'foreground' | 'background' | 'border';

export function UserMessageDisplayView({
  onBack,
}: UserMessageDisplayViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);

  const [editingFormat, setEditingFormat] = useState(false);
  const [editingPaddingX, setEditingPaddingX] = useState(false);
  const [editingPaddingY, setEditingPaddingY] = useState(false);
  const [formatInput, setFormatInput] = useState(
    () => settings.userMessageDisplay.format
  );
  const [paddingXInput, setPaddingXInput] = useState(() =>
    String(settings.userMessageDisplay.paddingX)
  );
  const [paddingYInput, setPaddingYInput] = useState(() =>
    String(settings.userMessageDisplay.paddingY)
  );
  const [fitBoxToContent, setFitBoxToContent] = useState(
    settings.userMessageDisplay.fitBoxToContent
  );
  const [stylingIndex, setStylingIndex] = useState(0);
  const [activeStylings, setActiveStylings] = useState<string[]>(() => [
    ...settings.userMessageDisplay.styling,
  ]);

  // Foreground color state
  const [foregroundMode, setForegroundMode] = useState<ColorMode>(() =>
    settings.userMessageDisplay.foregroundColor === 'default'
      ? 'default'
      : 'custom'
  );
  const [foregroundColor, setForegroundColor] = useState(() =>
    settings.userMessageDisplay.foregroundColor === 'default'
      ? 'rgb(255,255,255)'
      : settings.userMessageDisplay.foregroundColor
  );

  // Background color state
  const [backgroundMode, setBackgroundMode] = useState<
    'default' | 'none' | 'custom'
  >(() => {
    const bg = settings.userMessageDisplay.backgroundColor;
    if (bg === null) return 'none';
    if (bg === 'default') return 'default';
    return 'custom';
  });
  const [backgroundColor, setBackgroundColor] = useState(() => {
    const bg = settings.userMessageDisplay.backgroundColor;
    return bg === null || bg === 'default' ? 'rgb(0,0,0)' : bg;
  });

  // Border state
  const [borderStyleIndex, setBorderStyleIndex] = useState(() =>
    BORDER_STYLE_OPTIONS.findIndex(
      opt => opt.value === settings.userMessageDisplay.borderStyle
    )
  );
  const [borderColor, setBorderColor] = useState(
    () => settings.userMessageDisplay.borderColor
  );

  // Color picker state
  const [colorPickerType, setColorPickerType] =
    useState<ColorPickerType | null>(null);
  const [originalColor, setOriginalColor] = useState('');

  // Get current theme
  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme =
    settings.themes?.find(t => t.id === currentThemeId) || settings.themes?.[0];

  // Track which column is active
  const [activeColumn, setActiveColumn] = useState<'text' | 'border'>('text');

  const textOptions = [
    'format',
    'styling',
    'foreground',
    'background',
  ] as const;
  const borderOptions = [
    'borderStyle',
    'borderColor',
    'paddingX',
    'paddingY',
    'fitBoxToContent',
  ] as const;

  const [textSelectedIndex, setTextSelectedIndex] = useState(0);
  const [borderSelectedIndex, setBorderSelectedIndex] = useState(0);

  const selectedOption =
    activeColumn === 'text'
      ? textOptions[textSelectedIndex]
      : borderOptions[borderSelectedIndex];

  // Save to settings
  const saveToSettings = () => {
    updateSettings(settings => {
      settings.userMessageDisplay.format = formatInput;
      settings.userMessageDisplay.styling = [...activeStylings];
      settings.userMessageDisplay.foregroundColor =
        foregroundMode === 'default' ? 'default' : foregroundColor;
      settings.userMessageDisplay.backgroundColor =
        backgroundMode === 'none'
          ? null
          : backgroundMode === 'default'
            ? 'default'
            : backgroundColor;
      settings.userMessageDisplay.borderStyle =
        BORDER_STYLE_OPTIONS[borderStyleIndex].value;
      settings.userMessageDisplay.borderColor = borderColor;
      settings.userMessageDisplay.paddingX = parseInt(paddingXInput) || 0;
      settings.userMessageDisplay.paddingY = parseInt(paddingYInput) || 0;
      settings.userMessageDisplay.fitBoxToContent = fitBoxToContent;
    });
  };

  // Restore to default settings
  const restoreToOriginal = () => {
    setFormatInput(DEFAULT_SETTINGS.userMessageDisplay.format);
    setActiveStylings([...DEFAULT_SETTINGS.userMessageDisplay.styling]);
    setForegroundMode('default');
    setForegroundColor('rgb(255,255,255)');
    setBackgroundMode('none');
    setBackgroundColor('rgb(0,0,0)');
    setBorderStyleIndex(
      BORDER_STYLE_OPTIONS.findIndex(
        opt => opt.value === DEFAULT_SETTINGS.userMessageDisplay.borderStyle
      )
    );
    setBorderColor(DEFAULT_SETTINGS.userMessageDisplay.borderColor);
    setPaddingXInput(String(DEFAULT_SETTINGS.userMessageDisplay.paddingX));
    setPaddingYInput(String(DEFAULT_SETTINGS.userMessageDisplay.paddingY));
    setFitBoxToContent(DEFAULT_SETTINGS.userMessageDisplay.fitBoxToContent);

    updateSettings(settings => {
      settings.userMessageDisplay = { ...DEFAULT_SETTINGS.userMessageDisplay };
    });
  };

  // Auto-save settings when any value changes (skip initial mount)
  useNonInitialEffect(() => {
    saveToSettings();
  }, [
    formatInput,
    activeStylings,
    foregroundMode,
    foregroundColor,
    backgroundMode,
    backgroundColor,
    borderStyleIndex,
    borderColor,
    paddingXInput,
    paddingYInput,
    fitBoxToContent,
  ]);

  useInput((input, key) => {
    // Handle format editing
    if (editingFormat) {
      if (key.return) {
        setEditingFormat(false);
      } else if (key.escape) {
        setFormatInput(settings.userMessageDisplay.format);
        setEditingFormat(false);
      } else if (key.backspace || key.delete) {
        setFormatInput(prev => prev.slice(0, -1));
      } else if (input) {
        setFormatInput(prev => prev + input);
      }
      return;
    }

    // Handle paddingX editing
    if (editingPaddingX) {
      if (key.return) {
        setEditingPaddingX(false);
      } else if (key.escape) {
        setPaddingXInput(String(settings.userMessageDisplay.paddingX));
        setEditingPaddingX(false);
      } else if (key.backspace || key.delete) {
        setPaddingXInput(prev => prev.slice(0, -1));
      } else if (input && /^\d$/.test(input)) {
        setPaddingXInput(prev => prev + input);
      }
      return;
    }

    // Handle paddingY editing
    if (editingPaddingY) {
      if (key.return) {
        setEditingPaddingY(false);
      } else if (key.escape) {
        setPaddingYInput(String(settings.userMessageDisplay.paddingY));
        setEditingPaddingY(false);
      } else if (key.backspace || key.delete) {
        setPaddingYInput(prev => prev.slice(0, -1));
      } else if (input && /^\d$/.test(input)) {
        setPaddingYInput(prev => prev + input);
      }
      return;
    }

    if (colorPickerType !== null) {
      return;
    }

    if (key.escape) {
      onBack();
    } else if (key.ctrl && input === 'r') {
      restoreToOriginal();
    } else if (key.leftArrow || key.rightArrow) {
      // Switch between columns
      setActiveColumn(prev => (prev === 'text' ? 'border' : 'text'));
    } else if (key.tab) {
      // Navigate within active column
      if (activeColumn === 'text') {
        if (key.shift) {
          setTextSelectedIndex(prev =>
            prev === 0 ? textOptions.length - 1 : prev - 1
          );
        } else {
          setTextSelectedIndex(prev =>
            prev === textOptions.length - 1 ? 0 : prev + 1
          );
        }
      } else {
        if (key.shift) {
          setBorderSelectedIndex(prev =>
            prev === 0 ? borderOptions.length - 1 : prev - 1
          );
        } else {
          setBorderSelectedIndex(prev =>
            prev === borderOptions.length - 1 ? 0 : prev + 1
          );
        }
      }
    } else if (key.return) {
      if (selectedOption === 'format') {
        setEditingFormat(true);
      } else if (selectedOption === 'paddingX') {
        setEditingPaddingX(true);
      } else if (selectedOption === 'paddingY') {
        setEditingPaddingY(true);
      } else if (selectedOption === 'foreground') {
        if (foregroundMode === 'custom') {
          setOriginalColor(foregroundColor);
          setColorPickerType('foreground');
        }
      } else if (selectedOption === 'background') {
        if (backgroundMode === 'custom') {
          setOriginalColor(backgroundColor);
          setColorPickerType('background');
        }
      } else if (selectedOption === 'borderColor') {
        setOriginalColor(borderColor);
        setColorPickerType('border');
      }
    } else if (key.upArrow) {
      if (selectedOption === 'styling') {
        setStylingIndex(prev => Math.max(0, prev - 1));
      } else if (selectedOption === 'borderStyle') {
        setBorderStyleIndex(prev =>
          prev === 0 ? BORDER_STYLE_OPTIONS.length - 1 : prev - 1
        );
      } else if (selectedOption === 'foreground') {
        setForegroundMode(prev => {
          const nextMode = prev === 'default' ? 'custom' : 'default';
          // Ensure foregroundColor has a valid value when switching to custom mode
          if (
            nextMode === 'custom' &&
            (!foregroundColor || foregroundColor === '')
          ) {
            setForegroundColor('rgb(255,255,255)');
          }
          return nextMode;
        });
      } else if (selectedOption === 'background') {
        setBackgroundMode(prev => {
          const nextMode =
            prev === 'default'
              ? 'custom'
              : prev === 'custom'
                ? 'none'
                : 'default';
          // Ensure backgroundColor has a valid value when switching to custom mode
          if (
            nextMode === 'custom' &&
            (!backgroundColor || backgroundColor === '')
          ) {
            setBackgroundColor('rgb(0,0,0)');
          }
          return nextMode;
        });
      }
    } else if (key.downArrow) {
      if (selectedOption === 'styling') {
        setStylingIndex(prev => Math.min(STYLING_OPTIONS.length - 1, prev + 1));
      } else if (selectedOption === 'borderStyle') {
        setBorderStyleIndex(prev =>
          prev === BORDER_STYLE_OPTIONS.length - 1 ? 0 : prev + 1
        );
      } else if (selectedOption === 'foreground') {
        setForegroundMode(prev => {
          const nextMode = prev === 'default' ? 'custom' : 'default';
          // Ensure foregroundColor has a valid value when switching to custom mode
          if (
            nextMode === 'custom' &&
            (!foregroundColor || foregroundColor === '')
          ) {
            setForegroundColor('rgb(255,255,255)');
          }
          return nextMode;
        });
      } else if (selectedOption === 'background') {
        setBackgroundMode(prev => {
          const nextMode =
            prev === 'default'
              ? 'none'
              : prev === 'none'
                ? 'custom'
                : 'default';
          // Ensure backgroundColor has a valid value when switching to custom mode
          if (
            nextMode === 'custom' &&
            (!backgroundColor || backgroundColor === '')
          ) {
            setBackgroundColor('rgb(0,0,0)');
          }
          return nextMode;
        });
      }
    } else if (input === ' ') {
      if (selectedOption === 'styling') {
        const option = STYLING_OPTIONS[stylingIndex].value;
        const newStylings =
          activeStylings.indexOf(option) >= 0
            ? activeStylings.filter(s => s !== option)
            : [...activeStylings, option];
        setActiveStylings(newStylings);
      } else if (selectedOption === 'fitBoxToContent') {
        setFitBoxToContent(prev => !prev);
      }
    }
  });

  // Apply styling to preview text
  const applyStylesToText = (text: string) => {
    const fgColor =
      foregroundMode === 'default'
        ? currentTheme?.colors?.text
        : foregroundColor;
    const bgColor =
      backgroundMode === 'none'
        ? undefined
        : backgroundMode === 'default'
          ? currentTheme?.colors?.userMessageBackground
          : backgroundColor;

    const borderStyle = BORDER_STYLE_OPTIONS[borderStyleIndex].value;
    const paddingX = parseInt(paddingXInput) || 0;
    const paddingY = parseInt(paddingYInput) || 0;

    const styledText = (
      <Text
        bold={activeStylings.includes('bold')}
        italic={activeStylings.includes('italic')}
        underline={activeStylings.includes('underline')}
        strikethrough={activeStylings.includes('strikethrough')}
        inverse={activeStylings.includes('inverse')}
        color={fgColor}
        backgroundColor={bgColor}
      >
        {text}
      </Text>
    );

    // Handle custom top/bottom-only borders
    const isTopBottomBorder =
      borderStyle === 'topBottomSingle' ||
      borderStyle === 'topBottomDouble' ||
      borderStyle === 'topBottomBold';

    if (isTopBottomBorder) {
      // Render custom top/bottom borders as text
      const borderChar =
        borderStyle === 'topBottomSingle'
          ? '─'
          : borderStyle === 'topBottomDouble'
            ? '═'
            : '━';
      const textLength = text.length + paddingX * 2;
      const borderLine = borderChar.repeat(textLength);

      return (
        <Box flexDirection="column">
          <Text color={borderColor}>{borderLine}</Text>
          {paddingY > 0 && <Box height={paddingY} />}
          <Box paddingX={paddingX}>{styledText}</Box>
          {paddingY > 0 && <Box height={paddingY} />}
          <Text color={borderColor}>{borderLine}</Text>
        </Box>
      );
    } else if (
      borderStyle !== 'none' ||
      paddingX > 0 ||
      paddingY > 0 ||
      fitBoxToContent
    ) {
      const content =
        paddingX > 0 || paddingY > 0 ? (
          <Box paddingX={paddingX} paddingY={paddingY}>
            {styledText}
          </Box>
        ) : (
          styledText
        );

      const boxProps: Partial<Writable<BoxProps>> = {};
      if (borderStyle !== 'none') {
        boxProps.borderStyle = borderStyle;
        boxProps.borderColor = borderColor;
      }
      if (fitBoxToContent) {
        boxProps.alignSelf = 'flex-start';
      } else {
        boxProps.flexGrow = 1;
      }

      return borderStyle === 'none' ? (
        content
      ) : (
        <Box {...boxProps}>{content}</Box>
      );
    } else {
      return styledText;
    }
  };

  // Create preview with format string
  const createPreview = () => {
    const messageSampleText = 'list the dir';
    const formattedText = formatInput.replace(/\{\}/g, messageSampleText);
    return applyStylesToText(formattedText);
  };

  // Color picker mode
  if (colorPickerType) {
    return (
      <ColorPicker
        initialValue={originalColor}
        theme={currentTheme}
        onColorChange={color => {
          if (colorPickerType === 'foreground') {
            setForegroundColor(color);
          } else if (colorPickerType === 'background') {
            setBackgroundColor(color);
          } else if (colorPickerType === 'border') {
            setBorderColor(color);
          }
        }}
        onExit={() => {
          setColorPickerType(null);
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
        <Text dimColor>enter to edit · ctrl+r to reset · esc to go back</Text>
      </Box>

      <Box flexDirection="row" gap={1}>
        {/* Text Styling Column */}
        <Box
          flexDirection="column"
          width="50%"
          borderStyle={activeColumn === 'text' ? 'round' : 'single'}
          borderColor={activeColumn === 'text' ? 'yellow' : 'gray'}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activeColumn === 'text' ? 'yellow' : undefined}>
              Text & Styling
            </Text>
          </Box>

          {/* Format Section */}
          <Box>
            <Text
              color={selectedOption === 'format' ? 'yellow' : undefined}
              bold={selectedOption === 'format'}
            >
              {selectedOption === 'format' ? '❯ ' : '  '}Format String
            </Text>
          </Box>

          {selectedOption === 'format' && (
            <Box marginLeft={2}>
              <Text dimColor>
                {editingFormat
                  ? 'enter to save · esc to cancel'
                  : 'enter to edit · use {} as message placeholder'}
              </Text>
            </Box>
          )}

          <Box marginLeft={2} marginBottom={1}>
            <Box
              borderStyle="round"
              borderColor={editingFormat ? 'yellow' : 'gray'}
            >
              <Text>{formatInput}</Text>
            </Box>
          </Box>

          {/* Styling Section */}
          <Box>
            <Text
              color={selectedOption === 'styling' ? 'yellow' : undefined}
              bold={selectedOption === 'styling'}
            >
              {selectedOption === 'styling' ? '❯ ' : '  '}Styling
            </Text>
          </Box>

          {selectedOption === 'styling' && (
            <Box marginLeft={2}>
              <Text dimColor>up/down to navigate · space to toggle</Text>
            </Box>
          )}

          <Box marginLeft={2} marginBottom={1} flexDirection="column">
            {STYLING_OPTIONS.map((option, index) => (
              <Box key={option.value}>
                <Text
                  color={
                    selectedOption === 'styling' && stylingIndex === index
                      ? 'cyan'
                      : undefined
                  }
                >
                  {selectedOption === 'styling' && stylingIndex === index
                    ? '❯ '
                    : '  '}
                  {activeStylings.includes(option.value) ? '●' : '○'}{' '}
                  {option.label}
                </Text>
              </Box>
            ))}
          </Box>

          {/* Foreground & Background Color Section */}
          <Box flexDirection="row" gap={1} marginBottom={1}>
            <Box flexDirection="column" width="50%">
              <Box>
                <Text
                  color={selectedOption === 'foreground' ? 'yellow' : undefined}
                  bold={selectedOption === 'foreground'}
                >
                  {selectedOption === 'foreground' ? '❯ ' : '  '}Foreground
                </Text>
              </Box>

              {selectedOption === 'foreground' && (
                <Box marginLeft={2}>
                  <Text dimColor>
                    up/down · {foregroundMode === 'custom' ? 'enter' : ''}
                  </Text>
                </Box>
              )}

              <Box marginLeft={2} flexDirection="column">
                <Box>
                  <Text>
                    {foregroundMode === 'default' ? '● ' : '○ '}Default
                  </Text>
                </Box>
                <Box>
                  <Text>
                    {foregroundMode === 'custom' ? '● ' : '○ '}Custom
                    {foregroundMode === 'custom' && ': '}
                    {foregroundMode === 'custom' && (
                      <Text color={foregroundColor}>{foregroundColor}</Text>
                    )}
                  </Text>
                </Box>
              </Box>
            </Box>

            <Box flexDirection="column" width="50%">
              <Box>
                <Text
                  color={selectedOption === 'background' ? 'yellow' : undefined}
                  bold={selectedOption === 'background'}
                >
                  {selectedOption === 'background' ? '❯ ' : '  '}Background
                </Text>
              </Box>

              {selectedOption === 'background' && (
                <Box marginLeft={2}>
                  <Text dimColor>
                    up/down · {backgroundMode === 'custom' ? 'enter' : ''}
                  </Text>
                </Box>
              )}

              <Box marginLeft={2} flexDirection="column">
                <Box>
                  <Text>
                    {backgroundMode === 'default' ? '● ' : '○ '}Default
                  </Text>
                </Box>
                <Box>
                  <Text>{backgroundMode === 'none' ? '● ' : '○ '}None</Text>
                </Box>
                <Box>
                  <Text>
                    {backgroundMode === 'custom' ? '● ' : '○ '}Custom
                    {backgroundMode === 'custom' && ': '}
                    {backgroundMode === 'custom' && (
                      <Text backgroundColor={backgroundColor}>
                        {backgroundColor}
                      </Text>
                    )}
                  </Text>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Border & Padding Column */}
        <Box
          flexDirection="column"
          width="50%"
          borderStyle={activeColumn === 'border' ? 'round' : 'single'}
          borderColor={activeColumn === 'border' ? 'yellow' : 'gray'}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activeColumn === 'border' ? 'yellow' : undefined}>
              Border & Padding
            </Text>
          </Box>

          {/* Border Style Section */}
          <Box>
            <Text
              color={selectedOption === 'borderStyle' ? 'yellow' : undefined}
              bold={selectedOption === 'borderStyle'}
            >
              {selectedOption === 'borderStyle' ? '❯ ' : '  '}Border Style
            </Text>
          </Box>

          {selectedOption === 'borderStyle' && (
            <Box marginLeft={2}>
              <Text dimColor>up/down to navigate</Text>
            </Box>
          )}

          <Box marginLeft={2} marginBottom={1} flexDirection="row">
            <Box flexDirection="column" width="50%">
              {BORDER_STYLE_OPTIONS.slice(0, 6).map((option, index) => (
                <Box key={option.value}>
                  <Text
                    color={
                      selectedOption === 'borderStyle' &&
                      borderStyleIndex === index
                        ? 'cyan'
                        : undefined
                    }
                  >
                    {selectedOption === 'borderStyle' &&
                    borderStyleIndex === index
                      ? '❯ '
                      : '  '}
                    {borderStyleIndex === index ? '● ' : '○ '}
                    {option.label}
                  </Text>
                </Box>
              ))}
            </Box>
            <Box flexDirection="column" width="50%">
              {BORDER_STYLE_OPTIONS.slice(6).map((option, index) => {
                const actualIndex = index + 6;
                return (
                  <Box key={option.value}>
                    <Text
                      color={
                        selectedOption === 'borderStyle' &&
                        borderStyleIndex === actualIndex
                          ? 'cyan'
                          : undefined
                      }
                    >
                      {selectedOption === 'borderStyle' &&
                      borderStyleIndex === actualIndex
                        ? '❯ '
                        : '  '}
                      {borderStyleIndex === actualIndex ? '● ' : '○ '}
                      {option.label}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Border Color Section */}
          <Box>
            <Text
              color={selectedOption === 'borderColor' ? 'yellow' : undefined}
              bold={selectedOption === 'borderColor'}
            >
              {selectedOption === 'borderColor' ? '❯ ' : '  '}Border Color
            </Text>
          </Box>

          {selectedOption === 'borderColor' && (
            <Box marginLeft={2}>
              <Text dimColor>enter to pick color</Text>
            </Box>
          )}

          <Box marginLeft={2} marginBottom={1}>
            <Text color={borderColor}>{borderColor}</Text>
          </Box>

          {/* Padding X & Y Section */}
          <Box flexDirection="row" gap={1}>
            <Box flexDirection="column" width="33%">
              <Box>
                <Text
                  color={selectedOption === 'paddingX' ? 'yellow' : undefined}
                  bold={selectedOption === 'paddingX'}
                >
                  {selectedOption === 'paddingX' ? '❯ ' : '  '}Padding X
                </Text>
              </Box>

              {selectedOption === 'paddingX' && (
                <Box marginLeft={2}>
                  <Text dimColor>
                    {editingPaddingX ? 'enter/esc' : 'enter'}
                  </Text>
                </Box>
              )}

              <Box marginLeft={2}>
                <Box
                  borderStyle="round"
                  borderColor={editingPaddingX ? 'yellow' : 'gray'}
                >
                  <Text>{paddingXInput}</Text>
                </Box>
              </Box>
            </Box>

            <Box flexDirection="column" width="33%">
              <Box>
                <Text
                  color={selectedOption === 'paddingY' ? 'yellow' : undefined}
                  bold={selectedOption === 'paddingY'}
                >
                  {selectedOption === 'paddingY' ? '❯ ' : '  '}Padding Y
                </Text>
              </Box>

              {selectedOption === 'paddingY' && (
                <Box marginLeft={2}>
                  <Text dimColor>
                    {editingPaddingY ? 'enter/esc' : 'enter'}
                  </Text>
                </Box>
              )}

              <Box marginLeft={2}>
                <Box
                  borderStyle="round"
                  borderColor={editingPaddingY ? 'yellow' : 'gray'}
                >
                  <Text>{paddingYInput}</Text>
                </Box>
              </Box>
            </Box>

            <Box flexDirection="column" width="33%">
              <Box>
                <Text
                  color={
                    selectedOption === 'fitBoxToContent' ? 'yellow' : undefined
                  }
                  bold={selectedOption === 'fitBoxToContent'}
                >
                  {selectedOption === 'fitBoxToContent' ? '❯ ' : '  '}
                  {fitBoxToContent ? '●' : '○'} Fit box to content
                </Text>
              </Box>

              {selectedOption === 'fitBoxToContent' && (
                <Box marginLeft={2}>
                  <Text dimColor>space</Text>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Preview Panel */}
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Box marginBottom={1}>
          <Text bold>Preview</Text>
        </Box>

        <Box flexDirection="row" gap={2}>
          {/* Before (Original) */}
          <Box flexDirection="column" width="50%">
            <Box marginBottom={1}>
              <Text underline>Before (Claude Code default):</Text>
            </Box>
            <Box marginLeft={1}>
              <Text
                backgroundColor={currentTheme?.colors?.userMessageBackground}
                color={currentTheme?.colors?.text}
              >
                {' '}&gt; list the dir{' '}
              </Text>
            </Box>
            <Box marginLeft={1} marginTop={1}>
              <Text>
                <Text color={currentTheme?.colors?.inactive || '#888888'}>
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
            <Box marginLeft={1} flexDirection="row">
              {createPreview()}
            </Box>
            <Box marginLeft={1} marginTop={1}>
              <Text>
                <Text color={currentTheme?.colors?.inactive || '#888888'}>
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
  );
}
