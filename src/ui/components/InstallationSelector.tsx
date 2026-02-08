import { Box, Text, Newline } from 'ink';

interface Installation {
  id: string;
  type: 'cli' | 'extension';
  fork?: string;
  version: string;
  path: string;
  selected: boolean;
}

interface InstallationSelectorProps {
  installations: Installation[];
  onSelectionChange: (selectedInstallations: Installation[]) => void;
  vsixPath: string;
  onVsixPathChange: (path: string) => void;
  onLoadVsix: () => Promise<void>;
}

export function InstallationSelector({
  installations,
}: InstallationSelectorProps) {
  const selectedCount = installations.filter(i => i.selected).length;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="blue">
        Installation Selection
      </Text>
      <Text dimColor>Select installations to patch:</Text>

      <Box flexDirection="column" gap={1}>
        {installations.map(inst => (
          <Box key={inst.id} justifyContent="space-between">
            <Text>
              {inst.selected ? '✓' : '○'}{' '}
              {inst.type === 'cli' ? '📟 CLI' : '🧩 Extension'} {inst.version}{' '}
              {inst.fork && <Text dimColor>({inst.fork})</Text>}
            </Text>
            <Text dimColor>{inst.path}</Text>
          </Box>
        ))}
      </Box>

      <Newline />
      <Text bold>Load from VSIX:</Text>
      <Text dimColor>VSIX loading not implemented</Text>

      <Newline />
      <Text>
        Selected:{' '}
        <Text bold color="cyan">
          {selectedCount}
        </Text>{' '}
        / {installations.length}
      </Text>
    </Box>
  );
}
