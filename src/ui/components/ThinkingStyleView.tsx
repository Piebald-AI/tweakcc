import { useState, useEffect, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import cliSpinners from 'cli-spinners';

import { getCurrentClaudeCodeTheme } from '@/utils';
import { DEFAULT_SETTINGS } from '@/defaultSettings';

import { SettingsContext } from '../App';
import Header from './Header';

interface ThinkingStyleViewProps {
  onBack: () => void;
}

interface SpinnerPreset {
  name: string;
  phases: string[];
  reverseMirror: boolean;
  updateInterval?: number;
}

/** Convert camelCase spinner names to Title Case (e.g. "bouncingBall" → "Bouncing Ball") */
const formatSpinnerName = (name: string): string =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d+)/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());

/** Pad all phases to the width of the longest one so the spinner doesn't flicker. */
const padPhases = (phases: string[]): string[] => {
  const maxLen = Math.max(...phases.map(p => p.length));
  return phases.map(p => p.padEnd(maxLen));
};

/** Build cli-spinners presets, trimming trailing whitespace from frames. */
const cliSpinnerPresets: SpinnerPreset[] = Object.entries(cliSpinners).map(
  ([name, spinner]) => ({
    name: formatSpinnerName(name),
    phases: spinner.frames.map((f: string) => f.trimEnd()),
    reverseMirror: false,
    updateInterval: spinner.interval,
  })
);

const PRESETS: SpinnerPreset[] = [
  {
    name: 'Default',
    phases: DEFAULT_SETTINGS.thinkingStyle.phases,
    reverseMirror: DEFAULT_SETTINGS.thinkingStyle.reverseMirror,
  },
  {
    name: 'Wave',
    phases: ['▁', '▃', '▄', '▅', '▆', '▇', '█'],
    reverseMirror: true,
  },
  { name: 'Glow', phases: ['░', '▒', '▓', '█'], reverseMirror: true },
  {
    name: 'Partial block',
    phases: ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'],
    reverseMirror: true,
  },
  {
    name: 'Colors',
    phases: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'],
    reverseMirror: false,
  },
  ...cliSpinnerPresets,
];

