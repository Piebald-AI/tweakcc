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
  `if(!__c||!${JSON.stringify(VALID_COLORS)}.includes(__c))return void 0;` +
  `queueMicrotask(()=>{` +
  `if(globalThis.__tweakccSaveAgentColor)globalThis.__tweakccSaveAgentColor(__c)` +
  `});` +
  `return{name:"",color:__c}` +
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
      INJECTION,
      match.index,
      match.index + match[0].length
    );
    patched = true;
  }

  if (!patched) {
    debug('patch: sessionColor: failed to find app state init patterns');
    return null;
  }

  const saveColorResult = patchSaveAgentColor(result);
  if (!saveColorResult) {
    debug('patch: sessionColor: failed to patch saveAgentColor');
    return null;
  }

  return saveColorResult;
};

export const patchSaveAgentColor = (oldFile: string): string | null => {
  const pattern = new RegExp(
    '([,;{}])' +
      '(async function ([$\\w]+)' +
      '\\(([$\\w]+),([$\\w]+),([$\\w]+)\\)' +
      '\\{let [$\\w]+=\\6\\?\\?[$\\w]+\\(\\4\\);' +
      'if\\([$\\w]+\\([$\\w]+,' +
      '\\{type:"agent-color",agentColor:\\5,sessionId:\\4\\}\\),' +
      '\\4===([$\\w]+)\\(\\)\\))'
  );
  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    return null;
  }

  const delimiter = match[1];
  const funcBody = match[2];
  const funcName = match[3];
  const getSessionIdName = match[7];

  const injection =
    `globalThis.__tweakccSaveAgentColor=` +
    `(c)=>${funcName}(${getSessionIdName}(),c);`;

  const replacement = `${delimiter}${injection}${funcBody}`;

  const result =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + match[0].length);

  showDiff(
    oldFile,
    result,
    injection,
    match.index,
    match.index + match[0].length
  );

  return result;
};
