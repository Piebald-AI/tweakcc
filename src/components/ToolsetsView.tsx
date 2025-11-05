import React, { useState, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { Toolset } from '../utils/types.js';
import { SettingsContext } from '../App.js';
import { ToolsetEditView } from './ToolsetEditView.js';
import Header from './Header.js';

interface ToolsetsViewProps {
  onBack: () => void;
}

export function ToolsetsView({ onBack }: ToolsetsViewProps) {
  const {
    settings: { toolsets },
    updateSettings,
  } = useContext(SettingsContext);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingToolsetIndex, setEditingToolsetIndex] = useState<number | null>(
    null
  );
  const [inputActive, setInputActive] = useState(true);

  const handleCreateToolset = () => {
    const newToolset: Toolset = {
      name: 'New Toolset',
      allowedTools: [],
    };

    updateSettings(settings => {
      settings.toolsets.push(newToolset);
    });

    setEditingToolsetIndex(toolsets.length);
    setInputActive(false);
  };

  const handleDeleteToolset = (index: number) => {
    updateSettings(settings => {
      settings.toolsets.splice(index, 1);
    });

    if (selectedIndex >= toolsets.length - 1) {
      setSelectedIndex(Math.max(0, toolsets.length - 2));
    }
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(toolsets.length - 1, prev + 1));
      } else if (key.return && toolsets.length > 0) {
        setEditingToolsetIndex(selectedIndex);
        setInputActive(false);
      } else if (input === 'n') {
        handleCreateToolset();
      } else if (input === 'd' && toolsets.length > 0) {
        handleDeleteToolset(selectedIndex);
      }
    },
    { isActive: inputActive }
  );

  // Handle editing toolset view
  if (editingToolsetIndex !== null) {
    return (
      <ToolsetEditView
        toolsetIndex={editingToolsetIndex}
        onBack={() => {
          setEditingToolsetIndex(null);
          setInputActive(true);
        }}
      />
    );
  }

  const getToolsetDescription = (toolset: Toolset): string => {
    if (toolset.allowedTools === '*') {
      return 'All tools';
    } else if (toolset.allowedTools.length === 0) {
      return 'No tools';
    } else {
      return `${toolset.allowedTools.length} tool${toolset.allowedTools.length === 1 ? '' : 's'}`;
    }
  };

  return (
    <Box flexDirection="column">
      <Header>Toolsets</Header>
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>n to create a new toolset</Text>
        {toolsets.length > 0 && <Text dimColor>d to delete a toolset</Text>}
        {toolsets.length > 0 && <Text dimColor>enter to edit toolset</Text>}
        <Text dimColor>esc to go back</Text>
      </Box>

      {toolsets.length === 0 ? (
        <Text>No toolsets created yet. Press n to create one.</Text>
      ) : (
        <Box flexDirection="column">
          {toolsets.map((toolset, index) => (
            <Text
              key={index}
              color={selectedIndex === index ? 'yellow' : undefined}
            >
              {selectedIndex === index ? '❯ ' : '  '}
              {toolset.name} ({getToolsetDescription(toolset)})
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
