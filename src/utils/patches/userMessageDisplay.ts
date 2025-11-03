// Please see the note about writing patches in ./index.js.
import {
  findChalkVar,
  LocationResult,
  showDiff,
} from './index.js';

const getUserMessageDisplayLocation = (
  oldFile: string
): LocationResult | null => {
  // Search for the exact error message to find the component
  const messageDisplayPattern =
    /return [$\w]+\.createElement\([$\w]+,\{backgroundColor:"userMessageBackground",color:"text"\},"> ",([$\w]+)\+" "\);/;
  const messageDisplayMatch = oldFile.match(messageDisplayPattern);
  if (!messageDisplayMatch || messageDisplayMatch.index == undefined) {
    console.error('patch: messageDisplayMatch: failed to find error message');
    return null;
  }

  const subIndex =
    messageDisplayMatch.index +
    messageDisplayMatch[0].indexOf('{backgroundColor');

  return {
    startIndex: subIndex,
    endIndex: messageDisplayMatch.length - 2,
    identifiers: [messageDisplayMatch[2]],
  };
};

export const writeUserMessageDisplay = (
  oldFile: string,
  format: string,
  foregroundColor: string | "default",
  backgroundColor: string | "default" | null,
  bold: boolean = false,
  italic: boolean = false,
  underline: boolean = false,
  strikethrough: boolean = false,
  inverse: boolean = false,
  borderStyle: string = 'none',
  borderColor: string = 'rgb(255,255,255)',
  paddingX: number = 0,
  paddingY: number = 0
): string | null => {
  const location = getUserMessageDisplayLocation(oldFile);
  if (!location) {
    console.error(
      'patch: userMessageDisplay: getUserMessageDisplayLocation returned null'
    );
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error('patch: userMessageDisplay: failed to find chalk variable');
    return null;
  }

  const messageIdentifier = location.identifiers?.[0];
  if (!messageIdentifier) {
    console.error('patch: userMessageDisplay: failed to find message identifier');
    return null;
  }

  // Determine if we need chalk styling (custom RGB colors or text styling)
  const needsChalk =
    (foregroundColor !== 'default') ||
    (backgroundColor !== 'default' && backgroundColor !== null) ||
    bold || italic || underline || strikethrough || inverse;

  // Replace {} in format string with the message variable
  const formattedMessage = format.replace(/\{\}/g, `"+${messageIdentifier}+"`);

  let newContent: string;

  if (needsChalk) {
    // Build chalk chain for custom colors and/or styling
    let chalkChain = chalkVar;

    // Only add color methods for custom (non-default, non-null) colors
    if (foregroundColor !== 'default') {
      const fgMatch = foregroundColor.match(/\d+/g);
      if (fgMatch) {
        chalkChain += `.rgb(${fgMatch.join(',')})`;
      }
    }

    if (backgroundColor !== 'default' && backgroundColor !== null) {
      const bgMatch = backgroundColor.match(/\d+/g);
      if (bgMatch) {
        chalkChain += `.bgRgb(${bgMatch.join(',')})`;
      }
    }

    // Apply styling
    if (bold) chalkChain += '.bold';
    if (italic) chalkChain += '.italic';
    if (underline) chalkChain += '.underline';
    if (strikethrough) chalkChain += '.strikethrough';
    if (inverse) chalkChain += '.inverse';

    // Build attributes object with border properties
    const attrs: string[] = [];
    // Custom border styles (topBottom*) are not standard Ink styles, so skip them
    const isCustomBorder = borderStyle.startsWith('topBottom');
    if (borderStyle !== 'none' && !isCustomBorder) {
      attrs.push(`borderStyle:"${borderStyle}"`);
      const borderMatch = borderColor.match(/\d+/g);
      if (borderMatch) {
        attrs.push(`borderColor:"rgb(${borderMatch.join(',')})"`);
      }
    }
    if (paddingX > 0) {
      attrs.push(`paddingX:${paddingX}`);
    }
    if (paddingY > 0) {
      attrs.push(`paddingY:${paddingY}`);
    }

    const attrsStr = attrs.length > 0 ? `{${attrs.join(',')}}` : '{}';
    newContent = `${attrsStr},${chalkChain}("${formattedMessage}")`;
  } else {
    // Use Ink/React attributes for default colors and border
    const attrs: string[] = [];

    if (backgroundColor === 'default') {
      attrs.push('backgroundColor:"userMessageBackground"');
    }

    if (foregroundColor === 'default') {
      attrs.push('color:"text"');
    }

    // Custom border styles (topBottom*) are not standard Ink styles, so skip them
    const isCustomBorder = borderStyle.startsWith('topBottom');
    if (borderStyle !== 'none' && !isCustomBorder) {
      attrs.push(`borderStyle:"${borderStyle}"`);
      const borderMatch = borderColor.match(/\d+/g);
      if (borderMatch) {
        attrs.push(`borderColor:"rgb(${borderMatch.join(',')})"`);
      }
    }

    if (paddingX > 0) {
      attrs.push(`paddingX:${paddingX}`);
    }
    if (paddingY > 0) {
      attrs.push(`paddingY:${paddingY}`);
    }

    const attrsStr = attrs.length > 0 ? `{${attrs.join(',')}}` : '{}';
    newContent = `${attrsStr},"${formattedMessage}"`;
  }

  // Apply modification
  const before = oldFile;
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newContent +
    oldFile.slice(location.endIndex);

  showDiff(before, newFile, newContent, location.startIndex, location.endIndex);

  return newFile;
};
