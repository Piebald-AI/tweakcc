import figlet from 'figlet';
import * as fs from 'node:fs/promises';
import { restoreClijsFromBackup, updateConfigFile } from '../config.js';
import { ClaudeCodeInstallationInfo, TweakccConfig } from '../types.js';
import { isDebug, replaceFileBreakingHardLinks } from '../misc.js';

// Notes to patch-writers:
//
// - Always use [\w$]+ instead of \w+ to match identifiers (variable/function names), because at
//   least in Node.js's regex engine, \w+ does not include $, so ABC$, which is a perfectly valid
//   identifier, would not be matched.  The way cli.js is minified, $ frequently appears in global
//   identifiers.
//
// - When starting a regular expression with an identifier name, for example if you're matching a
//   string of the form "someVarName = ...", make sure to put some kind of word boundary at the
//   beginning, like `\b`.  This can **SIGNIFICANTLY** speed up matching, easily taking a 1.5s
//   search down to 80ms.  More specific boundaries like explicitly requiring a particular
//   character such as ',' or ';' can speed up matching even further, e.g. down to 30ms.
//

import { writeShowMoreItemsInSelectMenus } from './showMoreItemsInSelectMenus.js';
import { writeThemes } from './themes.js';
import { writeContextLimit } from './contextLimit.js';
import { writeInputBoxBorder } from './inputBorderBox.js';
import { writeSigninBannerText } from './signinBannerText.js';
import { writeSpinnerNoFreeze } from './spinnerNoFreeze.js';
import { writeThinkerFormat } from './thinkerFormat.js';
import { writeThinkerSymbolMirrorOption } from './thinkerMirrorOption.js';
import { writeThinkerSymbolChars } from './thinkerSymbolChars.js';
import { writeThinkerSymbolSpeed } from './thinkerSymbolSpeed.js';
import { writeThinkerSymbolWidthLocation } from './thinkerSymbolWidth.js';
import { writeThinkerVerbs } from './thinkerVerbs.js';
import { writeUserMessageDisplay } from './userMessageDisplay.js';
import { writeVerboseProperty } from './verboseProperty.js';
import { writeWelcomeMessage } from './welcomeMessage.js';
import { writeModelCustomizations } from './modelSelector.js';
import { writeIgnoreMaxSubscription } from './ignoreMaxSubscription.js';
import { writeVersionOutput } from './versionOutput.js';

export interface LocationResult {
  startIndex: number;
  endIndex: number;
  identifiers?: string[];
}

export interface ModificationEdit {
  startIndex: number;
  endIndex: number;
  newContent: string;
}

// Debug function for showing diffs (currently disabled)
export const showDiff = (
  oldFileContents: string,
  newFileContents: string,
  injectedText: string,
  startIndex: number,
  endIndex: number
): void => {
  const contextStart = Math.max(0, startIndex - 20);
  const contextEndOld = Math.min(oldFileContents.length, endIndex + 20);
  const contextEndNew = Math.min(
    newFileContents.length,
    startIndex + injectedText.length + 20
  );

  const oldBefore = oldFileContents.slice(contextStart, startIndex);
  const oldChanged = oldFileContents.slice(startIndex, endIndex);
  const oldAfter = oldFileContents.slice(endIndex, contextEndOld);

  const newBefore = newFileContents.slice(contextStart, startIndex);
  const newChanged = newFileContents.slice(
    startIndex,
    startIndex + injectedText.length
  );
  const newAfter = newFileContents.slice(
    startIndex + injectedText.length,
    contextEndNew
  );

  if (isDebug() && oldChanged !== newChanged) {
    console.log('\n--- Diff ---');
    console.log('OLD:', oldBefore + `\x1b[31m${oldChanged}\x1b[0m` + oldAfter);
    console.log('NEW:', newBefore + `\x1b[32m${newChanged}\x1b[0m` + newAfter);
    console.log('--- End Diff ---\n');
  }
};

