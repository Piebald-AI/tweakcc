import React, { useState, useContext, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { SettingsContext } from '../App';
import Header from './Header';
import { ColorPicker } from './ColorPicker';
import { getCurrentClaudeCodeTheme } from '@/utils';

interface InputPatternHighlighterEditViewProps {
  highlighterIndex: number;
  onBack: () => void;
}

const STYLING_OPTIONS = [
  { label: 'bold', value: 'bold' },
  { label: 'italic', value: 'italic' },
  { label: 'underline', value: 'underline' },
  { label: 'strikethrough', value: 'strikethrough' },
  { label: 'inverse', value: 'inverse' },
];

type FieldName =
  | 'name'
  | 'regex'
  | 'regexFlags'
  | 'format'
  | 'styling'
  | 'foreground'
  | 'background'
  | 'enabled'
  | 'testText';

type ColorMode = 'none' | 'custom';
type ColorPickerType = 'foreground' | 'background';

// Row-based field navigation - defined outside component to avoid recreation
const FIELD_ROWS: FieldName[][] = [
  ['name', 'regex', 'regexFlags'],
  ['format', 'styling'],
  ['foreground', 'background'],
  ['enabled'],
  ['testText'],
];

// Helper component to render highlighted test text
interface HighlightedTestTextProps {
  testText: string;
  regex: string;
  regexFlags: string;
  format: string;
  styling: string[];
  foregroundColor?: string;
  backgroundColor?: string;
}

function HighlightedTestText({
  testText,
  regex,
  regexFlags,
  format,
  styling,
  foregroundColor,
  backgroundColor,
}: HighlightedTestTextProps) {
  const parts: React.ReactNode[] = [];

  try {
    const flags = regexFlags.includes('g') ? regexFlags : regexFlags + 'g';
    const re = new RegExp(regex, flags);
    const matches = [...testText.matchAll(re)];

    if (matches.length === 0) {
      return <Text>{testText}</Text>;
    }

    let lastIndex = 0;
    matches.forEach((match, i) => {
      const matchStart = match.index!;
      const matchEnd = matchStart + match[0].length;

      if (matchStart > lastIndex) {
        parts.push(
          <Text key={`plain-${i}`}>
            {testText.slice(lastIndex, matchStart)}
          </Text>
        );
      }

      const formattedMatch = format.replace(/\{MATCH\}/g, match[0]);
      parts.push(
        <Text
          key={`match-${i}`}
          bold={styling.includes('bold')}
          italic={styling.includes('italic')}
          underline={styling.includes('underline')}
          strikethrough={styling.includes('strikethrough')}
          inverse={styling.includes('inverse')}
          color={foregroundColor}
          backgroundColor={backgroundColor}
        >
          {formattedMatch}
        </Text>
      );

      lastIndex = matchEnd;
    });

    if (lastIndex < testText.length) {
      parts.push(<Text key="plain-end">{testText.slice(lastIndex)}</Text>);
    }

    return <>{parts}</>;
  } catch {
    return <Text>{testText}</Text>;
  }
}

export function InputPatternHighlighterEditView({
  highlighterIndex,
  onBack,
}: InputPatternHighlighterEditViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);
  const highlighter = settings.inputPatternHighlighters[highlighterIndex];

  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme =
    settings.themes?.find(t => t.id === currentThemeId) || settings.themes?.[0];

  // Form state - foreground defaults to custom with magenta
  const [name, setName] = useState(highlighter?.name || 'New Highlighter');
  const [regex, setRegex] = useState(highlighter?.regex || '');
  const [regexFlags, setRegexFlags] = useState(highlighter?.regexFlags || 'g');
  const [format, setFormat] = useState(highlighter?.format || '{MATCH}');
  const [styling, setStyling] = useState<string[]>(highlighter?.styling || []);
  const [foregroundMode, setForegroundMode] = useState<ColorMode>(
    highlighter?.foregroundColor === null ? 'none' : 'custom'
  );
  const [foregroundColor, setForegroundColor] = useState(
    highlighter?.foregroundColor || 'rgb(255,0,255)'
  );
  const [backgroundMode, setBackgroundMode] = useState<ColorMode>(
    highlighter?.backgroundColor ? 'custom' : 'none'
  );
  const [backgroundColor, setBackgroundColor] = useState(
    highlighter?.backgroundColor || 'rgb(0,0,0)'
  );
  const [enabled, setEnabled] = useState(highlighter?.enabled ?? true);
  // Global test text from settings
  const [testText, setTestText] = useState(
    settings.inputPatternHighlightersTestText ||
      'Type test text here to see highlighting'
  );

  // UI state
  const [selectedField, setSelectedField] = useState<FieldName>('name');
  const [editingText, setEditingText] = useState(false);
  const [stylingIndex, setStylingIndex] = useState(0);
  const [colorPickerType, setColorPickerType] =
    useState<ColorPickerType | null>(null);
  const [originalColor, setOriginalColor] = useState('');
  const [regexError, setRegexError] = useState<string | null>(null);

  // Row-based field navigation
  const [rowIndex, setRowIndex] = useState(0);
  const [colIndex, setColIndex] = useState(0);

  // Update selectedField when row/col changes
  useEffect(() => {
    const row = FIELD_ROWS[rowIndex];
    const col = Math.min(colIndex, row.length - 1);
    setSelectedField(row[col]);
  }, [rowIndex, colIndex]);

  // Validate regex
  useEffect(() => {
    if (!regex) {
      setRegexError(null);
      return;
    }
    try {
      new RegExp(regex, regexFlags);
      setRegexError(null);
    } catch (e) {
      setRegexError((e as Error).message);
    }
  }, [regex, regexFlags]);

  // Save highlighter settings on change
  useEffect(() => {
    if (highlighterIndex >= 0) {
      updateSettings(settings => {
        if (settings.inputPatternHighlighters[highlighterIndex]) {
          settings.inputPatternHighlighters[highlighterIndex] = {
            name,
            regex,
            regexFlags,
            format,
            styling,
            foregroundColor:
              foregroundMode === 'custom' ? foregroundColor : null,
            backgroundColor:
              backgroundMode === 'custom' ? backgroundColor : null,
            enabled,
          };
        }
      });
    }
  }, [
    highlighterIndex,
    name,
    regex,
    regexFlags,
    format,
    styling,
    foregroundMode,
    foregroundColor,
    backgroundMode,
    backgroundColor,
    enabled,
  ]);

  // Save global test text separately
  useEffect(() => {
    updateSettings(settings => {
      settings.inputPatternHighlightersTestText = testText;
    });
  }, [testText]);

  useInput((input, key) => {
    // Text editing mode
    if (editingText) {
      if (key.return) {
        setEditingText(false);
      } else if (key.escape) {
        if (selectedField === 'name') setName(highlighter?.name || '');
        if (selectedField === 'regex') setRegex(highlighter?.regex || '');
        if (selectedField === 'regexFlags')
          setRegexFlags(highlighter?.regexFlags || 'g');
        if (selectedField === 'format')
          setFormat(highlighter?.format || '{MATCH}');
        if (selectedField === 'testText')
          setTestText(
            settings.inputPatternHighlightersTestText ||
              'Type test text here to see highlighting'
          );
        setEditingText(false);
      } else if (key.backspace || key.delete) {
        if (selectedField === 'name') setName(prev => prev.slice(0, -1));
        if (selectedField === 'regex') setRegex(prev => prev.slice(0, -1));
        if (selectedField === 'regexFlags')
          setRegexFlags(prev => prev.slice(0, -1));
        if (selectedField === 'format') setFormat(prev => prev.slice(0, -1));
        if (selectedField === 'testText')
          setTestText(prev => prev.slice(0, -1));
      } else if (input && input.length === 1) {
        if (selectedField === 'name') setName(prev => prev + input);
        if (selectedField === 'regex') setRegex(prev => prev + input);
        if (selectedField === 'regexFlags') setRegexFlags(prev => prev + input);
        if (selectedField === 'format') setFormat(prev => prev + input);
        if (selectedField === 'testText') setTestText(prev => prev + input);
      }
      return;
    }

    if (colorPickerType !== null) return;

    if (key.escape) {
      onBack();
    } else if (key.upArrow) {
      if (selectedField === 'styling') {
        if (stylingIndex > 0) {
          setStylingIndex(prev => prev - 1);
        } else {
          setRowIndex(prev => Math.max(0, prev - 1));
        }
      } else {
        setRowIndex(prev => Math.max(0, prev - 1));
      }
    } else if (key.downArrow) {
      if (selectedField === 'styling') {
        if (stylingIndex < STYLING_OPTIONS.length - 1) {
          setStylingIndex(prev => prev + 1);
        } else {
          setRowIndex(prev => Math.min(FIELD_ROWS.length - 1, prev + 1));
        }
      } else {
        setRowIndex(prev => Math.min(FIELD_ROWS.length - 1, prev + 1));
      }
    } else if (key.leftArrow) {
      if (selectedField === 'foreground') {
        setForegroundMode(prev => (prev === 'none' ? 'custom' : 'none'));
      } else if (selectedField === 'background') {
        setBackgroundMode(prev => (prev === 'none' ? 'custom' : 'none'));
      } else {
        setColIndex(prev => Math.max(0, prev - 1));
      }
    } else if (key.rightArrow) {
      if (selectedField === 'foreground') {
        setForegroundMode(prev => (prev === 'none' ? 'custom' : 'none'));
      } else if (selectedField === 'background') {
        setBackgroundMode(prev => (prev === 'none' ? 'custom' : 'none'));
      } else {
        const maxCol = FIELD_ROWS[rowIndex].length - 1;
        setColIndex(prev => Math.min(maxCol, prev + 1));
      }
    } else if (key.tab) {
      // Tab moves through all fields linearly
      const allFields = FIELD_ROWS.flat();
      const currentIdx = allFields.indexOf(selectedField);
      if (key.shift) {
        if (currentIdx > 0) {
          const newField = allFields[currentIdx - 1];
          for (let r = 0; r < FIELD_ROWS.length; r++) {
            const c = FIELD_ROWS[r].indexOf(newField);
            if (c >= 0) {
              setRowIndex(r);
              setColIndex(c);
              break;
            }
          }
        }
      } else {
        if (currentIdx < allFields.length - 1) {
          const newField = allFields[currentIdx + 1];
          for (let r = 0; r < FIELD_ROWS.length; r++) {
            const c = FIELD_ROWS[r].indexOf(newField);
            if (c >= 0) {
              setRowIndex(r);
              setColIndex(c);
              break;
            }
          }
        }
      }
    } else if (key.return) {
      if (
        selectedField === 'name' ||
        selectedField === 'regex' ||
        selectedField === 'regexFlags' ||
        selectedField === 'format' ||
        selectedField === 'testText'
      ) {
        setEditingText(true);
      } else if (
        selectedField === 'foreground' &&
        foregroundMode === 'custom'
      ) {
        setOriginalColor(foregroundColor);
        setColorPickerType('foreground');
      } else if (
        selectedField === 'background' &&
        backgroundMode === 'custom'
      ) {
        setOriginalColor(backgroundColor);
        setColorPickerType('background');
      }
    } else if (input === ' ') {
      if (selectedField === 'styling') {
        const option = STYLING_OPTIONS[stylingIndex].value;
        if (styling.includes(option)) {
          setStyling(styling.filter(s => s !== option));
        } else {
          setStyling([...styling, option]);
        }
      } else if (selectedField === 'enabled') {
        setEnabled(!enabled);
      }
    }
  });

  if (!highlighter) {
    return (
      <Box flexDirection="column">
        <Text color="red">Highlighter not found</Text>
      </Box>
    );
  }

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
          }
        }}
        onExit={() => {
          setColorPickerType(null);
          setOriginalColor('');
        }}
      />
    );
  }

  const isFieldSelected = (field: FieldName) => selectedField === field;
  const fieldStyle = (field: FieldName) => ({
    color: isFieldSelected(field) ? 'yellow' : undefined,
    bold: isFieldSelected(field),
  });

  return (
    <Box flexDirection="column">
      <Header>Edit Highlighter</Header>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>
          arrows to navigate · enter to edit · space to toggle · esc to go back
        </Text>
      </Box>

      {/* Row 1: Name, Regex Pattern, Regex Flags */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Box flexDirection="column" width="30%">
          <Text {...fieldStyle('name')}>
            {isFieldSelected('name') ? '❯ ' : '  '}Name
          </Text>
          <Box marginLeft={2}>
            <Box
              borderStyle="round"
              borderColor={
                isFieldSelected('name')
                  ? editingText
                    ? 'green'
                    : 'yellow'
                  : 'gray'
              }
            >
              <Text>{name || '(empty)'}</Text>
            </Box>
          </Box>
        </Box>

        <Box flexDirection="column" width="45%">
          <Text {...fieldStyle('regex')}>
            {isFieldSelected('regex') ? '❯ ' : '  '}Regex Pattern
          </Text>
          <Box marginLeft={2} flexDirection="column">
            <Box
              borderStyle="round"
              borderColor={
                isFieldSelected('regex')
                  ? editingText
                    ? 'green'
                    : 'yellow'
                  : regexError
                    ? 'red'
                    : 'gray'
              }
            >
              <Text>{regex || '(empty)'}</Text>
            </Box>
            {regexError && <Text color="red">{regexError}</Text>}
          </Box>
        </Box>

        <Box flexDirection="column" width="20%">
          <Text {...fieldStyle('regexFlags')}>
            {isFieldSelected('regexFlags') ? '❯ ' : '  '}Flags
          </Text>
          <Box marginLeft={2}>
            <Box
              borderStyle="round"
              borderColor={
                isFieldSelected('regexFlags')
                  ? editingText
                    ? 'green'
                    : 'yellow'
                  : 'gray'
              }
            >
              <Text>{regexFlags || 'g'}</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Row 2: Format String, Styling */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Box flexDirection="column" width="50%">
          <Text {...fieldStyle('format')}>
            {isFieldSelected('format') ? '❯ ' : '  '}Format String
          </Text>
          <Box marginLeft={2}>
            <Box
              borderStyle="round"
              borderColor={
                isFieldSelected('format')
                  ? editingText
                    ? 'green'
                    : 'yellow'
                  : 'gray'
              }
            >
              <Text>{format || '{MATCH}'}</Text>
            </Box>
          </Box>
          {isFieldSelected('format') && (
            <Box marginLeft={2}>
              <Text dimColor>use {'{MATCH}'} as placeholder</Text>
            </Box>
          )}
        </Box>

        <Box flexDirection="column" width="45%">
          <Text {...fieldStyle('styling')}>
            {isFieldSelected('styling') ? '❯ ' : '  '}Styling
          </Text>
          <Box marginLeft={2} flexDirection="column">
            {STYLING_OPTIONS.map((option, index) => {
              const isActive = styling.includes(option.value);
              const isHighlighted =
                isFieldSelected('styling') && stylingIndex === index;
              return (
                <Text
                  key={option.value}
                  color={isHighlighted ? 'cyan' : undefined}
                >
                  {isHighlighted ? '❯ ' : '  '}
                  {isActive ? '●' : '○'} {option.label}
                </Text>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* Row 3: Foreground Color, Background Color */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Box flexDirection="column" width="48%">
          <Text {...fieldStyle('foreground')}>
            {isFieldSelected('foreground') ? '❯ ' : '  '}Foreground Color
          </Text>
          <Box marginLeft={2} flexDirection="row" gap={1}>
            <Text color={isFieldSelected('foreground') ? 'yellow' : undefined}>
              [{foregroundMode === 'none' ? '●' : '○'}] none
              {'  '}[{foregroundMode === 'custom' ? '●' : '○'}] custom
            </Text>
            {foregroundMode === 'custom' && (
              <Box
                borderStyle="round"
                borderColor={isFieldSelected('foreground') ? 'yellow' : 'gray'}
              >
                <Text color={foregroundColor}> ████ </Text>
              </Box>
            )}
          </Box>
        </Box>

        <Box flexDirection="column" width="48%">
          <Text {...fieldStyle('background')}>
            {isFieldSelected('background') ? '❯ ' : '  '}Background Color
          </Text>
          <Box marginLeft={2} flexDirection="row" gap={1}>
            <Text color={isFieldSelected('background') ? 'yellow' : undefined}>
              [{backgroundMode === 'none' ? '●' : '○'}] none
              {'  '}[{backgroundMode === 'custom' ? '●' : '○'}] custom
            </Text>
            {backgroundMode === 'custom' && (
              <Box
                borderStyle="round"
                borderColor={isFieldSelected('background') ? 'yellow' : 'gray'}
              >
                <Text backgroundColor={backgroundColor}> {'      '} </Text>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Row 4: Enabled */}
      <Box marginBottom={1}>
        <Text {...fieldStyle('enabled')}>
          {isFieldSelected('enabled') ? '❯ ' : '  '}Enabled:{' '}
          <Text color={enabled ? 'green' : 'red'}>
            {enabled ? '● Yes' : '○ No'}
          </Text>
        </Text>
      </Box>

      {/* Row 5: Test Text */}
      <Box flexDirection="column" marginBottom={1}>
        <Text {...fieldStyle('testText')}>
          {isFieldSelected('testText') ? '❯ ' : '  '}Test Text
        </Text>
        <Box marginLeft={2}>
          <Box
            borderStyle="round"
            borderColor={
              isFieldSelected('testText')
                ? editingText
                  ? 'green'
                  : 'yellow'
                : 'gray'
            }
          >
            <Text>{testText || '(empty)'}</Text>
          </Box>
        </Box>
      </Box>

      {/* Live Preview */}
      <Box borderStyle="round" padding={1}>
        <Box flexDirection="column">
          <Text bold>Live Preview:</Text>
          {regex ? (
            <Box marginTop={1}>
              <HighlightedTestText
                testText={testText}
                regex={regex}
                regexFlags={regexFlags}
                format={format}
                styling={styling}
                foregroundColor={
                  foregroundMode === 'custom' ? foregroundColor : undefined
                }
                backgroundColor={
                  backgroundMode === 'custom' ? backgroundColor : undefined
                }
              />
            </Box>
          ) : (
            <Text dimColor>Enter a regex pattern to see the preview</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
