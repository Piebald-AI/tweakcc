// Run inside /home/user/code/tweakcc via:
//   pnpm tsx probe-patches.mts /tmp/tweakcc-analysis/claude-2.1.146.js
// Calls each writeX patch function against an unpacked Claude Code JS file and
// reports patches that silently return null or throw.

import fs from 'node:fs';
import { DEFAULT_SETTINGS } from './src/defaultSettings.ts';

const jsPath = process.argv[2] ?? '/tmp/tweakcc-analysis/claude-2.1.146.js';
const JS = fs.readFileSync(jsPath, 'utf8');

console.log(`Probing patches against ${jsPath}`);
console.log('');

type Probe = { name: string; run: () => Promise<string | null> };

const probes: Probe[] = [];

// Push a probe: name + dynamic-import + arg builder. We swallow stderr from
// console.error inside the patches by patching console.error around each run.
function add(name: string, fn: () => Promise<string | null>) {
  probes.push({ name, run: fn });
}

// Helper to capture console.error during run
async function withCapturedErr<T>(fn: () => T | Promise<T>): Promise<{ result: T; errs: string[] }> {
  const errs: string[] = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.map(x => String(x)).join(' '));
  try {
    const result = await fn();
    return { result, errs };
  } finally {
    console.error = orig;
  }
}

// Build probes for every writeX entry
add('verbose-property', async () => {
  const { writeVerboseProperty } = await import('./src/patches/verboseProperty.ts');
  return writeVerboseProperty(JS);
});
add('opusplan1m', async () => {
  const { writeOpusplan1m } = await import('./src/patches/opusplan1m.ts');
  return writeOpusplan1m(JS);
});
add('fix-lsp-support', async () => {
  const { writeFixLspSupport } = await import('./src/patches/fixLspSupport.ts');
  return writeFixLspSupport(JS);
});
add('context-limit', async () => {
  const { writeContextLimit } = await import('./src/patches/contextLimit.ts');
  return writeContextLimit(JS);
});
add('statusline-update-throttle', async () => {
  const { writeStatuslineUpdateThrottle } = await import('./src/patches/statuslineUpdateThrottle.ts');
  return writeStatuslineUpdateThrottle(JS, 300, false);
});
add('patches-applied-indication', async () => {
  const { writePatchesAppliedIndication } = await import('./src/patches/patchesAppliedIndication.ts');
  return writePatchesAppliedIndication(JS, '4.0.13', [], true, true);
});
add('model-customizations', async () => {
  const { writeModelCustomizations } = await import('./src/patches/modelSelector.ts');
  return writeModelCustomizations(JS);
});
add('show-more-items-in-select-menus', async () => {
  const { writeShowMoreItemsInSelectMenus } = await import('./src/patches/showMoreItemsInSelectMenus.ts');
  return writeShowMoreItemsInSelectMenus(JS, 25);
});
add('table-format', async () => {
  const { writeTableFormat } = await import('./src/patches/tableFormat.ts');
  return writeTableFormat(JS, 'markdown');
});
add('themes', async () => {
  const { writeThemes } = await import('./src/patches/themes.ts');
  // tweak one color so the writer actually has work to do
  const t = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.themes));
  t[0].colors.text = 'rgb(123,45,67)';
  return writeThemes(JS, t);
});
add('thinking-verbs', async () => {
  const { writeThinkingVerbs } = await import('./src/patches/thinkingVerbs.ts');
  return writeThinkingVerbs(JS, DEFAULT_SETTINGS.thinkingVerbs!.verbs);
});
add('thinker-format', async () => {
  const { writeThinkerFormat } = await import('./src/patches/thinkerFormat.ts');
  return writeThinkerFormat(JS, DEFAULT_SETTINGS.thinkingVerbs!.format);
});
add('thinker-symbol-chars', async () => {
  const { writeThinkerSymbolChars } = await import('./src/patches/thinkerSymbolChars.ts');
  return writeThinkerSymbolChars(JS, ['+', '-', '*']);
});
add('thinker-symbol-width', async () => {
  const { writeThinkerSymbolWidthLocation } = await import('./src/patches/thinkerSymbolWidth.ts');
  return writeThinkerSymbolWidthLocation(JS, 2);
});
add('thinker-symbol-mirror', async () => {
  const { writeThinkerSymbolMirrorOption } = await import('./src/patches/thinkerMirrorOption.ts');
  return writeThinkerSymbolMirrorOption(JS, !DEFAULT_SETTINGS.thinkingStyle.reverseMirror);
});
add('input-box-border', async () => {
  const { writeInputBoxBorder } = await import('./src/patches/inputBorderBox.ts');
  return writeInputBoxBorder(JS, true);
});
add('subagent-models', async () => {
  const { writeSubagentModels } = await import('./src/patches/subagentModels.ts');
  return writeSubagentModels(JS, { 'general-purpose': 'claude-sonnet-4-6' } as any);
});
add('thinking-visibility', async () => {
  const { writeThinkingVisibility } = await import('./src/patches/thinkingVisibility.ts');
  return writeThinkingVisibility(JS);
});
add('hide-startup-banner', async () => {
  const { writeHideStartupBanner } = await import('./src/patches/hideStartupBanner.ts');
  return writeHideStartupBanner(JS);
});
add('hide-ctrl-g-to-edit', async () => {
  const { writeHideCtrlGToEdit } = await import('./src/patches/hideCtrlGToEdit.ts');
  return writeHideCtrlGToEdit(JS);
});
add('hide-startup-clawd', async () => {
  const { writeHideStartupClawd } = await import('./src/patches/hideStartupClawd.ts');
  return writeHideStartupClawd(JS);
});
add('increase-file-read-limit', async () => {
  const { writeIncreaseFileReadLimit } = await import('./src/patches/increaseFileReadLimit.ts');
  return writeIncreaseFileReadLimit(JS);
});
add('suppress-line-numbers', async () => {
  const { writeSuppressLineNumbers } = await import('./src/patches/suppressLineNumbers.ts');
  return writeSuppressLineNumbers(JS);
});
add('suppress-rate-limit-options', async () => {
  const { writeSuppressRateLimitOptions } = await import('./src/patches/suppressRateLimitOptions.ts');
  return writeSuppressRateLimitOptions(JS);
});
add('token-count-rounding', async () => {
  const { writeTokenCountRounding } = await import('./src/patches/tokenCountRounding.ts');
  return writeTokenCountRounding(JS, 100);
});
add('agents-md', async () => {
  const { writeAgentsMd } = await import('./src/patches/agentsMd.ts');
  return writeAgentsMd(JS, ['AGENTS.md']);
});
add('auto-accept-plan-mode', async () => {
  const { writeAutoAcceptPlanMode } = await import('./src/patches/autoAcceptPlanMode.ts');
  return writeAutoAcceptPlanMode(JS);
});
add('allow-sudo-bypass-permissions', async () => {
  const { writeAllowBypassPermsInSudo } = await import('./src/patches/allowBypassPermsInSudo.ts');
  return writeAllowBypassPermsInSudo(JS);
});
add('suppress-native-installer-warning', async () => {
  const { writeSuppressNativeInstallerWarning } = await import('./src/patches/suppressNativeInstallerWarning.ts');
  return writeSuppressNativeInstallerWarning(JS);
});
add('filter-scroll-escape-sequences', async () => {
  const { writeScrollEscapeSequenceFilter } = await import('./src/patches/scrollEscapeSequenceFilter.ts');
  return writeScrollEscapeSequenceFilter(JS);
});
add('allow-custom-agent-models', async () => {
  const { writeAllowCustomAgentModels } = await import('./src/patches/allowCustomAgentModels.ts');
  return writeAllowCustomAgentModels(JS);
});
add('session-memory', async () => {
  const { writeSessionMemory } = await import('./src/patches/sessionMemory.ts');
  return writeSessionMemory(JS);
});
add('toolsets', async () => {
  const { writeToolsets } = await import('./src/patches/toolsets.ts');
  return writeToolsets(JS, [{ name: 'mini', allowedTools: ['Read'], description: 'd' }] as any, 'mini', undefined);
});
add('mcp-non-blocking', async () => {
  const { writeMcpNonBlocking } = await import('./src/patches/mcpStartup.ts');
  return writeMcpNonBlocking(JS);
});
add('mcp-batch-size', async () => {
  const { writeMcpBatchSize } = await import('./src/patches/mcpStartup.ts');
  return writeMcpBatchSize(JS, 8);
});
add('user-message-display', async () => {
  const { writeUserMessageDisplay } = await import('./src/patches/userMessageDisplay.ts');
  return writeUserMessageDisplay(JS, DEFAULT_SETTINGS.userMessageDisplay!);
});
add('input-pattern-highlighters', async () => {
  const { writeInputPatternHighlighters } = await import('./src/patches/inputPatternHighlighters.ts');
  return writeInputPatternHighlighters(JS, [
    { name: 't', pattern: 'TODO', styling: [], foregroundColor: 'rgb(255,0,0)', backgroundColor: 'rgb(0,0,0)' },
  ] as any);
});
add('voice-mode', async () => {
  const { writeVoiceMode } = await import('./src/patches/voiceMode.ts');
  return writeVoiceMode(JS, true);
});
add('channels-mode', async () => {
  const { writeChannelsMode } = await import('./src/patches/channelsMode.ts');
  return writeChannelsMode(JS);
});

