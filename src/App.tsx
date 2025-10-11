import { useState, useEffect, createContext, useCallback } from 'react';
import { Box, useInput } from 'ink';
import { MainView } from './components/MainView.js';
import { ThemesView } from './components/ThemesView.js';
import { LaunchTextView } from './components/LaunchTextView.js';
import { ThinkingVerbsView } from './components/ThinkingVerbsView.js';
import { ThinkingStyleView } from './components/ThinkingStyleView.js';
import { UserMessageDisplayView } from './components/UserMessageDisplayView.js';
import { InputBoxView } from './components/InputBoxView.js';
import {
  CONFIG_FILE,
  DEFAULT_SETTINGS,
  MainMenuItem,
  Settings,
  StartupCheckInfo,
  TweakccConfig,
} from './utils/types.js';
import {
  readConfigFile,
  restoreClijsFromBackup,
  updateConfigFile,
} from './utils/config.js';
import { revealFileInExplorer } from './utils/misc.js';
import { applyCustomization } from './utils/patches/index.js';

export const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateSettings: (_updateFn: (settings: Settings) => void) => {},
  changesApplied: false,
  ccVersion: '',
});

export default function App({
  startupCheckInfo,
}: {
  startupCheckInfo: StartupCheckInfo;
}) {
  const [config, setConfig] = useState<TweakccConfig>({
    settings: DEFAULT_SETTINGS,
    changesApplied: false,
    ccVersion: '',
    lastModified: '',
    ccInstallationDir: null,
  });

  // Load the config file.
  useEffect(() => {
    const loadConfig = async () => {
      setConfig(await readConfigFile());
    };
    loadConfig();
  }, []);

  // Function to update the settings, automatically updated changesApplied.
  const updateSettings = useCallback(
    (updateFn: (settings: Settings) => void) => {
      // Create a deep copy of the settings to avoid mutation
      const newSettings = JSON.parse(
        JSON.stringify(config.settings)
      ) as Settings;
      updateFn(newSettings);

      // Update the config with the new settings
      setConfig(prevConfig => ({
        ...prevConfig,
        settings: newSettings,
        changesApplied: false,
      }));

      // Also update the config file
      updateConfigFile(cfg => {
        cfg.settings = newSettings;
        cfg.changesApplied = false;
      });
    },
    [config.settings]
  );

  const [currentView, setCurrentView] = useState<MainMenuItem | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  // Startup check.
  useEffect(() => {
    if (startupCheckInfo.wasUpdated && startupCheckInfo.oldVersion) {
      setNotification({
        message: `Your Claude Code installation was updated from ${startupCheckInfo.oldVersion} to ${startupCheckInfo.newVersion}, and the patching was likely overwritten
(However, your customization are still remembered in ${CONFIG_FILE}.)
Please reapply your changes below.`,
        type: 'warning',
      });
      // Update settings to trigger changedApplied:false.
      updateSettings(() => {});
    }
  }, []);

  // Ctrl+C/Escape/Q to exit.
  useInput(
    (input, key) => {
      if (
        (key.ctrl && input === 'c') ||
        ((input === 'q' || key.escape) && !currentView)
      ) {
        process.exit(0);
      }
    },
    { isActive: !currentView }
  );

  const handleMainSubmit = (item: MainMenuItem) => {
    setNotification(null);
    switch (item) {
      case MainMenuItem.THEMES:
      case MainMenuItem.LAUNCH_TEXT:
      case MainMenuItem.THINKING_VERBS:
      case MainMenuItem.THINKING_STYLE:
      case MainMenuItem.USER_MESSAGE_DISPLAY:
      case MainMenuItem.INPUT_BOX:
        setCurrentView(item);
        break;
      case MainMenuItem.APPLY_CHANGES:
        if (startupCheckInfo.ccInstInfo) {
          setNotification({
            message: 'Applying patches...',
            type: 'info',
          });
          applyCustomization(config, startupCheckInfo.ccInstInfo).then(
            newConfig => {
              setConfig(newConfig);
              setNotification({
                message: 'Customization patches applied successfully!',
                type: 'success',
              });
            }
          );
        }
        break;
      case MainMenuItem.RESTORE_ORIGINAL:
        if (startupCheckInfo.ccInstInfo) {
          restoreClijsFromBackup(startupCheckInfo.ccInstInfo).then(() => {
            setNotification({
              message: 'Original Claude Code restored successfully!',
              type: 'success',
            });
            updateSettings(() => {});
          });
        }
        break;
      case MainMenuItem.OPEN_CONFIG:
        revealFileInExplorer(CONFIG_FILE);
        break;
      case MainMenuItem.OPEN_CLI:
        if (startupCheckInfo.ccInstInfo) {
          revealFileInExplorer(startupCheckInfo.ccInstInfo.cliPath);
        }
        break;
      case MainMenuItem.EXIT:
        process.exit(0);
    }
  };

  const handleBack = () => {
    setCurrentView(null);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings: config.settings,
        updateSettings,
        changesApplied: config.changesApplied,
        ccVersion: startupCheckInfo.ccInstInfo?.version || '',
      }}
    >
      <Box flexDirection="column">
        {currentView === null ? (
          <MainView onSubmit={handleMainSubmit} notification={notification} />
        ) : currentView === MainMenuItem.THEMES ? (
          <ThemesView onBack={handleBack} />
        ) : currentView === MainMenuItem.LAUNCH_TEXT ? (
          <LaunchTextView onBack={handleBack} />
        ) : currentView === MainMenuItem.THINKING_VERBS ? (
          <ThinkingVerbsView onBack={handleBack} />
        ) : currentView === MainMenuItem.THINKING_STYLE ? (
          <ThinkingStyleView onBack={handleBack} />
        ) : currentView === MainMenuItem.USER_MESSAGE_DISPLAY ? (
          <UserMessageDisplayView onBack={handleBack} />
        ) : currentView === MainMenuItem.INPUT_BOX ? (
          <InputBoxView onSubmit={handleBack} />
        ) : null}
      </Box>
    </SettingsContext.Provider>
  );
}
