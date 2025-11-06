// Please see the note about writing patches in ./index.js.
import { findChalkVar, LocationResult, showDiff } from './index.js';

const getUserMessageDisplayLocation = (
  oldFile: string
): LocationResult | null => {
  // Search for the exact error message to find the component
  const messageDisplayPattern =
    /return ([$\w]+)\.createElement\(([$\w]+),\{backgroundColor:"userMessageBackground",color:"text"\},"> ",([$\w]+)\+" "\);/;
  const messageDisplayMatch = oldFile.match(messageDisplayPattern);
  if (!messageDisplayMatch || messageDisplayMatch.index == undefined) {
    console.error('patch: messageDisplayMatch: failed to find error message');
    return null;
  }

  return {
    startIndex: messageDisplayMatch.index,
    endIndex: messageDisplayMatch.index + messageDisplayMatch[0].length,
    identifiers: [messageDisplayMatch[1], messageDisplayMatch[2], messageDisplayMatch[3]],
  };
};

export const writeUserMessageDisplay = (
  oldFile: string,
  format: string,
  foregroundColor: string | 'default',
  backgroundColor: string | 'default' | null,
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

  // Determine if we need chalk styling (custom RGB colors or text styling)
  const needsChalk =
    foregroundColor !== 'default' ||
    (backgroundColor !== 'default' && backgroundColor !== null) ||
    bold ||
    italic ||
    underline ||
    strikethrough ||
    inverse;

  let attrsObjStr: string;
  let chalkChain: string = '';

  if (needsChalk) {
    // Build chalk chain for custom colors and/or styling
    chalkChain = chalkVar;

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

    attrsObjStr = attrs.length > 0 ? `{${attrs.join(',')}}` : '{}';
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

    attrsObjStr = attrs.length > 0 ? `{${attrs.join(',')}}` : '{}';
  }

  const [reactVar, component, messageVar] = location.identifiers!;
  // Replace {} in format string with the message variable
  const formattedMessage = '"' + format.replace(/\{\}/g, `"+${messageVar}+"`) + '"';

  const newContent = `return ${reactVar}.createElement(${component},${attrsObjStr},${chalkChain}(${formattedMessage}));`;

  // Apply modification
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newContent +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    newContent,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};
