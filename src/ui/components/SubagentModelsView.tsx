import { Box, Text, useInput } from 'ink';
import { useContext, useState } from 'react';
import { SettingsContext } from '../App';
import Header from './Header';

interface SubagentModelsViewProps {
  onSubmit: () => void;
}

type SubagentType = 'plan' | 'explore' | 'generalPurpose';

export function SubagentModelsView({ onSubmit }: SubagentModelsViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);
  const [activeSubagent, setActiveSubagent] = useState<SubagentType>('plan');
  const [selectingModel, setSelectingModel] = useState(false);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);

  const subagentModels = settings.subagentModels || {
    plan: null,
    explore: null,
    generalPurpose: null,
  };

  const subagents: { id: SubagentType; title: string; description: string }[] =
    [
      {
        id: 'plan',
        title: 'Plan Agent',
        description: 'The agent responsible for creating implementation plans.',
      },
      {
        id: 'explore',
        title: 'Explore Agent',
        description: 'The agent specialized for exploring codebases.',
      },
      {
        id: 'generalPurpose',
        title: 'General-purpose Agent',
        description: 'The agent used for general multi-step tasks.',
      },
    ];

  const modelOptions = [
    { label: 'Default (Inherited)', value: null },
    { label: 'sonnet', value: 'sonnet' },
    { label: 'haiku', value: 'haiku' },
    { label: 'opus', value: 'opus' },
    { label: 'sonnet[1m]', value: 'sonnet[1m]' },
  ];

  useInput((input, key) => {
    if (selectingModel) {
      if (key.escape) {
        setSelectingModel(false);
      } else if (key.upArrow) {
        setSelectedModelIndex(prev =>
          prev > 0 ? prev - 1 : modelOptions.length - 1
        );
      } else if (key.downArrow) {
        setSelectedModelIndex(prev =>
          prev < modelOptions.length - 1 ? prev + 1 : 0
        );
      } else if (key.return) {
        const selectedModel = modelOptions[selectedModelIndex].value;
        updateSettings(s => {
          if (!s.subagentModels) {
            s.subagentModels = {
              plan: null,
              explore: null,
              generalPurpose: null,
            };
          }
          s.subagentModels[activeSubagent] = selectedModel;
        });
        setSelectingModel(false);
      }
    } else {
      if (key.return || key.escape) {
        onSubmit();
      } else if (key.upArrow) {
        const currentIndex = subagents.findIndex(s => s.id === activeSubagent);
        const nextIndex =
          currentIndex > 0 ? currentIndex - 1 : subagents.length - 1;
        setActiveSubagent(subagents[nextIndex].id);
      } else if (key.downArrow) {
        const currentIndex = subagents.findIndex(s => s.id === activeSubagent);
        const nextIndex =
          currentIndex < subagents.length - 1 ? currentIndex + 1 : 0;
        setActiveSubagent(subagents[nextIndex].id);
      } else if (input === ' ') {
        const currentModel = subagentModels[activeSubagent];
        const modelIndex = modelOptions.findIndex(
          m => m.value === currentModel
        );
        setSelectedModelIndex(modelIndex >= 0 ? modelIndex : 0);
        setSelectingModel(true);
      }
    }
  });

  if (selectingModel) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Header>
            Select Model for{' '}
            {subagents.find(s => s.id === activeSubagent)?.title}
          </Header>
        </Box>
        {modelOptions.map((option, index) => {
          const isSelected = index === selectedModelIndex;
          return (
            <Box key={index}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '❯ ' : '  '}
                {option.label}
                {option.value ? <Text dimColor> ({option.value})</Text> : null}
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Header>Subagent Model Settings</Header>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          Configure which Claude model each subagent uses. Use arrow keys to
          navigate, space to change a model, and enter to go back.
        </Text>
      </Box>

      {subagents.map(subagent => {
        const isSelected = subagent.id === activeSubagent;
        const currentModelValue = subagentModels[subagent.id];
        const currentModelLabel =
          modelOptions.find(m => m.value === currentModelValue)?.label ||
          currentModelValue ||
          'Default';

        return (
          <Box key={subagent.id} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '❯ ' : '  '}
                <Text bold>{subagent.title}</Text>
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor>{subagent.description}</Text>
            </Box>
            <Box marginLeft={4}>
              <Text>
                Current: <Text color="green">{currentModelLabel}</Text>
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
