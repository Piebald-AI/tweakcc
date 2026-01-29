import { useState, useEffect, createContext, useCallback } from 'react';
import { Box, useInput } from 'ink';
import { MainView } from './components/MainView';
import { ThemesView } from './components/ThemesView';
import { ThinkingVerbsView } from './components/ThinkingVerbsView';
import { ThinkingStyleView } from './components/ThinkingStyleView';
import { UserMessageDisplayView } from './components/UserMessageDisplayView';
import { InputPatternHighlightersView } from './components/InputPatternHighlightersView';
import { MiscView } from './components/MiscView';
import { ToolsetsView } from './components/ToolsetsView';
import { SubagentModelsView } from './components/SubagentModelsView';
import {
  MainMenuItem,
  Settings,
  StartupCheckInfo,
  TweakccConfig,
} from '../types';
import {
  CONFIG_FILE,
  readConfigFile,
  SYSTEM_PROMPTS_DIR,
  updateConfigFile,
} from '../config';
import { openInExplorer, revealFileInExplorer } from '../utils';
import { applyCustomization, ApplyCustomizationResult } from '../patches/index';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import {
  restoreNativeBinaryFromBackup,
  restoreClijsFromBackup,
} from '../installationBackup';

export const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateSettings: (_updateFn: (settings: Settings) => void) => {},
  changesApplied: false,
  ccVersion: '',
});

export default function App({
  startupCheckInfo,
  configMigrated,
}: {
  startupCheckInfo: StartupCheckInfo;
  configMigrated: boolean;
}) {
  const [config, setConfig] = useState<TweakccConfig>({
    settings: DEFAULT_SETTINGS,
    changesApplied: false,
    ccVersion: '',
    lastModified: '',
  });
  const [showPiebaldAnnouncement, setShowPiebaldAnnouncement] = useState(false);

  // Load the config file.
  useEffect(() => {
    const loadConfig = async () => {
      const loadedConfig = await readConfigFile();
      setConfig(loadedConfig);
      // Show the Piebald announcement only if not hidden in config
      setShowPiebaldAnnouncement(!loadedConfig.hidePiebaldAnnouncement);
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

  // Ctrl+C/Escape/Q to exit. Escape first hides the Piebald announcement if showing.
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        process.exit(0);
      }
      if ((input === 'q' || key.escape) && !currentView) {
        process.exit(0);
      }
      if (input === 'h' && !currentView && showPiebaldAnnouncement) {
        setShowPiebaldAnnouncement(false);
        // Save the hide preference to config
        updateConfigFile(cfg => {
          cfg.hidePiebaldAnnouncement = true;
        });
      }
    },
    { isActive: !currentView }
  );

  const handleMainSubmit = (item: MainMenuItem) => {
    setNotification(null);
    switch (item) {
      case MainMenuItem.APPLY_CHANGES:
        if (startupCheckInfo.ccInstInfo) {
          setNotification({
            message: 'Applying patches...',
            type: 'info',
          });
          applyCustomization(config, startupCheckInfo.ccInstInfo).then(
            (result: ApplyCustomizationResult) => {
              setConfig(result.config);
              setNotification({
                message: 'Customization patches applied successfully!',
                type: 'success',
              });
            }
          );
        }
        break;
      case MainMenuItem.THEMES:
      case MainMenuItem.THINKING_VERBS:
      case MainMenuItem.THINKING_STYLE:
      case MainMenuItem.USER_MESSAGE_DISPLAY:
      case MainMenuItem.INPUT_PATTERN_HIGHLIGHTERS:
      case MainMenuItem.MISC:
      case MainMenuItem.TOOLSETS:
      case MainMenuItem.SUBAGENT_MODELS:
        setCurrentView(item);
        break;
      case MainMenuItem.VIEW_SYSTEM_PROMPTS:
        openInExplorer(SYSTEM_PROMPTS_DIR);
        break;
      case MainMenuItem.RESTORE_ORIGINAL:
        if (startupCheckInfo.ccInstInfo) {
          // Use the appropriate restore function based on installation type
          const restorePromise = startupCheckInfo.ccInstInfo
            .nativeInstallationPath
            ? restoreNativeBinaryFromBackup(startupCheckInfo.ccInstInfo)
            : restoreClijsFromBackup(startupCheckInfo.ccInstInfo);

          restorePromise.then(() => {
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
        if (startupCheckInfo.ccInstInfo?.cliPath) {
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
          <MainView
            onSubmit={handleMainSubmit}
            notification={notification}
            configMigrated={configMigrated}
            showPiebaldAnnouncement={showPiebaldAnnouncement}
          />
        ) : currentView === MainMenuItem.THEMES ? (
          <ThemesView onBack={handleBack} />
        ) : currentView === MainMenuItem.THINKING_VERBS ? (
          <ThinkingVerbsView onBack={handleBack} />
        ) : currentView === MainMenuItem.THINKING_STYLE ? (
          <ThinkingStyleView onBack={handleBack} />
        ) : currentView === MainMenuItem.USER_MESSAGE_DISPLAY ? (
          <UserMessageDisplayView onBack={handleBack} />
        ) : currentView === MainMenuItem.INPUT_PATTERN_HIGHLIGHTERS ? (
          <InputPatternHighlightersView onBack={handleBack} />
        ) : currentView === MainMenuItem.MISC ? (
          <MiscView onSubmit={handleBack} />
        ) : currentView === MainMenuItem.TOOLSETS ? (
          <ToolsetsView onBack={handleBack} />
        ) : currentView === MainMenuItem.SUBAGENT_MODELS ? (
          <SubagentModelsView onBack={handleBack} />
        ) : null}
      </Box>
    </SettingsContext.Provider>
  );
}
