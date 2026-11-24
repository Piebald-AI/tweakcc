// Please see the note about writing patches in ./index
//
// Nested Teammates Patch - let teammates start teammates of their own
//
// With agent teams on, the Agent tool refuses a `name` (which starts a
// teammate) when the caller is itself a teammate, and the tool's prompt tells
// teammates that `name` is unavailable. Claude Code lifts both only under a
// server-side experiment that changes much more (agent lifecycle, idle and
// stall timeouts, Esc handling). The spawn path itself already works for a
// teammate: the new teammate joins the same flat team, so it can message and
// be messaged by every member, and it reports to the team lead.
//
// CC 2.1.331 (chunk-tzxxm05j.js):
//   if((Be||!!tA())&&O&&!zB())throw m("subagent_launch","subagent_nested_teammate"),
//     new V("Teammates cannot spawn other teammates \u2014 the team roster is flat. ...");
//
// CC 2.1.331 (chunk-hp8k9543.js), two forms of the Agent tool prompt:
//   un=vK()?"\n- `run_in_background` and `name` are unavailable here \u2014 only synchronous subagents.":su()?"\n- `name` is unavailable here \u2014 teammates cannot spawn teammates.":""
//   ${vK()?`\n- The run_in_background and name parameters are not available in this context. Only synchronous subagents are supported.`:su()?`\n- The name parameter is not available in this context \u2014 teammates cannot spawn other teammates. Omit it to spawn a subagent.`:""}
//
// The patch drops the check, drops the teammate line and keeps the
// in-process teammate line without `name` (such a teammate still cannot run
// background subagents). It changes whichever of these a module holds and
// returns null for a module with none.

import { showDiff } from './index';

const GATE =
  /if\(\([$\w]+\|\|!![$\w]+\(\)\)&&[$\w]+&&![$\w]+\(\)\)throw [$\w]+\("subagent_launch","subagent_nested_teammate"\),new [$\w]+\("Teammates cannot spawn other teammates[^"]*"\);/;

// `vK()?"<in-process line>":su()?"<teammate line>":""`
const SHORT_PROMPT =
  /([$\w]+\(\)\?)"(\\n- )`run_in_background` and `name` are unavailable here (\\u2014|\u2014) only synchronous subagents\.":[$\w]+\(\)\?"\\n- `name` is unavailable here (?:\\u2014|\u2014) teammates cannot spawn teammates\.":""/;

const LONG_PROMPT =
  /([$\w]+\(\)\?)`(\n- )The run_in_background and name parameters are not available in this context\. Only synchronous subagents are supported\.`:[$\w]+\(\)\?`\n- The name parameter is not available in this context (?:\\u2014|\u2014) teammates cannot spawn other teammates\. Omit it to spawn a subagent\.`:""/;

export const writeNestedTeammates = (oldFile: string): string | null => {
  let file = oldFile;
  let found = false;

  const replace = (pattern: RegExp, make: (m: RegExpMatchArray) => string) => {
    const match = file.match(pattern);
    if (!match || match.index === undefined) return;
    found = true;
    const replacement = make(match);
    const next =
      file.slice(0, match.index) +
      replacement +
      file.slice(match.index + match[0].length);
    showDiff(
      file,
      next,
      replacement,
      match.index,
      match.index + match[0].length
    );
    file = next;
  };

  replace(GATE, () => '');
  replace(
    SHORT_PROMPT,
    m =>
      `${m[1]}"${m[2]}\`run_in_background\` is unavailable here ${m[3]} subagents run synchronously.":""`
  );
  replace(
    LONG_PROMPT,
    m =>
      `${m[1]}\`${m[2]}The run_in_background parameter is not available in this context. Subagents run synchronously.\`:""`
  );

  return found ? file : null;
};