// Run all
const PAD = 38;
const ok: string[] = [];
const fail: { name: string; errs: string[] }[] = [];
const exc: { name: string; e: Error }[] = [];

for (const p of probes) {
  try {
    const { result, errs } = await withCapturedErr(p.run);
    if (result == null) {
      fail.push({ name: p.name, errs });
      console.log(`✗ ${p.name.padEnd(PAD)}  ${errs[0] ?? '(no error message)'}`);
    } else {
      ok.push(p.name);
      const changed = result !== JS;
      console.log(`✓ ${p.name.padEnd(PAD)}  ${changed ? `(${(result.length - JS.length).toString().padStart(6)} bytes Δ)` : '(no change)'}`);
    }
  } catch (e: any) {
    exc.push({ name: p.name, e });
    console.log(`! ${p.name.padEnd(PAD)}  THREW: ${e.message}`);
  }
}

console.log('\n──────── Summary ────────');
console.log(`✓ ok:    ${ok.length}`);
console.log(`✗ fail:  ${fail.length}`);
console.log(`! throw: ${exc.length}`);
if (fail.length > 0) {
  console.log('\nFailures:');
  for (const f of fail) {
    console.log(`  ${f.name}`);
    for (const e of f.errs) console.log(`    ${e}`);
  }
}
if (exc.length > 0) {
  console.log('\nExceptions:');
  for (const e of exc) console.log(`  ${e.name}: ${e.e.message}`);
}
