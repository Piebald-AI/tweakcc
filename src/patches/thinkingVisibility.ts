// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

/**
 * Forces thinking blocks to be visible inline by default, ensuring thinking content
 * always renders as if in transcript mode.
 */

const getThinkingVisibilityLocation = (
  oldFile: string
): LocationResult | null => {
  // New format (2.0.77+): Case body wrapped in braces with additional hideInTranscript param
  // npm: case"thinking":{if(!D&&!Z)return null;return n8.createElement($bA,{addMargin:Q,param:A,isTranscriptMode:D,verbose:Z,hideInTranscript:D&&!(!$||z===$)})}
  // native: case"thinking":{if(!J&&!I)return null;return lf.createElement(ajH,{addMargin:$,param:H,isTranscriptMode:J,verbose:I,hideInTranscript:J&&!(!Q||C===Q)})
  const newVisibilityPattern =
    /(case"thinking":)\{if\(![$\w]+&&![$\w]+\)return null;(return [$\w]+\.createElement\([$\w]+,\{addMargin:[$\w]+,param:[$\w]+,isTranscriptMode:)([$\w]+)(,verbose:[$\w]+,hideInTranscript:[$\w]+&&!\(![$\w]+\|\|[$\w]+===[$\w]+\)\})\)\}/;
  const newVisibilityMatch = oldFile.match(newVisibilityPattern);

  if (newVisibilityMatch && newVisibilityMatch.index !== undefined) {
    const startIndex = newVisibilityMatch.index;
    const endIndex = startIndex + newVisibilityMatch[0].length;

    return {
      startIndex,
      endIndex,
      identifiers: [
        newVisibilityMatch[1], // case"thinking":
        newVisibilityMatch[2], // return X.createElement(...,isTranscriptMode:
        newVisibilityMatch[4], // ,verbose:...,hideInTranscript:...})}
        'new_format',
      ],
    };
  }

  // Old format: Case without braces
  // case"thinking":if(!H && !G)return null;return createElement(...,isTranscriptMode:H,...)
  const oldVisibilityPattern =
    /(case"thinking":)if\([$\w!&]+\)return null;([$\w.]+\.createElement\([$\w]+,\{addMargin:[$\w]+,param:[$\w]+,isTranscriptMode:)([$\w]+)(,verbose:[$\w]+\s*\})\)/;
  const oldVisibilityMatch = oldFile.match(oldVisibilityPattern);

  if (oldVisibilityMatch && oldVisibilityMatch.index !== undefined) {
    const startIndex = oldVisibilityMatch.index;
    const endIndex = startIndex + oldVisibilityMatch[0].length;

    return {
      startIndex,
      endIndex,
      identifiers: [
        oldVisibilityMatch[1],
        oldVisibilityMatch[2],
        oldVisibilityMatch[4],
      ],
    };
  }

  console.error(
    'patch: thinkingVisibility: failed to find thinking visibility pattern'
  );
  return null;
};

export const writeThinkingVisibility = (oldFile: string): string | null => {
  // Force thinking visibility in renderer
  const visibilityLocation = getThinkingVisibilityLocation(oldFile);
  if (!visibilityLocation) {
    return null;
  }

  const isNewFormat = visibilityLocation.identifiers![3] === 'new_format';

  let visibilityReplacement: string;

  if (isNewFormat) {
    // New format: case"thinking":{return X.createElement(...,isTranscriptMode:true,verbose:...,hideInTranscript:...})}
    // We remove the if block and set isTranscriptMode to true
    // Note: identifiers[2] ends with }), we need to add the closing ) for createElement
    visibilityReplacement = `${visibilityLocation.identifiers![0]}{${visibilityLocation.identifiers![1]}true${visibilityLocation.identifiers![2]})}`;
  } else {
    // Old format: case"thinking":return X.createElement(...,isTranscriptMode:true,verbose:...})
    visibilityReplacement = `${visibilityLocation.identifiers![0]}${visibilityLocation.identifiers![1]}true${visibilityLocation.identifiers![2]}`;
  }

  const newFile =
    oldFile.slice(0, visibilityLocation.startIndex) +
    visibilityReplacement +
    oldFile.slice(visibilityLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    visibilityReplacement,
    visibilityLocation.startIndex,
    visibilityLocation.endIndex
  );

  return newFile;
};
