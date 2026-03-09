import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

import { Theme } from '@/types';
import { DEFAULT_THEME } from '@/defaultSettings';
import { deepMergeWithDefaults } from '@/utils';
import {
  CommunityTheme,
  CommunityThemeIndexEntry,
  fetchCommunityThemeIndex,
  fetchCommunityTheme,
} from '@/communityThemes';

import { SettingsContext } from '../App';
import { ThemePreview } from './ThemePreview';
import Header from './Header';

// ======================================================================

interface CommunityThemesViewProps {
  onBack: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; entries: CommunityThemeIndexEntry[] };

export function CommunityThemesView({ onBack }: CommunityThemesViewProps) {
  const { updateSettings } = useContext(SettingsContext);

  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const previewRequestId = useRef(0);

  useEffect(() => {
    fetchCommunityThemeIndex()
      .then(entries => {
        setLoadState({ status: 'loaded', entries });
      })
      .catch((err: Error) => {
        setLoadState({ status: 'error', message: err.message });
      });
  }, []);

  const entries = loadState.status === 'loaded' ? loadState.entries : [];

  // ======================================================================

  const loadPreview = useCallback(async (id: string) => {
    const requestId = ++previewRequestId.current;
    setPreviewLoading(true);
    setStatusMessage(null);
    try {
      const theme = await fetchCommunityTheme(id);
      if (requestId !== previewRequestId.current) return;
      const merged = deepMergeWithDefaults(
        theme,
        DEFAULT_THEME
      ) as CommunityTheme;
      setPreviewTheme(merged);
    } catch {
      if (requestId !== previewRequestId.current) return;
      setPreviewTheme(null);
      setStatusMessage('Failed to load preview.');
    } finally {
      if (requestId === previewRequestId.current) {
        setPreviewLoading(false);
      }
    }
  }, []);

  const downloadAndAdd = useCallback(
    async (entry: CommunityThemeIndexEntry) => {
      setStatusMessage('Downloading theme…');
      try {
        const theme = await fetchCommunityTheme(entry.id);
        const merged = deepMergeWithDefaults(
          theme,
          DEFAULT_THEME
        ) as CommunityTheme;

        let added = false;
        updateSettings(s => {
          if (s.themes.some(t => t.id === merged.id)) return;
          s.themes.push(merged);
          added = true;
        });
        if (added) {
          setStatusMessage(`Added "${merged.name}" to your themes!`);
        } else {
          setStatusMessage(
            `Theme "${merged.name}" (${merged.id}) is already in your config.`
          );
        }
      } catch {
        setStatusMessage('Failed to download theme.');
      }
    },
    [updateSettings]
  );

  // ======================================================================

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (loadState.status !== 'loaded') return;
    const count = loadState.entries.length;
    if (count === 0) return;

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      setPreviewTheme(null);
      setStatusMessage(null);
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(count - 1, prev + 1));
      setPreviewTheme(null);
      setStatusMessage(null);
    } else if (input === ' ') {
      const entry = loadState.entries[selectedIndex];
      if (entry) {
        loadPreview(entry.id);
      }
    } else if (key.return) {
      const entry = loadState.entries[selectedIndex];
      if (entry) {
        downloadAndAdd(entry);
      }
    }
  });

  // ======================================================================

  if (loadState.status === 'loading') {
    return (
      <Box flexDirection="column">
        <Header>Community Themes</Header>
        <Text>Loading community themes…</Text>
      </Box>
    );
  }

  if (loadState.status === 'error') {
    return (
      <Box flexDirection="column">
        <Header>Community Themes</Header>
        <Text color="red">Error: {loadState.message}</Text>
        <Text dimColor>esc to go back</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Box flexDirection="column" width="50%">
        <Header>Community Themes</Header>
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>space to preview theme</Text>
          <Text dimColor>enter to download theme</Text>
          <Text dimColor>esc to go back</Text>
        </Box>

        <Box flexDirection="column">
          {entries.map((entry, index) => (
            <Text
              key={entry.id}
              color={selectedIndex === index ? 'yellow' : undefined}
            >
              {selectedIndex === index ? '❯ ' : '  '}
              {entry.name} ({entry.id}) by @{entry.author}
            </Text>
          ))}
        </Box>

        {statusMessage && (
          <Box marginTop={1}>
            <Text color="cyan">{statusMessage}</Text>
          </Box>
        )}

        {previewLoading && (
          <Box marginTop={1}>
            <Text dimColor>Loading preview…</Text>
          </Box>
        )}
      </Box>

      <Box width="50%">
        {previewTheme ? (
          <ThemePreview theme={previewTheme} />
        ) : (
          <Box
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
            height={10}
          >
            <Text dimColor>Press space to preview the selected theme.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
