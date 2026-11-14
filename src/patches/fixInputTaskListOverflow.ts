// Please see the note about writing patches in ./index

import { showDiff } from './index';
import { debug } from '../utils';
import { resolveAcrossGraph } from './graphContext';

const findHasTasksHook = (source: string): string | undefined => {
  const hook = source.match(
    /[,;{}]function ([$\w]+)\(\)\{return [$\w]+\([$\w]+\(\),([$\w]+)\)\?\?!1\}/
  );
  if (!hook) return undefined;
  const predicate = new RegExp(
    `[,;{}]function ${hook[2].replace(/\$/g, '\\$')}\\(([$\\w]+)\\)\\{return \\1!==void 0&&\\1\\.length>0\\}`
  );
  return predicate.test(source) ? hook[1] : undefined;
};

export const writeFixInputTaskListOverflow = (file: string): string | null => {
  const alreadyPatched =
    /\(\(tlv,tlh\)=>[$\w]+\(\)\?Math\.max\([$\w]+,Math\.floor\([$\w]+\/2\)-[$\w]+-\(tlv==="tasks"&&tlh\?/;
  if (alreadyPatched.test(file)) {
    return file;
  }

  const pattern =
    /([,;{}][$\w]+=)([$\w]+)\(\)\?Math\.max\(([$\w]+),Math\.floor\(([$\w]+)\/2\)-([$\w]+)\):void 0/;
  const match = file.match(pattern);
  if (!match || match.index === undefined) {
    debug('patch: fixInputTaskListOverflow: failed to find maxVisibleLines');
    return null;
  }

  const selectorPattern =
    /[,;{}=(]([$\w]+)\(\(?([$\w]+)\)?=>\2\.expandedView\)/g;
  let useAppState: string | undefined;
  for (const m of file.matchAll(selectorPattern)) {
    if (m.index === undefined) continue;
    if (m.index > match.index) {
      useAppState ??= m[1];
      break;
    }
    useAppState = m[1];
  }
  if (!useAppState) {
    debug('patch: fixInputTaskListOverflow: failed to find useAppState');
    return null;
  }

  const hasTasks =
    findHasTasksHook(file) ??
    resolveAcrossGraph('fixInputTaskListOverflow.hasTasks', findHasTasksHook);
  if (!hasTasks) {
    debug('patch: fixInputTaskListOverflow: failed to find useHasTasks');
    return null;
  }

  const [, prefix, isFullscreen, minLines, rows, footerLines] = match;
  const reserve = `(${rows}<=10?0:Math.min(10,Math.max(3,${rows}-14))+2)`;
  const replacement =
    `${prefix}((tlv,tlh)=>${isFullscreen}()?` +
    `Math.max(${minLines},Math.floor(${rows}/2)-${footerLines}-` +
    `(tlv==="tasks"&&tlh?${reserve}:0)):void 0)` +
    `(${useAppState}((tls)=>tls.expandedView),${hasTasks}())`;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};
