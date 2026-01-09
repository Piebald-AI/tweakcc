// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

/**
 * Forces thinking blocks to be visible inline by default, ensuring thinking content
 * always renders as if in transcript mode.
 */

const getThinkingVisibilityLocation = (
  oldFile: string
): LocationResult | null => {
  // v2.1.2+ format:
  // function ybA({...isTranscriptMode:B,verbose:G...}){
  //   if(!A)return null;
  //   if(Z)return null;
  //   if(!(B||G))return createElement(...,"∴ Thinking (ctrl+o to expand)");
  //   return createElement(...); // full thinking content
  // }
  // We need to remove the if(!(B||G))return... line to always show full thinking.
  const newPattern =
    /if\(!\([A-Za-z]+\|\|[A-Za-z]+\)\)return[^;]+Thinking[^;]+;/;
  const newMatch = oldFile.match(newPattern);
  if (newMatch && newMatch.index !== undefined) {
    return {
      startIndex: newMatch.index,
      endIndex: newMatch.index + newMatch[0].length,
      identifiers: ['new'],
    };
  }

  // Legacy format:
  // case "thinking":
  //  if (!H && !G) return null;
  //  return createElement(..., {isTranscriptMode: H, ...});
  const visibilityPattern =
    /(case"thinking":)if\(.+?\)return null;(.+?isTranscriptMode:).+?([},])/;
  const visibilityMatch = oldFile.match(visibilityPattern);

  if (!visibilityMatch || visibilityMatch.index === undefined) {
    console.error(
      'patch: thinkingVisibility: failed to find thinking visibility pattern'
    );
    return null;
  }

  const startIndex = visibilityMatch.index;
  const endIndex = startIndex + visibilityMatch[0].length;

  return {
    startIndex,
    endIndex,
    identifiers: [visibilityMatch[1], visibilityMatch[2], visibilityMatch[3]],
  };
};

export const writeThinkingVisibility = (oldFile: string): string | null => {
  // Force thinking visibility in renderer
  const visibilityLocation = getThinkingVisibilityLocation(oldFile);
  if (!visibilityLocation) {
    return null;
  }

  const formatType = visibilityLocation.identifiers![0];
  let visibilityReplacement: string;

  if (formatType === 'new') {
    // v2.1.2+: Remove the if(!(B||G))return... line entirely
    visibilityReplacement = '';
  } else {
    // Legacy: Replace with isTranscriptMode:true
    visibilityReplacement = `${visibilityLocation.identifiers![0]}${visibilityLocation.identifiers![1]}true${visibilityLocation.identifiers![2]}`;
  }

  const newFile =
    oldFile.slice(0, visibilityLocation.startIndex) +
    visibilityReplacement +
    oldFile.slice(visibilityLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    visibilityReplacement || '(removed)',
    visibilityLocation.startIndex,
    visibilityLocation.endIndex
  );

  return newFile;
};