export const findChalkVar = (fileContents: string): string | undefined => {
  // Find chalk variable using the counting method
  const chalkPattern =
    /\b([$\w]+)(?:\.(?:cyan|gray|green|red|yellow|ansi256|bgAnsi256|bgHex|bgRgb|hex|rgb|bold|dim|inverse|italic|strikethrough|underline)\b)+\(/g;
  const chalkMatches = Array.from(fileContents.matchAll(chalkPattern));

  // Count occurrences of each variable
  const chalkCounts: Record<string, number> = {};
  for (const match of chalkMatches) {
    const varName = match[1];
    chalkCounts[varName] = (chalkCounts[varName] || 0) + 1;
  }

  // Find the variable with the most occurrences
  let chalkVar;
  let maxCount = 0;
  for (const [varName, count] of Object.entries(chalkCounts)) {
    if (count > maxCount) {
      maxCount = count;
      chalkVar = varName;
    }
  }
  return chalkVar;
};

export const applyCustomization = async (
  config: TweakccConfig,
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<TweakccConfig> => {
  // Clean up any existing customizations, which will likely break the heuristics, by restoring the
  // original file from the backup.
  await restoreClijsFromBackup(ccInstInfo);

  let content = await fs.readFile(ccInstInfo.cliPath, { encoding: 'utf8' });

  // Apply themes
  let result: string | null = null;
  if (config.settings.themes && config.settings.themes.length > 0) {
    if ((result = writeThemes(content, config.settings.themes)))
      content = result;
  }

  // Apply launch text
  if (config.settings.launchText) {
    const c = config.settings.launchText;
    let textToApply = '';
    if (c.method === 'custom' && c.customText) {
      textToApply = c.customText;
    } else if (c.method === 'figlet' && c.figletText) {
      textToApply = await new Promise<string>(resolve =>
        figlet.text(
          c.figletText.replace('\n', ' '),
          c.figletFont as unknown as figlet.Fonts,
          (err, data) => {
            if (err) {
              console.error('patch: figlet: failed to generate text', err);
              resolve('');
            } else {
              resolve(data || '');
            }
          }
        )
      );
    }
    if ((result = writeSigninBannerText(content, textToApply)))
      content = result;

    // Also apply customText to welcome message if it's defined
    const welcomeMessage = c.method === 'custom' ? c.customText : c.figletText;
    if (welcomeMessage) {
      if ((result = writeWelcomeMessage(content, welcomeMessage)))
        content = result;
    }
  }

  // Apply thinking verbs
  // prettier-ignore
  if (config.settings.thinkingVerbs) {
    if ((result = writeThinkerVerbs(content, config.settings.thinkingVerbs.verbs)))
      content = result;
    if ((result = writeThinkerFormat(content, config.settings.thinkingVerbs.format)))
      content = result;
  }

  // Apply thinking style
  // prettier-ignore
  if ((result = writeThinkerSymbolChars(content, config.settings.thinkingStyle.phases)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolSpeed(content, config.settings.thinkingStyle.updateInterval)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolWidthLocation(content, Math.max(...config.settings.thinkingStyle.phases.map(p => p.length)) + 1)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolMirrorOption(content, config.settings.thinkingStyle.reverseMirror)))
    content = result;

  // Apply user message display customization
  if (config.settings.userMessageDisplay) {
    if (
      (result = writeUserMessageDisplay(
        content,
        config.settings.userMessageDisplay.prefix.format,
        config.settings.userMessageDisplay.prefix.foreground_color,
        config.settings.userMessageDisplay.prefix.background_color,
        config.settings.userMessageDisplay.prefix.styling.includes('bold'),
        config.settings.userMessageDisplay.prefix.styling.includes('italic'),
        config.settings.userMessageDisplay.prefix.styling.includes('underline'),
        config.settings.userMessageDisplay.prefix.styling.includes(
          'strikethrough'
        ),
        config.settings.userMessageDisplay.prefix.styling.includes('inverse'),
        config.settings.userMessageDisplay.message.foreground_color,
        config.settings.userMessageDisplay.message.background_color,
        config.settings.userMessageDisplay.message.styling.includes('bold'),
        config.settings.userMessageDisplay.message.styling.includes('italic'),
        config.settings.userMessageDisplay.message.styling.includes(
          'underline'
        ),
        config.settings.userMessageDisplay.message.styling.includes(
          'strikethrough'
        ),
        config.settings.userMessageDisplay.message.styling.includes('inverse')
      ))
    ) {
      content = result;
    }
  }

  // Apply input box border customization
  if (
    config.settings.inputBox &&
    typeof config.settings.inputBox.removeBorder === 'boolean'
  ) {
    if (
      (result = writeInputBoxBorder(
        content,
        config.settings.inputBox.removeBorder
      ))
    )
      content = result;
  }

  // Apply verbose property patch (always true by default)
  if ((result = writeVerboseProperty(content))) content = result;

  // Apply spinner no-freeze patch (always enabled)
  if ((result = writeSpinnerNoFreeze(content))) content = result;

  // Apply context limit patch (always enabled)
  if ((result = writeContextLimit(content))) content = result;

  // Apply model customizations (known names, mapping, selector options) (always enabled)
  if ((result = writeModelCustomizations(content))) content = result;

  // Apply show more items in select menus patch (always enabled)
  if ((result = writeShowMoreItemsInSelectMenus(content, 25))) content = result;

  // Disable Max subscription gating for cost tool (always enabled)
  if ((result = writeIgnoreMaxSubscription(content))) content = result;

  // Apply version output modification (always enabled)
  if ((result = writeVersionOutput(content, '1.6.0'))) content = result;

  // Replace the file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(ccInstInfo.cliPath, content, 'patch');

  return await updateConfigFile(config => {
    config.changesApplied = true;
  });
};
