import React, { useState, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { Toolset, DEFAULT_SETTINGS } from '../utils/types.js';
import { SettingsContext } from '../App.js';
import { ToolsetEditView } from './ToolsetEditView.js';
import Header from './Header.js';
import { getCurrentClaudeCodeTheme } from '../utils/misc.js';

interface ToolsetsViewProps {
  onBack: () => void;
}

export function ToolsetsView({ onBack }: ToolsetsViewProps) {
  const {
    settings: { toolsets, defaultToolset, planModeToolset, themes },
    updateSettings,
  } = useContext(SettingsContext);

  // Get current theme colors
  const currentThemeId = getCurrentClaudeCodeTheme();
  const currentTheme = themes.find(t => t.id === currentThemeId) || themes[0];

  const defaultTheme = DEFAULT_SETTINGS.themes[0]; // Dark mode theme
  const planModeColor =
    currentTheme?.colors.planMode || defaultTheme.colors.planMode;
  const autoAcceptColor =
    currentTheme?.colors.autoAccept || defaultTheme.colors.autoAccept;

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
    const toolsetToDelete = toolsets[index];
    updateSettings(settings => {
      settings.toolsets.splice(index, 1);
      // Clear default if we're deleting the default toolset
      if (settings.defaultToolset === toolsetToDelete.name) {
        settings.defaultToolset = null;
      }
      // Clear plan mode if we're deleting the plan mode toolset
      if (settings.planModeToolset === toolsetToDelete.name) {
        settings.planModeToolset = null;
      }
    });

    if (selectedIndex >= toolsets.length - 1) {
      setSelectedIndex(Math.max(0, toolsets.length - 2));
    }
  };

  const handleSetDefaultToolset = (index: number) => {
    const toolset = toolsets[index];
    updateSettings(settings => {
      settings.defaultToolset = toolset.name;
    });
  };

  const handleSetPlanModeToolset = (index: number) => {
    const toolset = toolsets[index];
    updateSettings(settings => {
      settings.planModeToolset = toolset.name;
    });
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
      } else if (input === 'x' && toolsets.length > 0) {
        handleDeleteToolset(selectedIndex);
      } else if (input === 'd' && toolsets.length > 0) {
        handleSetDefaultToolset(selectedIndex);
      } else if (input === 'p' && toolsets.length > 0) {
        handleSetPlanModeToolset(selectedIndex);
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
        {toolsets.length > 0 && (
          <Text dimColor>d to set as default toolset</Text>
        )}
        {toolsets.length > 0 && (
          <Text dimColor>p to set as plan mode toolset</Text>
        )}
        {toolsets.length > 0 && <Text dimColor>x to delete a toolset</Text>}
        {toolsets.length > 0 && <Text dimColor>enter to edit toolset</Text>}
        <Text dimColor>esc to go back</Text>
      </Box>

      {toolsets.length === 0 ? (
        <Text>No toolsets created yet. Press n to create one.</Text>
      ) : (
        <Box flexDirection="column">
          {toolsets.map((toolset, index) => {
            const isDefault = toolset.name === defaultToolset;
            const isPlanMode = toolset.name === planModeToolset;
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
                  {toolset.name}{' '}
                </Text>

                {isDefault && (
                  <Text color={autoAcceptColor}> ⏵⏵ accept edits</Text>
                )}
                {isPlanMode && <Text color={planModeColor}> ⏸ plan mode</Text>}

                <Text color={lineColor}>
                  {' '}
                  ({getToolsetDescription(toolset)})
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
