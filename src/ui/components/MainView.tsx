import * as os from 'node:os';

import { Box, Text } from 'ink';
import Link from 'ink-link';

import { MainMenuItem } from '@/types';
import { CONFIG_DIR } from '@/config';

import Header from './Header';
import PiebaldAnnouncement from './PiebaldAnnouncement';
import MainMenu from './MainMenu';

const TweakccHeader = () => (
  <Box flexDirection="row">
    <Header>tweakcc</Header>
    <Text> (by </Text>
    <Link url="https://piebald.ai" fallback={false}>
      <Text color="#ff8400" bold>
        Piebald
      </Text>
    </Link>
    <Text>)</Text>
  </Box>
);

const PleaseStarBanner = () => (
  <Box>
    <Text color="yellow">
      ⭐ <Text bold>Star the repo at </Text>
      <Link url="https://github.com/Piebald-AI/tweakcc" fallback={false}>
        <Text bold color="cyan">
          https://github.com/Piebald-AI/tweakcc
        </Text>
      </Link>
      <Text bold> if you find this useful!</Text> ⭐
    </Text>
  </Box>
);

const NotificationBanner = ({
  notification,
}: {
  notification: NonNullable<MainViewProps['notification']>;
}) => (
  <Box
    borderLeft={true}
    borderRight={false}
    borderTop={false}
    borderBottom={false}
    borderStyle="bold"
    borderColor={
      notification.type === 'success'
        ? 'green'
        : notification.type === 'error'
          ? 'red'
          : notification.type === 'info'
            ? 'blue'
            : 'yellow'
    }
    paddingLeft={1}
    flexDirection="column"
  >
    <Text
      color={
        notification.type === 'success'
          ? 'green'
          : notification.type === 'error'
            ? 'red'
            : notification.type === 'info'
              ? 'blue'
              : 'yellow'
      }
    >
      {notification.message}
    </Text>
  </Box>
);

interface MainViewProps {
  onSubmit: (item: MainMenuItem) => void;
  notification: {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null;
  configMigrated: boolean;
  showPiebaldAnnouncement: boolean;
}

export const MainView = ({
  onSubmit,
  notification,
  configMigrated,
  showPiebaldAnnouncement,
}: MainViewProps) => (
  <Box flexDirection="column" gap={1}>
    {configMigrated && (
      <Box>
        <Text color="blue" bold>
          Note that in tweakcc v3.2.0+, `ccInstallationDir` config is
          deprecated. You are now migrated to `ccInstallationPath` which
          supports npm and native installs.
        </Text>
      </Box>
    )}

    <TweakccHeader />

    <Box>
      <Text>
        <Text bold>Customize your Claude Code installation.</Text>{' '}
        <Text dimColor>
          Settings will be saved to {CONFIG_DIR.replace(os.homedir(), '~')}
          /config.json.
        </Text>
      </Text>
    </Box>

    {showPiebaldAnnouncement ? <PiebaldAnnouncement /> : <PleaseStarBanner />}

    {notification && <NotificationBanner notification={notification} />}

    <MainMenu onSubmit={onSubmit} />
  </Box>
);
