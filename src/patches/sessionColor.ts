import { showDiff } from './index';
import { debug } from '../utils';

const VALID_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
];

const INJECTION =
  `,standaloneAgentContext:` +
  `(()=>{` +
  `let __c=process.env.TWEAKCC_SESSION_COLOR;` +
  `return __c&&${JSON.stringify(VALID_COLORS)}.includes(__c)` +
  `?{name:"",color:__c}` +
  `:void 0` +
  `})()`;

export const writeSessionColor = (oldFile: string): string | null => {
  if (
    oldFile.includes(
      'standaloneAgentContext:(()=>{let __c=process.env.TWEAKCC_SESSION_COLOR;'
    )
  ) {
    return oldFile;
  }

  const patterns = [
    /,activeOverlays:new Set,fastMode:[$\w]+\([$\w]+\)/,
    /,activeOverlays:new Set,fastMode:!1\}/,
  ];

  let result = oldFile;
  let patched = false;

  for (const pattern of patterns) {
    const match = result.match(pattern);
    if (!match || match.index === undefined) continue;

    const prePatch = result;
    const replacement = INJECTION + match[0];
    result =
      prePatch.slice(0, match.index) +
      replacement +
      prePatch.slice(match.index + match[0].length);

    showDiff(
      prePatch,
      result,
      replacement,
      match.index,
      match.index + match[0].length
    );
    patched = true;
  }

  if (!patched) {
    debug('patch: sessionColor: failed to find app state init patterns');
    return null;
  }

  return result;
};
