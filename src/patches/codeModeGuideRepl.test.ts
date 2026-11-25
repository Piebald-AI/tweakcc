import { describe, expect, it } from 'vitest';

import { writeCodeModeGuideRepl } from './codeModeGuideRepl';

// CC 2.1.332, chunk-bqhgd24a.js: part of the claude-code-guide definition.
const GUIDE =
  'whenToUse:`Use this agent when the user asks questions ("Can Claude...", "Does Claude...", "How do I...") about: (1) Claude Code (the CLI tool) - features, hooks, slash commands, MCP servers, settings, IDE integrations, keyboard shortcuts; (2) Claude Agent SDK - building custom agents; (3) Claude API (formerly Anthropic API) - Messages API for directly passing messages to Claude, Tool Runner (\\`client.beta.messages.tool_runner\\`) for running an agentic loop over your own tools, manual tool-use loops, Managed Agents for server-hosted agents with a managed sandbox, prompt caching, and general Anthropic SDK usage; (4) Claude Tag (Claude in Slack) - what it is, setting it up for a Slack workspace, \\`/install-slack-app\\`; (5) \\`claude plugin eval\\` (writing and running plugin eval suites, its JSON/report, sandbox, CI) and the \\`/skill-doctor\\` report. **IMPORTANT:** Before spawning a new agent, check if there is already a running or recently completed claude-code-guide agent that you can continue via ${kn}.`,get tools(){return UA()&&gc()?[ke,Oe,jn,yc]:[io,Sr,Oe,jn,yc]},source:"built-in",baseDir:"built-in",model:"haiku",permissionMode:"dontAsk"';

// The agent's tools, with the two settings that pick between its lists.
const toolsOf = (code: string, bashOnly: boolean) =>
  (
    new Function(
      'kn',
      'UA',
      'gc',
      'ke',
      'Oe',
      'jn',
      'yc',
      'io',
      'Sr',
      `return {${code}}`
    )(
      'SendMessage',
      () => bashOnly,
      () => true,
      'Bash',
      'Read',
      'WebFetch',
      'WebSearch',
      'Glob',
      'Grep'
    ) as { tools: string[] }
  ).tools;

describe('writeCodeModeGuideRepl', () => {
  it('lists no REPL tool without the patch', () => {
    expect(toolsOf(GUIDE, false)).toEqual([
      'Glob',
      'Grep',
      'Read',
      'WebFetch',
      'WebSearch',
    ]);
  });

  it('adds the REPL tool to both lists', () => {
    const patched = writeCodeModeGuideRepl(GUIDE)!;
    expect(toolsOf(patched, false)).toEqual([
      'Glob',
      'Grep',
      'Read',
      'WebFetch',
      'WebSearch',
      'REPL',
    ]);
    expect(toolsOf(patched, true)).toEqual([
      'Bash',
      'Read',
      'WebFetch',
      'WebSearch',
      'REPL',
    ]);
  });

  it('returns null when the claude-code-guide tool list is not there', () => {
    expect(writeCodeModeGuideRepl('let x=1;')).toBeNull();
    expect(
      writeCodeModeGuideRepl(GUIDE.replace('get tools(){', 'tools(){'))
    ).toBeNull();
  });
});
