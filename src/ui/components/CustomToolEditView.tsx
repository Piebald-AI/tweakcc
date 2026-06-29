import { useContext, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { CustomToolParameter } from '@/types';

import { SettingsContext } from '../App';
import Header from './Header';

interface CustomToolEditViewProps {
  toolIndex: number;
  onBack: () => void;
}

type FieldName =
  | 'name'
  | 'description'
  | 'command'
  | 'shell'
  | 'timeout'
  | 'workingDir'
  | 'prompt'
  | 'parameters'
  | 'env';

const FIELD_ORDER: FieldName[] = [
  'name',
  'description',
  'command',
  'shell',
  'timeout',
  'workingDir',
  'prompt',
  'parameters',
  'env',
];

const FIELD_LABELS: Record<FieldName, string> = {
  name: 'Name',
  description: 'Description',
  command: 'Command template',
  shell: 'Shell',
  timeout: 'Timeout (ms)',
  workingDir: 'Working directory',
  prompt: 'Prompt override',
  parameters: 'Parameters JSON',
  env: 'Env JSON',
};

const FIELD_HINTS: Record<FieldName, string> = {
  name: 'Must be unique among custom tools.',
  description: 'Shown to Claude and used for the generated prompt.',
  command: 'Use placeholders like {{path}} for parameter substitution.',
  shell: 'Optional. Leave empty to use sh.',
  timeout: 'Optional. Leave empty to use the default 30000ms timeout.',
  workingDir: 'Optional. Leave empty to use Claude Code’s current cwd.',
  prompt: 'Optional. Leave empty to auto-generate the tool prompt.',
  parameters:
    'Example: {"path":{"type":"string","description":"File path","required":true}}',
  env: 'Example: {"API_KEY":"value","MODE":"strict"}',
};

const RESERVED_TOOL_NAMES = new Set(
  [
    'Agent',
    'AskUserQuestion',
    'Bash',
    'Brief',
    'SendUserMessage',
    'Config',
    'CronCreate',
    'CronDelete',
    'CronList',
    'Edit',
    'EnterPlanMode',
    'EnterWorktree',
    'ExitPlanMode',
    'ExitWorktree',
    'Glob',
    'Grep',
    'LSP',
    'ListMcpResourcesTool',
    'NotebookEdit',
    'PowerShell',
    'REPL',
    'Read',
    'ReadMcpResource',
    'RemoteTrigger',
    'Skill',
    'Sleep',
    'SendMessage',
    'StructuredOutput',
    'Task',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskOutput',
    'TaskStop',
    'TaskUpdate',
    'TeamCreate',
    'TeamDelete',
    'TodoWrite',
    'ToolSearch',
    'WebFetch',
    'WebSearch',
    'Write',
  ].map(name => name.toLowerCase())
);

const normalizeToolName = (value: string): string => value.trim().toLowerCase();

const truncate = (value: string, max = 100): string =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

const parseTimeoutInput = (
  input: string
): { value: number | undefined; error: string | null } => {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { value: undefined, error: null };
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      value: undefined,
      error: 'Timeout must be a positive integer number of milliseconds.',
    };
  }

  return { value: parsed, error: null };
};

const parseParametersInput = (
  input: string
): {
  value: Record<string, CustomToolParameter>;
  error: string | null;
} => {
  const trimmed = input.trim();
  const raw = trimmed.length === 0 ? {} : JSON.parse(trimmed);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      value: {},
      error: 'Parameters must be a JSON object keyed by parameter name.',
    };
  }

  for (const [name, param] of Object.entries(raw)) {
    if (name.trim().length === 0) {
      return {
        value: {},
        error: 'Parameter names must not be empty.',
      };
    }

    if (!param || typeof param !== 'object' || Array.isArray(param)) {
      return {
        value: {},
        error: `Parameter "${name}" must be an object.`,
      };
    }

    const typedParam = param as {
      type?: unknown;
      description?: unknown;
      required?: unknown;
    };

    if (
      typedParam.type !== 'string' &&
      typedParam.type !== 'number' &&
      typedParam.type !== 'boolean'
    ) {
      return {
        value: {},
        error: `Parameter "${name}" must declare type "string", "number", or "boolean".`,
      };
    }

    if (
      typeof typedParam.description !== 'string' ||
      typedParam.description.trim().length === 0
    ) {
      return {
        value: {},
        error: `Parameter "${name}" must include a non-empty description.`,
      };
    }

    if (
      typedParam.required !== undefined &&
      typeof typedParam.required !== 'boolean'
    ) {
      return {
        value: {},
        error: `Parameter "${name}" has invalid required flag.`,
      };
    }
  }

  return {
    value: raw as Record<string, CustomToolParameter>,
    error: null,
  };
};

