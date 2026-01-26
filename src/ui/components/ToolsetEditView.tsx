import { useState, useContext, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { SettingsContext } from '../App';
import Header from './Header';

interface ToolsetEditViewProps {
  toolsetIndex: number;
  onBack: () => void;
}

// All available Claude Code tools
const AVAILABLE_TOOLS = [
  'AgentOutputTool',
  'AskUserQuestion',
  'Bash',
  'BashOutputTool',
  'Edit',
  'EnterPlanMode',
  'ExitPlanMode',
  'Glob',
  'Grep',
  'KillShell',
  'ListMcpResourcesTool',
  'LSP',
  'NotebookEdit',
  'Read',
  'ReadMcpResourceTool',
  'Skill',
  'Task',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'TaskUpdate',
  'Teammate',
  'TodoWrite',
  'ToolSearch',
  'WebFetch',
  'WebSearch',
  'Write',
];

export function ToolsetEditView({
  toolsetIndex,
  onBack,
}: ToolsetEditViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);
  const toolset = settings.toolsets[toolsetIndex];

  const [name, setName] = useState(toolset?.name || 'New Toolset');
  const [allowedTools, setAllowedTools] = useState<string[] | '*'>(
    toolset?.allowedTools || []
  );
  const [editingName, setEditingName] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Update settings whenever name or allowedTools change
  useEffect(() => {
    if (toolset) {
      updateSettings(settings => {
        const oldName = settings.toolsets[toolsetIndex].name;
        settings.toolsets[toolsetIndex].name = name;
        settings.toolsets[toolsetIndex].allowedTools = allowedTools;

        // Update references if name changed
        if (oldName !== name) {
          if (settings.defaultToolset === oldName) {
            settings.defaultToolset = name;
          }
          if (settings.planModeToolset === oldName) {
            settings.planModeToolset = name;
          }
        }
      });
    }
  }, [name, allowedTools]);

  const isToolSelected = (tool: string): boolean => {
    if (allowedTools === '*') return true;
    return allowedTools.includes(tool);
  };

  const toggleTool = (tool: string) => {
    if (tool === 'All') {
      setAllowedTools('*');
    } else if (tool === 'None') {
      setAllowedTools([]);
    } else {
      if (allowedTools === '*') {
        // If "All" was selected, deselect this specific tool
        setAllowedTools(AVAILABLE_TOOLS.filter(t => t !== tool));
      } else {
        if (allowedTools.includes(tool)) {
          setAllowedTools(allowedTools.filter(t => t !== tool));
        } else {
          setAllowedTools([...allowedTools, tool]);
        }
      }
    }
  };

  useInput((input, key) => {
    if (editingName) {
      if (key.return) {
        setEditingName(false);
      } else if (key.escape) {
        setName(toolset?.name || 'New Toolset');
        setEditingName(false);
      } else if (key.backspace || key.delete) {
        setName(prev => prev.slice(0, -1));
      } else if (input && input.length === 1) {
        setName(prev => prev + input);
      }
      return;
    }

    if (key.escape) {
      onBack();
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(AVAILABLE_TOOLS.length + 1, prev + 1));
    } else if (input === ' ' || key.return) {
      if (selectedIndex === 0) {
        // Toggle "All"
        toggleTool('All');
      } else if (selectedIndex === 1) {
        // Toggle "None"
        toggleTool('None');
      } else {
        // Toggle specific tool
        const tool = AVAILABLE_TOOLS[selectedIndex - 2];
        if (tool) toggleTool(tool);
      }
    } else if (input === 'n') {
      setEditingName(true);
    }
  });

  if (!toolset) {
    return (
      <Box flexDirection="column">
        <Text color="red">Toolset not found</Text>
      </Box>
    );
  }

  const isAllSelected = allowedTools === '*';
  const isNoneSelected =
    Array.isArray(allowedTools) && allowedTools.length === 0;

  return (
    <Box flexDirection="column">
      <Header>Edit Toolset</Header>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>
          n to edit name · space/enter to toggle · esc to go back
        </Text>
      </Box>

      {/* Name Section */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold>Name:</Text>
        <Box marginLeft={2}>
          <Box
            borderStyle="round"
            borderColor={editingName ? 'yellow' : 'gray'}
          >
            <Text>{name}</Text>
          </Box>
        </Box>
        {editingName && (
          <Box marginLeft={2}>
            <Text dimColor>enter to save · esc to cancel</Text>
          </Box>
        )}
      </Box>

      {/* Tools Section */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold>Allowed Tools:</Text>

        {/* Special options: All and None */}
        <Box marginLeft={2}>
          <Text color={selectedIndex === 0 ? 'cyan' : undefined}>
            {selectedIndex === 0 ? '❯ ' : '  '}
            {isAllSelected ? '●' : '○'} All
          </Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={selectedIndex === 1 ? 'cyan' : undefined}>
            {selectedIndex === 1 ? '❯ ' : '  '}
            {isNoneSelected ? '●' : '○'} None
          </Text>
        </Box>

        {/* Individual tools */}
        {AVAILABLE_TOOLS.map((tool, index) => {
          const itemIndex = index + 2;
          return (
            <Box key={tool} marginLeft={2}>
              <Text color={selectedIndex === itemIndex ? 'cyan' : undefined}>
                {selectedIndex === itemIndex ? '❯ ' : '  '}
                {isToolSelected(tool) ? '◉' : '○'} {tool}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Summary */}
      <Box borderStyle="round" padding={1} marginTop={1}>
        <Box flexDirection="column">
          <Text bold>Summary:</Text>
          <Text>
            Name: <Text color="cyan">{name}</Text>
          </Text>
          <Text>
            Tools:{' '}
            {allowedTools === '*' ? (
              <Text color="green">All tools (*)</Text>
            ) : allowedTools.length === 0 ? (
              <Text color="red">No tools ([])</Text>
            ) : (
              <Text color="yellow">{allowedTools.length} selected</Text>
            )}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
