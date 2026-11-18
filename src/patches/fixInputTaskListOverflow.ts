// Please see the note about writing patches in ./index

import { showDiff } from './index';
import { debug } from '../utils';
import { graphMemo, graphSources, resolveAcrossGraph } from './graphContext';

const escapeId = (id: string) => id.replace(/\$/g, '\\$');

const findTaskListHook = (source: string): string | undefined => {
  const hooks = source.matchAll(
    /[,;{}]function [$\w]+\(\)\{return ([$\w]+)\(([$\w]+)\(\),([$\w]+)\)\?\?!1(?=\})/g
  );
  for (const hook of hooks) {
    const [, read, store, nonEmpty] = hook;
    const predicate = new RegExp(
      `[,;{}]function ${escapeId(nonEmpty)}\\(([$\\w]+)\\)\\{return \\1!==void 0&&\\1\\.length>0\\}`
    );
    if (!predicate.test(source)) continue;
    const list = source.match(
      new RegExp(
        `[,;{}]function ([$\\w]+)\\(\\)\\{return ${escapeId(read)}\\(${escapeId(store)}\\(\\)\\)\\}`
      )
    );
    if (list) return list[1];
  }
  return undefined;
};

const visibleTasksPattern =
  /[,;{}][$\w]+=[$\w]+<=10\?0:Math\.min\((\d+),Math\.max\(3,[$\w]+-14\)\)/;

const findVisibleTasksLimit = (file: string): string | undefined =>
  file.match(visibleTasksPattern)?.[1] ??
  graphMemo('fixInputTaskListOverflow.visibleTasks', () => {
    for (const source of graphSources()?.values() ?? []) {
      const m = source.match(visibleTasksPattern);
      if (m) return m[1];
    }
    return undefined;
  });

export const writeFixInputTaskListOverflow = (file: string): string | null => {
  const alreadyPatched =
    /\(\(tlv,tlh,tlb\)=>[$\w]+\(\)\?Math\.max\([$\w]+,Math\.floor\([$\w]+\/2\)-[$\w]+-\(tlv==="tasks"&&tlh\?\.length\?/;
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

  const taskList =
    findTaskListHook(file) ??
    resolveAcrossGraph('fixInputTaskListOverflow.taskList', findTaskListHook);
  if (!taskList) {
    debug('patch: fixInputTaskListOverflow: failed to find useTaskList');
    return null;
  }

  const limit = findVisibleTasksLimit(file);
  if (!limit) {
    debug('patch: fixInputTaskListOverflow: failed to find visible task limit');
    return null;
  }

  const [, prefix, isFullscreen, minLines, rows, footerLines] = match;
  if (
    [isFullscreen, minLines, rows, footerLines].some(
      id => id === 'tlv' || id === 'tlh' || id === 'tlb'
    )
  ) {
    debug(
      'patch: fixInputTaskListOverflow: captured identifier collides with generated parameter'
    );
    return null;
  }
  const reserve = '2+Math.min(tlh.length,tlb)+(tlh.length>tlb&&tlb>0?1:0)';
  const replacement =
    `${prefix}((tlv,tlh,tlb)=>${isFullscreen}()?` +
    `Math.max(${minLines},Math.floor(${rows}/2)-${footerLines}-` +
    `(tlv==="tasks"&&tlh?.length?${reserve}:0)):void 0)` +
    `(${useAppState}((tls)=>tls.expandedView),${taskList}(),` +
    `${rows}<=10?0:Math.min(${limit},Math.max(3,${rows}-14)))`;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};