export function ThinkingStyleView({ onBack }: ThinkingStyleViewProps) {
  const {
    settings: {
      thinkingStyle: { phases, updateInterval, reverseMirror },
      themes,
    },
    updateSettings,
  } = useContext(SettingsContext);

  const options = [
    'reverseMirror',
    'updateInterval',
    'phases',
    'presets',
  ] as const;
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const selectedOption = options[selectedOptionIndex];
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [editingPhase, setEditingPhase] = useState(false);
  const [phaseInput, setPhaseInput] = useState('');
  const [addingNewPhase, setAddingNewPhase] = useState(false);
  const [editingInterval, setEditingInterval] = useState(false);
  const [intervalInput, setIntervalInput] = useState(updateInterval.toString());
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);

  // Get current Claude theme and color
  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme =
    themes.find(t => t.id === currentThemeId) ||
    themes.find(t => t.id === 'dark');
  const claudeColor = currentTheme?.colors.claude || 'rgb(215,119,87)';

  // Animate spinner based on config
  useEffect(() => {
    if (phases.length > 0) {
      const evaluatedPhases = reverseMirror
        ? [...phases, ...[...phases].reverse().slice(1, -1)]
        : phases;

      const interval = setInterval(() => {
        setCurrentPhaseIndex(prev => (prev + 1) % evaluatedPhases.length);
      }, updateInterval);

      return () => clearInterval(interval);
    }
  }, [phases, updateInterval, reverseMirror]);

  useInput((input, key) => {
    if (editingInterval) {
      if (key.return) {
        const newInterval = parseInt(intervalInput);
        if (!isNaN(newInterval) && newInterval > 0) {
          updateSettings(settings => {
            settings.thinkingStyle.updateInterval = newInterval;
          });
        }
        setEditingInterval(false);
      } else if (key.escape) {
        setIntervalInput(updateInterval.toString());
        setEditingInterval(false);
      } else if (key.backspace || key.delete) {
        setIntervalInput(prev => prev.slice(0, -1));
      } else if (input && input.match(/^[0-9]$/)) {
        setIntervalInput(prev => prev + input);
      }
      return;
    }

    if (editingPhase || addingNewPhase) {
      if (key.return && phaseInput.length) {
        // Depending on if we're adding a new phase or editing an existing one...
        const newPhases = addingNewPhase
          ? // Add the new phase.
            [...phases, phaseInput]
          : // Replace the selectedPhaseIndex'th phase with the new phase.
            phases.map((phase, index) =>
              index === selectedPhaseIndex ? phaseInput : phase
            );

        updateSettings(settings => {
          settings.thinkingStyle.phases = padPhases(newPhases);
        });
        setEditingPhase(false);
        setPhaseInput('');
      } else if (key.escape) {
        setPhaseInput('');
        setEditingPhase(false);
        setAddingNewPhase(false);
      } else if (key.backspace || key.delete) {
        setPhaseInput(prev => prev.slice(0, -1));
      } else if (input) {
        setPhaseInput(prev => prev + input);
      }
      return;
    }

    if (key.escape) {
      onBack();
    } else if (key.return) {
      if (selectedOption === 'updateInterval') {
        setIntervalInput(updateInterval.toString());
        setEditingInterval(true);
      } else if (selectedOption === 'presets') {
        // Apply selected preset
        const preset = PRESETS[selectedPresetIndex];
        updateSettings(settings => {
          settings.thinkingStyle.phases = padPhases([...preset.phases]);
          settings.thinkingStyle.reverseMirror = preset.reverseMirror;
          if (preset.updateInterval !== undefined) {
            settings.thinkingStyle.updateInterval = preset.updateInterval;
          }
        });
      } else if (selectedOption === 'reverseMirror') {
        updateSettings(settings => {
          settings.thinkingStyle.reverseMirror =
            !settings.thinkingStyle.reverseMirror;
        });
      }
    } else if (key.tab) {
      if (key.shift) {
        setSelectedOptionIndex(prev =>
          prev === 0 ? options.length - 1 : prev - 1
        );
      } else {
        setSelectedOptionIndex(prev =>
          prev === options.length - 1 ? 0 : prev + 1
        );
      }
    } else if (key.upArrow) {
      if (selectedOption === 'phases' && phases.length > 0) {
        setSelectedPhaseIndex(prev =>
          prev > 0 ? prev - 1 : phases.length - 1
        );
      } else if (selectedOption === 'presets') {
        setSelectedPresetIndex(prev =>
          prev > 0 ? prev - 1 : PRESETS.length - 1
        );
      }
    } else if (key.downArrow) {
      if (selectedOption === 'phases' && phases.length > 0) {
        setSelectedPhaseIndex(prev =>
          prev < phases.length - 1 ? prev + 1 : 0
        );
      } else if (selectedOption === 'presets') {
        setSelectedPresetIndex(prev =>
          prev < PRESETS.length - 1 ? prev + 1 : 0
        );
      }
    } else if (input === ' ') {
      if (selectedOption === 'reverseMirror') {
        updateSettings(settings => {
          settings.thinkingStyle.reverseMirror =
            !settings.thinkingStyle.reverseMirror;
        });
      }
    } else if (input === 'e' && selectedOption === 'phases') {
      if (phases.length > 0) {
        setPhaseInput(phases[selectedPhaseIndex]);
        setEditingPhase(true);
      }
    } else if (input === 'a' && selectedOption === 'phases') {
      // Add new phase
      setAddingNewPhase(true);
      setPhaseInput('');
    } else if (input === 'd' && selectedOption === 'phases') {
      if (phases.length > 1) {
        updateSettings(settings => {
          settings.thinkingStyle.phases = padPhases(
            phases.filter((_, index) => index !== selectedPhaseIndex)
          );
        });
        if (selectedPhaseIndex >= phases.length) {
          setSelectedPhaseIndex(Math.max(0, phases.length - 1));
        }
      }
    } else if (input === 'w' && selectedOption === 'phases') {
      // Move phase up
      if (selectedPhaseIndex > 0) {
        const newPhases = [...phases];
        [newPhases[selectedPhaseIndex - 1], newPhases[selectedPhaseIndex]] = [
          newPhases[selectedPhaseIndex],
          newPhases[selectedPhaseIndex - 1],
        ];
        updateSettings(settings => {
          settings.thinkingStyle.phases = newPhases;
        });
        setSelectedPhaseIndex(prev => prev - 1);
      }
    } else if (input === 's' && selectedOption === 'phases') {
      // Move phase down
      if (selectedPhaseIndex < phases.length - 1) {
        const newPhases = [...phases];
        [newPhases[selectedPhaseIndex], newPhases[selectedPhaseIndex + 1]] = [
          newPhases[selectedPhaseIndex + 1],
          newPhases[selectedPhaseIndex],
        ];
        updateSettings(settings => {
          settings.thinkingStyle.phases = newPhases;
        });
        setSelectedPhaseIndex(prev => prev + 1);
      }
    } else if (key.ctrl && input === 'r') {
      // Reset all settings to default
      updateSettings(settings => {
        settings.thinkingStyle = DEFAULT_SETTINGS.thinkingStyle;
      });
      setSelectedPhaseIndex(0);
      setSelectedPresetIndex(0);
    }
  });

  const checkboxChar = reverseMirror ? '●' : '○';
  const previewWidth = 50;

  const getAnimatedPhases = () => {
    return reverseMirror
      ? [...phases, ...[...phases].reverse().slice(1, -1)]
      : phases;
  };

  const animatedPhases = getAnimatedPhases();
  const currentPhase =
    animatedPhases.length > 0 ? animatedPhases[currentPhaseIndex] : '·';

  return (
    <Box>
      <Box flexDirection="column" width="100%">
        <Box flexDirection="row" width="100%">
          <Box
            marginBottom={1}
            flexDirection="column"
            width={`${100 - previewWidth}%`}
          >
            <Header>Thinking style</Header>
            <Box flexDirection="column">
              <Text dimColor>
                enter to{' '}
                {selectedOption === 'updateInterval'
                  ? 'edit interval'
                  : selectedOption === 'presets'
                    ? 'apply preset'
                    : 'save'}
              </Text>
              <Text dimColor>esc to go back</Text>
              <Text dimColor>tab to switch sections</Text>
            </Box>
          </Box>

          <Box width={`${previewWidth}%`} flexDirection="column">
            <Box>
              <Text bold>Preview</Text>
            </Box>
            <Box
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
              flexDirection="row"
            >
              <Box width={(currentPhase?.length ?? 0) + 1}>
                <Text color={claudeColor}>{currentPhase}</Text>
              </Box>
              <Text>
                <Text color={claudeColor}>Thinking… </Text>
                <Text>(esc to interrupt)</Text>
              </Text>
            </Box>
          </Box>
        </Box>

        <Box flexDirection="row" gap={4}>
          <Box flexDirection="column">
            <Text>
              <Text
                color={
                  selectedOption === 'reverseMirror' ? 'yellow' : undefined
                }
              >
                {selectedOption === 'reverseMirror' ? '❯ ' : '  '}
              </Text>
              <Text
                bold
                color={
                  selectedOption === 'reverseMirror' ? 'yellow' : undefined
                }
              >
                Reverse-mirror phases
              </Text>
            </Text>

            {selectedOption === 'reverseMirror' && (
              <Text dimColor>{'  '}space to toggle</Text>
            )}

            <Box marginLeft={2} marginBottom={1}>
              <Text>
                {checkboxChar} {reverseMirror ? 'Enabled' : 'Disabled'}
              </Text>
            </Box>
          </Box>

          <Box flexDirection="column">
            <Text>
              <Text
                color={
                  selectedOption === 'updateInterval' ? 'yellow' : undefined
                }
              >
                {selectedOption === 'updateInterval' ? '❯ ' : '  '}
              </Text>
              <Text
                bold
                color={
                  selectedOption === 'updateInterval' ? 'yellow' : undefined
                }
              >
                Update interval (ms)
              </Text>
            </Text>
            {selectedOption === 'updateInterval' &&
              (editingInterval ? (
                <Text dimColor>{'  '}enter to save</Text>
              ) : (
                <Text dimColor>{'  '}enter to edit</Text>
              ))}

            <Box marginLeft={2} marginBottom={1}>
              <Box
                borderStyle="round"
                borderColor={editingInterval ? 'yellow' : 'gray'}
              >
                <Text>{editingInterval ? intervalInput : updateInterval}</Text>
              </Box>
            </Box>
          </Box>
        </Box>

        <Box>
          <Text>
            <Text color={selectedOption === 'phases' ? 'yellow' : undefined}>
              {selectedOption === 'phases' ? '❯ ' : '  '}
            </Text>
            <Text
              bold
              color={selectedOption === 'phases' ? 'yellow' : undefined}
            >
              Phases
            </Text>
          </Text>
        </Box>

        {selectedOption === 'phases' && (
          <Box marginBottom={1} flexDirection="column">
            <Text dimColor>
              {'  '}[e]dit{'  '}[a]dd{'  '}[d]elete{'  '}[w]move up{'  '}[s]move
              down
            </Text>
          </Box>
        )}

        <Box marginLeft={2} marginBottom={1}>
          <Box flexDirection="column">
            {(() => {
              const maxVisible = 8; // Show 8 phases at a time
              const startIndex = Math.max(
                0,
                selectedPhaseIndex - Math.floor(maxVisible / 2)
              );
              const endIndex = Math.min(phases.length, startIndex + maxVisible);
              const adjustedStartIndex = Math.max(0, endIndex - maxVisible);

              const visiblePhases = phases.slice(adjustedStartIndex, endIndex);

              return (
                <>
                  {adjustedStartIndex > 0 && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↑ {adjustedStartIndex} more above
                    </Text>
                  )}
                  {visiblePhases.map((phase, visibleIndex) => {
                    const actualIndex = adjustedStartIndex + visibleIndex;
                    return (
                      <Text
                        key={actualIndex}
                        color={
                          selectedOption === 'phases' &&
                          actualIndex === selectedPhaseIndex
                            ? 'cyan'
                            : undefined
                        }
                      >
                        {selectedOption === 'phases' &&
                        actualIndex === selectedPhaseIndex
                          ? '❯ '
                          : '  '}
                        {phase}
                      </Text>
                    );
                  })}
                  {endIndex < phases.length && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↓ {phases.length - endIndex} more below
                    </Text>
                  )}
                </>
              );
            })()}
            {addingNewPhase && (
              <Box>
                <Text color="yellow">❯ </Text>
                <Box borderStyle="round" borderColor="yellow">
                  <Text>{phaseInput}</Text>
                </Box>
              </Box>
            )}
            {editingPhase && (
              <Box marginTop={1}>
                <Text>Editing: </Text>
                <Box borderStyle="round" borderColor="yellow">
                  <Text>{phaseInput}</Text>
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <Box>
          <Text>
            <Text color={selectedOption === 'presets' ? 'yellow' : undefined}>
              {selectedOption === 'presets' ? '❯ ' : '  '}
            </Text>
            <Text
              bold
              color={selectedOption === 'presets' ? 'yellow' : undefined}
            >
              Presets
            </Text>
          </Text>
        </Box>

        {selectedOption === 'presets' && (
          <Text dimColor>
            {'  '}Selecting one will overwrite your choice of phases and
            interval
          </Text>
        )}

        <Box marginLeft={2} marginBottom={1}>
          <Box flexDirection="column">
            {(() => {
              const maxVisible = 12; // Show 12 presets at a time (more room for the larger list)
              const startIndex = Math.max(
                0,
                selectedPresetIndex - Math.floor(maxVisible / 2)
              );
              const endIndex = Math.min(
                PRESETS.length,
                startIndex + maxVisible
              );
              const adjustedStartIndex = Math.max(0, endIndex - maxVisible);

              const visiblePresets = PRESETS.slice(
                adjustedStartIndex,
                endIndex
              );

              /** Show a compact preview of frames, truncating if too long */
              const previewFrames = (preset: SpinnerPreset): string => {
                const joined = preset.phases.join('');
                return joined.length > 30 ? joined.slice(0, 27) + '…' : joined;
              };

              return (
                <>
                  {adjustedStartIndex > 0 && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↑ {adjustedStartIndex} more above
                    </Text>
                  )}
                  {visiblePresets.map((preset, visibleIndex) => {
                    const actualIndex = adjustedStartIndex + visibleIndex;
                    const isSelected =
                      selectedOption === 'presets' &&
                      actualIndex === selectedPresetIndex;
                    return (
                      <Text
                        key={actualIndex}
                        color={isSelected ? 'cyan' : undefined}
                      >
                        {isSelected ? '❯ ' : '  '}
                        {preset.name} {previewFrames(preset)}
                      </Text>
                    );
                  })}
                  {endIndex < PRESETS.length && (
                    <Text color="gray" dimColor>
                      {' '}
                      ↓ {PRESETS.length - endIndex} more below
                    </Text>
                  )}
                </>
              );
            })()}
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>ctrl+r to reset all settings to default</Text>
        </Box>
      </Box>
    </Box>
  );
}
