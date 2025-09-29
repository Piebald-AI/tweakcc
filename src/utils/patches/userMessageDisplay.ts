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
  prefixLocation: LocationResult | null;
  messageLocation: LocationResult | null;
} | null => {
  // Search for the exact error message to find the component
  const searchStart =
    oldFile.indexOf('No content found in user prompt message') - 700;
  if (searchStart === -1) {
    console.error('patch: userMessageDisplay: failed to find error message');
    return null;
  }

  const searchEnd = Math.min(oldFile.length, searchStart + 700);
  const searchSection = oldFile.slice(searchStart, searchEnd);

  // `return cD.createElement(M,{dimColor:!0,backgroundColor:void 0},"> ",A);`
  //                                                                 ^^^^ ^
  //                                                                 1    2
  const prefixAndTextPattern = /("> "),([$\w]+)/;
  const prefixAndTextMatch = searchSection.match(prefixAndTextPattern);

  if (!prefixAndTextMatch) {
    return {
      prefixLocation: null,
      messageLocation: null,
    };
  }
  const prefixStart =
    searchStart + searchSection.indexOf(prefixAndTextMatch[1]);
  const prefixEnd = prefixStart + prefixAndTextMatch[1].length;
  const messageStart = prefixEnd + 1; // +1 for the comma
  const messageEnd = messageStart + prefixAndTextMatch[2].length;

  return {
    prefixLocation: {
      startIndex: prefixStart,
      endIndex: prefixEnd,
    },
    messageLocation: {
      startIndex: messageStart,
      endIndex: messageEnd,
    },
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

  // 1. Update prefix
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
      newContent: `${prefixChalkChain}("${prefix}")+" "`,
    });
  }

  // 2. Update message
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
        .replace(/([$\w]+)/, `${messageChalkChain}($1)`),
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
