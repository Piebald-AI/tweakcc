import { useState, useEffect, createContext, useCallback } from 'react';
import { Box, useInput } from 'ink';
import { MainView } from './components/MainView.js';
import { ThemesView } from './components/ThemesView.js';
import { LaunchTextView } from './components/LaunchTextView.js';
import { ThinkingVerbsView } from './components/ThinkingVerbsView.js';
import { ThinkingStyleView } from './components/ThinkingStyleView.js';
import {
  ClaudeCodeInstallationInfo,
  CONFIG_FILE,
  DEFAULT_SETTINGS,
  MainMenuItem,
  Settings,
  TweakccConfig,
} from './utils/types.js';
import {
  findClaudeCodeInstallation,
  readConfigFile,
  restoreClijsFromBackup,
  startupCheck,
  updateConfigFile,
} from './utils/config.js';
import { revealFileInExplorer } from './utils/misc.js';
import { applyCustomization } from './utils/patching.js';

export const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateSettings: (_updateFn: (settings: Settings) => void) => {},
  changesApplied: false,
});

export default function App() {
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

  // Load Claude Code installation info; used for the revert, apply, and locate cli.js options.
  const [ccInstInfo, setCcInstInfo] =
    useState<ClaudeCodeInstallationInfo | null>(null);
  useEffect(() => {
    const loadCcInstInfo = async () => {
      setCcInstInfo(await findClaudeCodeInstallation(config));
    };
    loadCcInstInfo();
  }, [config]);

  // Function to update the settings, automatically updated changesApplied.
  const updateSettings = useCallback(
    (updateFn: (settings: Settings) => void) => {
      updateFn(config.settings);
      updateConfigFile(cfg => {
        cfg.settings = config.settings;
        cfg.changesApplied = false;
      }).then(newConfig => {
        setConfig(newConfig);
      });
    },
    [config]
  );

  const [currentView, setCurrentView] = useState<MainMenuItem | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  // Startup check.
  useEffect(() => {
    const performStartupCheck = async () => {
      const info = await startupCheck();
      if (info.wasUpdated) {
        setNotification({
          message: `Your Claude Code installation was updated from ${info.oldVersion} to ${info.newVersion}, and the patching was likely overwritten
(However, your customization are still remembered in ${CONFIG_FILE}.)
Please reapply your changes below.`,
          type: 'warning',
        });
        // Update settings to trigger changedApplied:false.
        updateSettings(() => {});
      }
    };
    performStartupCheck();
  }, []);

  // Ctrl+C/Escape/Q to exit.
  useInput((input, key) => {
    if (
      (key.ctrl && input === 'c') ||
      ((input === 'q' || key.escape) && !currentView)
    ) {
      process.exit(0);
    }
  });

  const handleMainSubmit = (item: MainMenuItem) => {
    setNotification(null);
    switch (item) {
      case MainMenuItem.THEMES:
      case MainMenuItem.LAUNCH_TEXT:
      case MainMenuItem.THINKING_VERBS:
      case MainMenuItem.THINKING_STYLE:
        setCurrentView(item);
        break;
      case MainMenuItem.APPLY_CHANGES:
        if (ccInstInfo) {
          setNotification({
            message: 'Applying patches...',
            type: 'info',
          });
          applyCustomization(config, ccInstInfo).then(newConfig => {
            setConfig(newConfig);
            setNotification({
              message: 'Customization patches applied successfully!',
              type: 'success',
            });
          });
        }
        break;
      case MainMenuItem.RESTORE_ORIGINAL:
        if (ccInstInfo) {
          restoreClijsFromBackup(ccInstInfo).then(() => {
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
        if (ccInstInfo) {
          revealFileInExplorer(ccInstInfo.cliPath);
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
        ) : null}
      </Box>
    </SettingsContext.Provider>
  );
}
