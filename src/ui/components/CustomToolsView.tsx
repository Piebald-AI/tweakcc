import { useContext, useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { CustomTool } from '@/types';

import { SettingsContext } from '../App';
import { CustomToolEditView } from './CustomToolEditView';
import Header from './Header';

interface CustomToolsViewProps {
  onBack: () => void;
}

const summarizeTool = (tool: CustomTool): string => {
  const parts = [
    `${Object.keys(tool.parameters).length} param${Object.keys(tool.parameters).length === 1 ? '' : 's'}`,
    tool.shell ?? 'sh',
  ];

  if (tool.timeout !== undefined) {
    parts.push(`${tool.timeout}ms`);
  }

  if (tool.env && Object.keys(tool.env).length > 0) {
    parts.push(`${Object.keys(tool.env).length} env`);
  }

  return parts.join(' · ');
};

const truncate = (value: string, max = 88): string =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

export function CustomToolsView({ onBack }: CustomToolsViewProps) {
  const {
    settings: { customTools },
    updateSettings,
  } = useContext(SettingsContext);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingToolIndex, setEditingToolIndex] = useState<number | null>(null);
  const [inputActive, setInputActive] = useState(true);

  const handleCreateTool = () => {
    const existingNames = new Set(customTools.map(t => t.name));
    let candidateName = 'New Tool';
    let counter = 2;
    while (existingNames.has(candidateName)) {
      candidateName = `New Tool ${counter++}`;
    }

    const newTool: CustomTool = {
      name: candidateName,
      description: 'Describe what this tool does',
      parameters: {},
      command: 'echo hello',
    };

    updateSettings(settings => {
      settings.customTools.push(newTool);
    });

    setEditingToolIndex(customTools.length);
    setInputActive(false);
  };

  const handleDeleteTool = (index: number) => {
    updateSettings(settings => {
      settings.customTools.splice(index, 1);
    });

    if (selectedIndex >= customTools.length - 1) {
      setSelectedIndex(Math.max(0, customTools.length - 2));
    }
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;

    updateSettings(settings => {
      const tool = settings.customTools[index];
      settings.customTools.splice(index, 1);
      settings.customTools.splice(index - 1, 0, tool);
    });

    setSelectedIndex(index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (index >= customTools.length - 1) return;

    updateSettings(settings => {
      const tool = settings.customTools[index];
      settings.customTools.splice(index, 1);
      settings.customTools.splice(index + 1, 0, tool);
    });

    setSelectedIndex(index + 1);
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow && customTools.length > 0) {
        setSelectedIndex(prev => Math.min(customTools.length - 1, prev + 1));
      } else if (key.return && customTools.length > 0) {
        setEditingToolIndex(selectedIndex);
        setInputActive(false);
      } else if (input === 'n') {
        handleCreateTool();
      } else if (input === 'x' && customTools.length > 0) {
        handleDeleteTool(selectedIndex);
      } else if (input === 'u' && customTools.length > 0 && selectedIndex > 0) {
        handleMoveUp(selectedIndex);
      } else if (
        input === 'd' &&
        customTools.length > 0 &&
        selectedIndex < customTools.length - 1
      ) {
        handleMoveDown(selectedIndex);
      }
    },
    { isActive: inputActive }
  );

  if (editingToolIndex !== null) {
    return (
      <CustomToolEditView
        toolIndex={editingToolIndex}
        onBack={() => {
          setEditingToolIndex(null);
          setInputActive(true);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Header>Custom Tools</Header>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>
          Define shell-command tools that are injected into Claude Code.
        </Text>
        <Text dimColor>
          Use placeholders like <Text bold>{'{{path}}'}</Text> inside the
          command template.
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>n to create a new tool</Text>
        {customTools.length > 0 && (
          <Text dimColor>u/d to move tool up/down</Text>
        )}
        {customTools.length > 0 && <Text dimColor>x to delete a tool</Text>}
        {customTools.length > 0 && <Text dimColor>enter to edit tool</Text>}
        <Text dimColor>esc to go back</Text>
      </Box>

      {customTools.length === 0 ? (
        <Text>No custom tools created yet. Press n to create one.</Text>
      ) : (
        <Box flexDirection="column">
          {customTools.map((tool, index) => {
            const isSelected = selectedIndex === index;

            return (
              <Box key={index} flexDirection="column" marginBottom={1}>
                <Text color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? '❯ ' : '  '}
                  {tool.name}
                  <Text dimColor> ({summarizeTool(tool)})</Text>
                </Text>
                <Box marginLeft={4}>
                  <Text dimColor>{truncate(tool.command)}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
