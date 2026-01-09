// Please see the note about writing patches in ./index
import {
  findBoxComponent,
  findChalkVar,
  LocationResult,
  showDiff,
} from './index';

const getUserMessageDisplayLocation = (
  oldFile: string
): LocationResult | null => {
  // v2.1.2+ format:
  // return WE.createElement(T,{flexDirection:"column",marginTop:A?1:0,width:"100%"},
  //   WE.createElement($,{backgroundColor:"userMessageBackground"},
  //     WE.createElement($,{color:"subtle"},sA.pointer," "),
  //     WE.createElement($,{color:"text"},J," ")))
  const newPattern =
    /return ([$\w]+)\.createElement\(([$\w]+),\{flexDirection:"column",marginTop:[^}]+\},([$\w]+)\.createElement\(([$\w]+),\{backgroundColor:"userMessageBackground"\},[^)]+\.createElement\([^,]+,\{color:"subtle"\},[^)]+\),[^)]+\.createElement\([^,]+,\{color:"text"\},([$\w]+)," "\)\)\)/;
  const newMatch = oldFile.match(newPattern);
  if (newMatch && newMatch.index !== undefined) {
    return {
      startIndex: newMatch.index,
      endIndex: newMatch.index + newMatch[0].length,
      identifiers: [
        newMatch[1], // React var (WE)
        newMatch[4], // Text component ($)
        newMatch[5], // message var (J)
        newMatch[2], // Box component (T)
        'new', // format marker
      ],
    };
  }

  // Legacy format: return X.createElement(Y,{backgroundColor:"userMessageBackground",color:"text"},"> ",Z+" ");
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
    identifiers: [
      messageDisplayMatch[1],
      messageDisplayMatch[2],
      messageDisplayMatch[3],
      '', // no separate box component in legacy
      'legacy',
    ],
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
  paddingY: number = 0,
  fitBoxToContent: boolean = false
): string | null => {
  const location = getUserMessageDisplayLocation(oldFile);
  if (!location) {
    console.error(
      '^ patch: userMessageDisplay: getUserMessageDisplayLocation returned null'
    );
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error('^ patch: userMessageDisplay: failed to find chalk variable');
    return null;
  }

  const boxComponent = findBoxComponent(oldFile);
  if (!boxComponent) {
    console.error('^ patch: userMessageDisplay: failed to find box component');
    return null;
  }

  let chalkChain: string = '';

  // Build Ink attributes for default theme colors (do this ALWAYS, not conditionally)
  const textAttrs: string[] = [];
  if (foregroundColor === 'default') {
    textAttrs.push('color:"text"');
  }
  if (backgroundColor === 'default') {
    textAttrs.push('backgroundColor:"userMessageBackground"');
  }
  const textAttrsObjStr =
    textAttrs.length > 0 ? `{${textAttrs.join(',')}}` : '{}';

  // Build box attributes (border and padding)
  const boxAttrs: string[] = [];
  const isCustomBorder = borderStyle.startsWith('topBottom');

  if (borderStyle !== 'none') {
    if (isCustomBorder) {
      // Custom topBottom borders - only show top and bottom
      let customBorder = '';

      if (borderStyle === 'topBottomSingle') {
        customBorder =
          '{top:"─",bottom:"─",left:" ",right:" ",topLeft:" ",topRight:" ",bottomLeft:" ",bottomRight:" "}';
      } else if (borderStyle === 'topBottomDouble') {
        customBorder =
          '{top:"═",bottom:"═",left:" ",right:" ",topLeft:" ",topRight:" ",bottomLeft:" ",bottomRight:" "}';
      } else if (borderStyle === 'topBottomBold') {
        customBorder =
          '{top:"━",bottom:"━",left:" ",right:" ",topLeft:" ",topRight:" ",bottomLeft:" ",bottomRight:" "}';
      }

      boxAttrs.push(`borderStyle:${customBorder}`);
    } else {
      // Standard Ink border styles
      boxAttrs.push(`borderStyle:"${borderStyle}"`);
    }

    const borderMatch = borderColor.match(/\d+/g);
    if (borderMatch) {
      boxAttrs.push(`borderColor:"rgb(${borderMatch.join(',')})"`);
    }
  }
  if (paddingX > 0) {
    boxAttrs.push(`paddingX:${paddingX}`);
  }
  if (paddingY > 0) {
    boxAttrs.push(`paddingY:${paddingY}`);
  }
  if (fitBoxToContent) {
    boxAttrs.push(`alignSelf:"flex-start"`);
  }
  const boxAttrsObjStr = boxAttrs.length > 0 ? `{${boxAttrs.join(',')}}` : '{}';

  // Determine if we need chalk styling (custom RGB colors or text styling)
  const needsChalk =
    foregroundColor !== 'default' ||
    (backgroundColor !== 'default' && backgroundColor !== null) ||
    bold ||
    italic ||
    underline ||
    strikethrough ||
    inverse;

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
  }

  const [
    reactVar,
    textComponent,
    messageVar,
    boxComponentFromMatch,
    formatType,
  ] = location.identifiers!;
  // Replace {} in format string with the message variable
  const formattedMessage =
    '"' + format.replace(/\{\}/g, `"+${messageVar}+"`) + '"';

  // Use box component from match if available (new format), otherwise use found one
  const finalBoxComponent = boxComponentFromMatch || boxComponent;

  let newContent: string;

  if (formatType === 'new') {
    // New format (v2.1.2+): preserve the outer Box structure
    newContent = `
return ${reactVar}.createElement(
  ${finalBoxComponent},
  {flexDirection:"column",marginTop:1,width:"100%",...${boxAttrsObjStr}},
  ${reactVar}.createElement(
    ${textComponent},
    ${textAttrsObjStr},
    ${needsChalk ? chalkChain + '(' : ''}${formattedMessage}${needsChalk ? ')' : ''}
  )
)`;
  } else {
    // Legacy format
    newContent = `
return ${reactVar}.createElement(
  ${finalBoxComponent},
  ${boxAttrsObjStr},
  ${reactVar}.createElement(
    ${textComponent},
    ${textAttrsObjStr},
    ${needsChalk ? chalkChain + '(' : ''}${formattedMessage}${needsChalk ? ')' : ''}
  )
);`;
  }

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