const parseEnvInput = (
  input: string
): { value: Record<string, string>; error: string | null } => {
  const trimmed = input.trim();
  const raw = trimmed.length === 0 ? {} : JSON.parse(trimmed);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      value: {},
      error: 'Env must be a JSON object keyed by environment variable name.',
    };
  }

  for (const [name, value] of Object.entries(raw)) {
    if (name.trim().length === 0) {
      return {
        value: {},
        error: 'Environment variable names must not be empty.',
      };
    }

    if (typeof value !== 'string') {
      return {
        value: {},
        error: `Environment variable "${name}" must be a string.`,
      };
    }
  }

  return {
    value: raw as Record<string, string>,
    error: null,
  };
};

export function CustomToolEditView({
  toolIndex,
  onBack,
}: CustomToolEditViewProps) {
  const { settings, updateSettings } = useContext(SettingsContext);
  const tool = settings.customTools[toolIndex];

  const [name, setName] = useState(tool?.name || 'New Tool');
  const [description, setDescription] = useState(
    tool?.description || 'Describe what this tool does'
  );
  const [command, setCommand] = useState(tool?.command || 'echo hello');
  const [shell, setShell] = useState(tool?.shell || '');
  const [timeoutInput, setTimeoutInput] = useState(
    tool?.timeout?.toString() || ''
  );
  const [workingDir, setWorkingDir] = useState(tool?.workingDir || '');
  const [prompt, setPrompt] = useState(tool?.prompt || '');
  const [parametersInput, setParametersInput] = useState(
    JSON.stringify(tool?.parameters || {})
  );
  const [envInput, setEnvInput] = useState(JSON.stringify(tool?.env || {}));

  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const [editingText, setEditingText] = useState(false);
  const [fieldSnapshot, setFieldSnapshot] = useState('');

  const [timeoutError, setTimeoutError] = useState<string | null>(null);

  const [parsedParameters, setParsedParameters] = useState<
    Record<string, CustomToolParameter>
  >(tool?.parameters || {});
  const [parametersError, setParametersError] = useState<string | null>(null);

  const [parsedEnv, setParsedEnv] = useState<Record<string, string>>(
    tool?.env || {}
  );
  const [envError, setEnvError] = useState<string | null>(null);

  const selectedField = FIELD_ORDER[selectedFieldIndex];
  const normalizedName = normalizeToolName(name);
  const duplicateName = settings.customTools.some(
    (candidate, index) =>
      index !== toolIndex &&
      normalizeToolName(candidate.name) === normalizedName
  );
  const reservedName = RESERVED_TOOL_NAMES.has(normalizedName);

  useEffect(() => {
    const result = parseTimeoutInput(timeoutInput);
    setTimeoutError(result.error);
  }, [timeoutInput]);

  useEffect(() => {
    try {
      const result = parseParametersInput(parametersInput);
      setParametersError(result.error);
      if (!result.error) {
        setParsedParameters(result.value);
      }
    } catch (error) {
      setParametersError((error as Error).message);
    }
  }, [parametersInput]);

  useEffect(() => {
    try {
      const result = parseEnvInput(envInput);
      setEnvError(result.error);
      if (!result.error) {
        setParsedEnv(result.value);
      }
    } catch (error) {
      setEnvError((error as Error).message);
    }
  }, [envInput]);

  const persistTool = (): boolean => {
    if (!tool) {
      return false;
    }

    const timeoutResult = parseTimeoutInput(timeoutInput);
    setTimeoutError(timeoutResult.error);
    if (timeoutResult.error) {
      return false;
    }
    const nextTimeout = timeoutResult.value;
    let nextParameters: Record<string, CustomToolParameter>;
    let nextEnv: Record<string, string>;

    try {
      const parametersResult = parseParametersInput(parametersInput);
      setParametersError(parametersResult.error);
      if (parametersResult.error) {
        return false;
      }
      nextParameters = parametersResult.value;
    } catch (error) {
      setParametersError((error as Error).message);
      return false;
    }

    try {
      const envResult = parseEnvInput(envInput);
      setEnvError(envResult.error);
      if (envResult.error) {
        return false;
      }
      nextEnv = envResult.value;
    } catch (error) {
      setEnvError((error as Error).message);
      return false;
    }

    if (
      name.trim().length === 0 ||
      description.trim().length === 0 ||
      command.trim().length === 0 ||
      duplicateName ||
      reservedName
    ) {
      return false;
    }

    setParsedParameters(nextParameters);
    setParsedEnv(nextEnv);

    updateSettings(currentSettings => {
      const currentTool = currentSettings.customTools[toolIndex];
      if (!currentTool) {
        return;
      }

      currentTool.name = name.trim();
      currentTool.description = description.trim();
      currentTool.command = command.trim();

      const shellValue = shell.trim();
      if (shellValue.length > 0) {
        currentTool.shell = shellValue;
      } else {
        delete currentTool.shell;
      }

      if (nextTimeout !== undefined) {
        currentTool.timeout = nextTimeout;
      } else {
        delete currentTool.timeout;
      }

      const workingDirValue = workingDir.trim();
      if (workingDirValue.length > 0) {
        currentTool.workingDir = workingDirValue;
      } else {
        delete currentTool.workingDir;
      }

      const promptValue = prompt.trim();
      if (promptValue.length > 0) {
        currentTool.prompt = prompt;
      } else {
        delete currentTool.prompt;
      }

      currentTool.parameters = nextParameters;

      if (Object.keys(nextEnv).length > 0) {
        currentTool.env = nextEnv;
      } else {
        delete currentTool.env;
      }
    });

    return true;
  };

  const getRawFieldValue = (): string => {
    switch (selectedField) {
      case 'name':
        return name;
      case 'description':
        return description;
      case 'command':
        return command;
      case 'shell':
        return shell;
      case 'timeout':
        return timeoutInput;
      case 'workingDir':
        return workingDir;
      case 'prompt':
        return prompt;
      case 'parameters':
        return parametersInput;
      case 'env':
        return envInput;
    }
  };

  const resetSelectedField = (snapshot: string) => {
    switch (selectedField) {
      case 'name':
        setName(snapshot);
        break;
      case 'description':
        setDescription(snapshot);
        break;
      case 'command':
        setCommand(snapshot);
        break;
      case 'shell':
        setShell(snapshot);
        break;
      case 'timeout':
        setTimeoutInput(snapshot);
        break;
      case 'workingDir':
        setWorkingDir(snapshot);
        break;
      case 'prompt':
        setPrompt(snapshot);
        break;
      case 'parameters':
        setParametersInput(snapshot);
        break;
      case 'env':
        setEnvInput(snapshot);
        break;
    }
  };

  const appendCharacter = (input: string) => {
    switch (selectedField) {
      case 'name':
        setName(prev => prev + input);
        break;
      case 'description':
        setDescription(prev => prev + input);
        break;
      case 'command':
        setCommand(prev => prev + input);
        break;
      case 'shell':
        setShell(prev => prev + input);
        break;
      case 'timeout':
        setTimeoutInput(prev => prev + input);
        break;
      case 'workingDir':
        setWorkingDir(prev => prev + input);
        break;
      case 'prompt':
        setPrompt(prev => prev + input);
        break;
      case 'parameters':
        setParametersInput(prev => prev + input);
        break;
      case 'env':
        setEnvInput(prev => prev + input);
        break;
    }
  };

  const deleteCharacter = () => {
    switch (selectedField) {
      case 'name':
        setName(prev => prev.slice(0, -1));
        break;
      case 'description':
        setDescription(prev => prev.slice(0, -1));
        break;
      case 'command':
        setCommand(prev => prev.slice(0, -1));
        break;
      case 'shell':
        setShell(prev => prev.slice(0, -1));
        break;
      case 'timeout':
        setTimeoutInput(prev => prev.slice(0, -1));
        break;
      case 'workingDir':
        setWorkingDir(prev => prev.slice(0, -1));
        break;
      case 'prompt':
        setPrompt(prev => prev.slice(0, -1));
        break;
      case 'parameters':
        setParametersInput(prev => prev.slice(0, -1));
        break;
      case 'env':
        setEnvInput(prev => prev.slice(0, -1));
        break;
    }
  };

  useInput((input, key) => {
    if (!tool) {
      if (key.escape) {
        onBack();
      }
      return;
    }
    if (editingText) {
      if (key.return) {
        if (persistTool()) {
          setEditingText(false);
        }
      } else if (key.escape) {
        resetSelectedField(fieldSnapshot);
        setEditingText(false);
      } else if (key.backspace || key.delete) {
        deleteCharacter();
      } else if (input.length === 1 && !key.tab && !key.ctrl && !key.meta) {
        appendCharacter(input);
      }
      return;
    }

    if (key.escape) {
      if (!hasBlockingErrors && persistTool()) {
        onBack();
      }
    } else if (key.upArrow) {
      setSelectedFieldIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedFieldIndex(prev => Math.min(FIELD_ORDER.length - 1, prev + 1));
    } else if (key.return) {
      setFieldSnapshot(getRawFieldValue());
      setEditingText(true);
    }
  });

  if (!tool) {
    return (
      <Box flexDirection="column">
        <Text color="red">Custom tool not found</Text>
      </Box>
    );
  }

  const validationMessages: string[] = [];

  if (name.trim().length === 0) {
    validationMessages.push('Name is required.');
  }
  if (description.trim().length === 0) {
    validationMessages.push('Description is required.');
  }
  if (command.trim().length === 0) {
    validationMessages.push('Command template is required.');
  }
  if (duplicateName) {
    validationMessages.push('Tool name must be unique among custom tools.');
  }
  if (reservedName) {
    validationMessages.push('Tool name must not match a built-in Claude tool.');
  }
  if (timeoutError) {
    validationMessages.push(timeoutError);
  }
  if (parametersError) {
    validationMessages.push(`Parameters JSON: ${parametersError}`);
  }
  if (envError) {
    validationMessages.push(`Env JSON: ${envError}`);
  }

  const hasBlockingErrors =
    name.trim().length === 0 ||
    description.trim().length === 0 ||
    command.trim().length === 0 ||
    duplicateName ||
    reservedName ||
    timeoutError !== null ||
    parametersError !== null ||
    envError !== null;

  const fieldValues: Record<FieldName, string> = {
    name,
    description,
    command,
    shell: shell.length > 0 ? shell : '(default: sh)',
    timeout: timeoutInput.length > 0 ? timeoutInput : '(default: 30000)',
    workingDir:
      workingDir.length > 0 ? workingDir : '(default: Claude Code cwd)',
    prompt: prompt.length > 0 ? prompt : '(auto-generated from description)',
    parameters:
      parametersInput.length > 0 ? parametersInput : JSON.stringify({}),
    env: envInput.length > 0 ? envInput : JSON.stringify({}),
  };

  return (
    <Box flexDirection="column">
      <Header>Edit Custom Tool</Header>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>
          {'enter to edit/save selected field · '}
          {hasBlockingErrors ? (
            <Text color="red">fix errors before going back (esc)</Text>
          ) : (
            <Text dimColor>esc to go back</Text>
          )}
        </Text>
        <Text dimColor>
          While editing, esc restores the saved value for the selected field.
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        {FIELD_ORDER.map((field, index) => {
          const isSelected = selectedFieldIndex === index;

          return (
            <Box key={field} flexDirection="column" marginBottom={1}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '❯ ' : '  '}
                <Text bold>{FIELD_LABELS[field]}</Text>
                {isSelected && editingText ? ' [editing]' : ''}
              </Text>
              <Box marginLeft={4}>
                <Text color={isSelected ? 'cyan' : undefined}>
                  {truncate(fieldValues[field])}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>{FIELD_HINTS[selectedField]}</Text>
      </Box>

      <Box borderStyle="round" padding={1} marginBottom={1}>
        <Box flexDirection="column">
          <Text>
            Parameters:{' '}
            <Text color="yellow">{Object.keys(parsedParameters).length}</Text>
          </Text>
          <Text>
            Env vars:{' '}
            <Text color="yellow">{Object.keys(parsedEnv).length}</Text>
          </Text>
          <Text>
            Active shell: <Text color="green">{shell.trim() || 'sh'}</Text>
          </Text>
          <Text>
            Prompt mode:{' '}
            <Text color="green">{prompt.trim() ? 'custom' : 'generated'}</Text>
          </Text>
        </Box>
      </Box>

      {validationMessages.length > 0 && (
        <Box flexDirection="column">
          {validationMessages.map(message => (
            <Text key={message} color="red">
              {message}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
