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

const ALREADY_PATCHED =
  'standaloneAgentContext:(()=>{let __c=process.env.TWEAKCC_SESSION_COLOR;';

const injectSessionColorState = (oldFile: string): string | null => {
  const patterns = [
    // CC 2.1.295+: activeOverlays at end of state object
    /,activeOverlays:new Set\}\}/,
    // Legacy patterns
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

  return patched ? result : null;
};

export const writeSessionColor = (oldFile: string): string | null => {
  if (oldFile.includes(ALREADY_PATCHED)) {
    return oldFile;
  }

  const result = injectSessionColorState(oldFile);
  if (!result) {
    debug('patch: sessionColor: failed to find app state init patterns');
    return null;
  }

  const saveColorResult = patchSaveAgentColor(result);
  if (!saveColorResult) {
    debug('patch: sessionColor: failed to find saveAgentColor');
    return null;
  }

  return saveColorResult;
};

/**
 * CC 2.1.280+ split bundles: the app state init and saveAgentColor live in
 * different chunks (2.1.295: chunk-ehjd0wjr/chunk-e3h5551k and chunk-53bsrq2x).
 * Both halves are required; a state-only patch would never persist the color.
 */
export const writeSessionColorModules = (
  modules: Map<string, string>
): Map<string, string> | null => {
  const changed = new Map<string, string>();
  let hasState = false;
  let hasSave = false;
  for (const [name, source] of modules) {
    if (source.includes(ALREADY_PATCHED)) {
      hasState = true;
      if (source.includes('globalThis.__tweakccSaveAgentColor='))
        hasSave = true;
      continue;
    }
    let next = injectSessionColorState(source);
    if (next) hasState = true;
    if (source.includes('globalThis.__tweakccSaveAgentColor=')) {
      hasSave = true;
    } else {
      const saved = patchSaveAgentColor(next ?? source);
      if (saved) {
        hasSave = true;
        next = saved;
      }
    }
    if (next) changed.set(name, next);
  }
  if (!hasState || !hasSave) {
    debug(
      `patch: sessionColor: missing ${hasState ? 'saveAgentColor' : 'app state init'}`
    );
    return null;
  }
  return changed;
};

export const patchSaveAgentColor = (oldFile: string): string | null => {
  const prefix =
    '([,;{}])' +
    '(async function ([$\\w]+)' +
    '\\(([$\\w]+),([$\\w]+),([$\\w]+)(?:,[$\\w]+)?\\)' +
    '\\{let [$\\w]+=\\6\\?\\?[$\\w]+\\(\\4\\);';

  const patterns = [
    new RegExp(
      prefix +
        'if\\((?:await )?[$\\w]+\\([$\\w]+,' +
        '\\{type:"agent-color",agentColor:\\5,sessionId:\\4\\}(?:,[$\\w]+)?\\),' +
        '\\4===([$\\w]+)\\(\\)\\))'
    ),
    new RegExp(
      prefix +
        'try\\{await [$\\w]+\\([$\\w]+,' +
        '\\{type:"agent-color",agentColor:\\5,sessionId:\\4\\}(?:,[$\\w]+)?\\)\\}' +
        'catch\\([$\\w]+\\)\\{[\\s\\S]*?\\}' +
        'if\\(\\4===([$\\w]+)\\(\\)\\))'
    ),
  ];

  let match: RegExpMatchArray | null = null;
  for (const pattern of patterns) {
    match = oldFile.match(pattern);
    if (match && match.index !== undefined) break;
    match = null;
  }
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
