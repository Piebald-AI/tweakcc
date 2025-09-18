// Please see the note about writing patches in ./index.js.

import { buildChalkChain } from '../misc.js';
import {
  findChalkVar,
  LocationResult,
  ModificationEdit,
  showDiff,
} from './index.js';

const getUserMessageDisplayLocation = (
  oldFile: string
): {
  minWidthLocation: LocationResult | null;
  prefixLocation: LocationResult | null;
  messageLocation: LocationResult | null;
} | null => {
  // Search for the exact error message to find the component
  const searchStart = oldFile.indexOf(
    'No content found in user prompt message'
  );
  if (searchStart === -1) {
    console.error('patch: userMessageDisplay: failed to find error message');
    return null;
  }

  // Get 400 characters after the error message as instructed
  const searchEnd = Math.min(oldFile.length, searchStart + 400);
  const searchSection = oldFile.slice(searchStart, searchEnd);

  // Find the minWidth pattern: {minWidth:2,width:2} (no spaces in minified code)
  const minWidthPattern = /\{minWidth:(\d+),width:\d+\}/;
  const minWidthMatch = searchSection.match(minWidthPattern);

  if (!minWidthMatch || minWidthMatch.index === undefined) {
    console.error('patch: userMessageDisplay: failed to find minWidth pattern');
    return null;
  }

  // Updated prefix pattern to match current CLI structure:
  // Real pattern found: Mc.default.createElement(M,{dimColor:!0},">")
  const prefixPattern =
    /\.default\.createElement\([$\w]+,\{dimColor:!0\},"([^"]+)"\)/;
  const prefixMatch = searchSection.match(prefixPattern);

  // Find the message pattern: Updated for current structure
  // Real pattern: Mc.default.createElement(BDB,{text:G,thinkingMetadata:...
  const messagePattern = /createElement\(([$\w]+),\{text:([$\w]+)/;
  const messageMatch = searchSection.match(messagePattern);

  return {
    minWidthLocation: minWidthMatch
      ? {
          startIndex: searchStart + minWidthMatch.index,
          endIndex: searchStart + minWidthMatch.index + minWidthMatch[0].length,
        }
      : minWidthMatch,
    prefixLocation: prefixMatch
      ? {
          startIndex: searchStart + prefixMatch.index!,
          endIndex: searchStart + prefixMatch.index! + prefixMatch[0].length,
        }
      : null,
    messageLocation: messageMatch
      ? {
          startIndex: searchStart + messageMatch.index!,
          endIndex: searchStart + messageMatch.index! + messageMatch[0].length,
        }
      : messageMatch,
  };
};

export const writeUserMessageDisplay = (
  oldFile: string,
  prefix: string,
  prefixColor: string,
  prefixBackgroundColor: string,
  prefixBold: boolean = false,
  prefixItalic: boolean = false,
  prefixUnderline: boolean = false,
  prefixStrikethrough: boolean = false,
  prefixInverse: boolean = false,
  messageColor: string,
  messageBackgroundColor: string,
  messageBold: boolean = false,
  messageItalic: boolean = false,
  messageUnderline: boolean = false,
  messageStrikethrough: boolean = false,
  messageInverse: boolean = false
): string | null => {
  const location = getUserMessageDisplayLocation(oldFile);
  if (!location) {
    console.error(
      'patch: userMessageDisplay: getUserMessageDisplayLocation returned null'
    );
    return null;
  }

  if (!location.minWidthLocation) {
    console.error(
      'patch: userMessageDisplay: failed to find minWidth location'
    );
    return null;
  }
  if (!location.prefixLocation) {
    console.error('patch: userMessageDisplay: failed to find prefix location');
    return null;
  }
  if (!location.messageLocation) {
    console.error('patch: userMessageDisplay: failed to find message location');
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error('patch: userMessageDisplay: failed to find chalk variable');
    return null;
  }

  const modifications: ModificationEdit[] = [];

  // 1. Update minWidth and width (minified format)
  modifications.push({
    startIndex: location.minWidthLocation.startIndex,
    endIndex: location.minWidthLocation.endIndex,
    newContent: `{minWidth:${prefix.length + 1},width:${prefix.length + 1}}`,
  });

  // Check if we should apply customization for prefix
  const isPrefixBlack =
    prefixColor === 'rgb(0,0,0)' && prefixBackgroundColor === 'rgb(0,0,0)';
  const hasPrefixStyling =
    prefixBold ||
    prefixItalic ||
    prefixUnderline ||
    prefixStrikethrough ||
    prefixInverse;
  const shouldCustomizePrefix = !isPrefixBlack || hasPrefixStyling;

  // Check if we should apply customization for message
  const isMessageBlack =
    messageColor === 'rgb(0,0,0)' && messageBackgroundColor === 'rgb(0,0,0)';
  const hasMessageStyling =
    messageBold ||
    messageItalic ||
    messageUnderline ||
    messageStrikethrough ||
    messageInverse;
  const shouldCustomizeMessage = !isMessageBlack || hasMessageStyling;

  // 2. Update prefix
  if (shouldCustomizePrefix) {
    // Build chalk chain for prefix
    const prefixChalkChain = buildChalkChain(
      chalkVar,
      isPrefixBlack ? null : prefixColor.match(/\d+/g)?.join(',') || null,
      isPrefixBlack
        ? null
        : prefixBackgroundColor.match(/\d+/g)?.join(',') || null,
      prefixBold,
      prefixItalic,
      prefixUnderline,
      prefixStrikethrough,
      prefixInverse
    );

    modifications.push({
      startIndex: location.prefixLocation.startIndex,
      endIndex: location.prefixLocation.endIndex,
      newContent: oldFile
        .slice(
          location.prefixLocation.startIndex,
          location.prefixLocation.endIndex
        )
        .replace(/"([^"]+)"\)$/, `${prefixChalkChain}("${prefix}"))`),
    });
  } else {
    // Just update the prefix text without chalk
    modifications.push({
      startIndex: location.prefixLocation.startIndex,
      endIndex: location.prefixLocation.endIndex,
      newContent: oldFile
        .slice(
          location.prefixLocation.startIndex,
          location.prefixLocation.endIndex
        )
        .replace(/"([^"]+)"\)$/, `"${prefix}")`),
    });
  }

  // 3. Update message
  if (shouldCustomizeMessage) {
    // Build chalk chain for message
    const messageChalkChain = buildChalkChain(
      chalkVar,
      isMessageBlack ? null : messageColor.match(/\d+/g)?.join(',') || null,
      isMessageBlack
        ? null
        : messageBackgroundColor.match(/\d+/g)?.join(',') || null,
      messageBold,
      messageItalic,
      messageUnderline,
      messageStrikethrough,
      messageInverse
    );

    modifications.push({
      startIndex: location.messageLocation.startIndex,
      endIndex: location.messageLocation.endIndex,
      newContent: oldFile
        .slice(
          location.messageLocation.startIndex,
          location.messageLocation.endIndex
        )
        .replace(/text:([$\w]+)/, `text:${messageChalkChain}($1)`),
    });
  }
  // If not customizing message, we don't need to modify it at all since we're not changing the text

  // Sort modifications by startIndex in descending order to avoid index shifting issues
  modifications.sort((a, b) => b.startIndex - a.startIndex);

  // Apply modifications
  let newFile = oldFile;
  for (const mod of modifications) {
    const before = newFile;
    newFile =
      newFile.slice(0, mod.startIndex) +
      mod.newContent +
      newFile.slice(mod.endIndex);

    showDiff(before, newFile, mod.newContent, mod.startIndex, mod.endIndex);
  }

  return newFile;
};
