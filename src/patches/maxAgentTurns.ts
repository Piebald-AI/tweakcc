import { showDiff } from './index';

// ======

/**
 * Make subagent maxTurns configurable via environment variable
 *
 * CC 2.1.97 hardcodes cjz=20 as the default maxTurns for subagents,
 * with ljz=100 as some upper limit.
 *
 * This patch replaces the hardcoded 20 with:
 *   Number(process.env.CLAUDE_CODE_MAX_AGENT_TURNS ?? 20)
 *
 * And the hardcoded 100 with:
 *   Number(process.env.CLAUDE_CODE_MAX_AGENT_TURNS_LIMIT ?? 100)
 */
export const writeMaxAgentTurns = (oldFile: string): string | null => {
  // Pattern: cjz=20,ljz=100
  // These are the default maxTurns constants for subagents
  const pattern = /([$\w]+)=20,([$\w]+)=100,([$\w]+),([$\w]+);var ([$\w]+)=L\(/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Try simpler pattern with nearby context to verify correct 20,100 pair
    const contextPattern = /([$\w]+)=20,([$\w]+)=100,[$\w]+,[$\w]+;/;
    const contextMatch = oldFile.match(contextPattern);
    if (!contextMatch || contextMatch.index === undefined) {
      console.error('patch: maxAgentTurns: failed to find maxTurns constants');
      return null;
    }

    const var1 = contextMatch[1];
    const var2 = contextMatch[2];
    const oldText = `${var1}=20,${var2}=100`;
    const newText = `${var1}=Number(process.env.CLAUDE_CODE_MAX_AGENT_TURNS??20),${var2}=Number(process.env.CLAUDE_CODE_MAX_AGENT_TURNS_LIMIT??100)`;

    const idx = contextMatch.index;
    const newFile =
      oldFile.slice(0, idx) +
      contextMatch[0].replace(oldText, newText) +
      oldFile.slice(idx + contextMatch[0].length);

    showDiff(oldFile, newFile, newText, idx, idx + oldText.length);
    return newFile;
  }

  const var1 = match[1];
  const var2 = match[2];
  const oldText = `${var1}=20,${var2}=100`;
  const newText = `${var1}=Number(process.env.CLAUDE_CODE_MAX_AGENT_TURNS??20),${var2}=Number(process.env.CLAUDE_CODE_MAX_AGENT_TURNS_LIMIT??100)`;

  const idx = match.index;
  const newFile =
    oldFile.slice(0, idx) +
    match[0].replace(oldText, newText) +
    oldFile.slice(idx + match[0].length);

  showDiff(oldFile, newFile, newText, idx, idx + oldText.length);
  return newFile;
};
