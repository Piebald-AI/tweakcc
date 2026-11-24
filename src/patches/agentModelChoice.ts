// Please see the note about writing patches in ./index
//
// Agent Model Choice Patch - tell the model when to pick a subagent model
//
// The Agent tool takes `model` ("sonnet", "opus", "haiku", ...). Its
// description says what the parameter does but, outside coordinator mode,
// nothing about when to set it, so the model rarely does. This patch adds
// that guidance for sessions that are not in coordinator mode, whose own
// text (set it only when the user asks) stays as it is.
//
// CC 2.1.331 (chunk-tzxxm05j.js):
//   model:U(wHl).optional().describe(`Optional model override ... parent model.`+
//     (El()?s.CLAUDE_CODE_COORDINATOR_FORCE_WORKER_INHERIT_MODEL?" Unavailable ...":" Set this only when EXPLICITLY asked ...":""))

import { showDiff } from './index';

const GUIDANCE =
  ' Choose it yourself when the work clearly fits another model: "haiku" for a mechanical brief that can be checked against itself (a bounded search, grep-and-report, an edit pattern you spelled out), "sonnet" for routine, well-specified implementation, "opus" when one piece needs deeper reasoning than the work around it. Otherwise omit it.';

const PATTERN =
  /(\+\([$\w]+\(\)\?[$\w]+\.CLAUDE_CODE_COORDINATOR_FORCE_WORKER_INHERIT_MODEL\?"[^"]*":"[^"]*":)""\)/;

export const writeAgentModelChoice = (oldFile: string): string | null => {
  const match = oldFile.match(PATTERN);
  if (!match || match.index === undefined) return null;

  const replacement = `${match[1]}${JSON.stringify(GUIDANCE)})`;
  const end = match.index + match[0].length;
  const newFile =
    oldFile.slice(0, match.index) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, match.index, end);

  return newFile;
};
