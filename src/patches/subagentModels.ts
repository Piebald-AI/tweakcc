// Please see the note about writing patches in ./index

import { showDiff } from './index';
import { SubagentModelsConfig } from '../types';

/**
 * Patches the Plan agent model.
 *
 * ```diff
 *  agentType: "Plan",
 *  ...
 * -model: "claude-sonnet-4-20250514"
 * +model: "custom-model"
 * ```
 */
const patchPlanAgent = (file: string, model: string): string | null => {
  const pattern =
    /(agentType\s*:\s*"Plan"\s*,[\s\S]{1,2500}?\bmodel\s*:\s*")[^"]+(")/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: subagentModels: failed to find Plan agent pattern');
    return null;
  }

  const replacement = match[1] + model + match[2];

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

/**
 * Patches the Explore agent model.
 *
 * ```diff
 *  agentType: "Explore",
 *  ...
 * -model: "claude-sonnet-4-20250514"
 * +model: "custom-model"
 * ```
 */
const patchExploreAgent = (file: string, model: string): string | null => {
  const pattern =
    /(\{agentType\s*:\s*"Explore"\s*,[\s\S]{1,2500}?\bmodel\s*:\s*")[^"]+(")/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: subagentModels: failed to find Explore agent pattern'
    );
    return null;
  }

  const replacement = match[1] + model + match[2];

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

/**
 * Patches the general-purpose agent model.
 * This agent may or may not have a model field already defined.
 *
 * ```diff
 *  agentType: "general-purpose",
 *  ...
 * +model: "custom-model"
 *  }
 * ```
 *
 * or if model already exists:
 *
 * ```diff
 *  agentType: "general-purpose",
 *  ...
 * -model: "claude-sonnet-4-20250514"
 * +model: "custom-model"
 *  }
 * ```
 */
const patchGeneralPurposeAgent = (
  file: string,
  model: string
): string | null => {
  const pattern =
    /([^$\w][$\w]+\s*=\s*\{agentType\s*:\s*"general-purpose"[\s\S]{0,2500}?)(\})/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: subagentModels: failed to find general-purpose agent pattern'
    );
    return null;
  }

  const beforeClosingBrace = match[1];
  const closingBrace = match[2];

  let replacement: string;

  if (beforeClosingBrace.includes('model:')) {
    // Model field exists, replace it
    replacement =
      beforeClosingBrace.replace(/(model\s*:\s*")[^"]+(")/, `$1${model}$2`) +
      closingBrace;
  } else {
    // Model field doesn't exist, add it
    const separator = beforeClosingBrace.trim().endsWith(',') ? '' : ',';
    replacement =
      beforeClosingBrace + `${separator}model:"${model}"` + closingBrace;
  }

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

/**
 * Swaps the quoted model value captured between `match[1]` and `match[2]`.
 */
const replaceAgentModel = (
  file: string,
  pattern: RegExp,
  model: string,
  agentName: string
): string | null => {
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      `patch: subagentModels: failed to find ${agentName} agent pattern`
    );
    return null;
  }

  const replacement = match[1] + model + match[2];

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

/**
 * Patches the claude-code-guide agent model.
 * Its agent type is hoisted into a constant, so the definition references a
 * variable rather than the string literal.
 *
 * ```diff
 *  b_r="claude-code-guide";
 *  ...
 *  agentType:b_r,
 *  ...
 * -model:"haiku"
 * +model:"custom-model"
 * ```
 */
const patchClaudeCodeGuideAgent = (
  file: string,
  model: string
): string | null => {
  const varMatch = file.match(/[,;{\s]([$\w]+)="claude-code-guide"[,;]/);
  const agentTypeRef = varMatch
    ? `(?:"claude-code-guide"|${varMatch[1].replace(/[$]/g, '\\$')})`
    : '"claude-code-guide"';

  const pattern = new RegExp(
    `([,{]agentType\\s*:\\s*${agentTypeRef}\\s*,[\\s\\S]{1,3000}?[,{]model\\s*:\\s*")[^"]+(")`
  );

  return replaceAgentModel(file, pattern, model, 'claude-code-guide');
};

/**
 * Patches the statusline-setup agent model.
 *
 * ```diff
 *  agentType:"statusline-setup",
 *  ...
 * -model:"sonnet"
 * +model:"custom-model"
 * ```
 */
const patchStatuslineSetupAgent = (
  file: string,
  model: string
): string | null => {
  const pattern =
    /([,{]agentType\s*:\s*"statusline-setup"\s*,[\s\S]{1,2500}?[,{]model\s*:\s*")[^"]+(")/;

  return replaceAgentModel(file, pattern, model, 'statusline-setup');
};

export const writeSubagentModels = (
  oldFile: string,
  config: SubagentModelsConfig
): string | null => {
  let currentFile = oldFile;

  if (config.plan) {
    const afterPlan = patchPlanAgent(currentFile, config.plan);
    if (afterPlan === null) {
      return null;
    }
    currentFile = afterPlan;
  }

  if (config.explore) {
    const afterExplore = patchExploreAgent(currentFile, config.explore);
    if (afterExplore === null) {
      return null;
    }
    currentFile = afterExplore;
  }

  if (config.generalPurpose) {
    const afterGeneralPurpose = patchGeneralPurposeAgent(
      currentFile,
      config.generalPurpose
    );
    if (afterGeneralPurpose === null) {
      return null;
    }
    currentFile = afterGeneralPurpose;
  }

  if (config.claudeCodeGuide) {
    const afterGuide = patchClaudeCodeGuideAgent(
      currentFile,
      config.claudeCodeGuide
    );
    if (afterGuide === null) {
      return null;
    }
    currentFile = afterGuide;
  }

  if (config.statuslineSetup) {
    const afterStatusline = patchStatuslineSetupAgent(
      currentFile,
      config.statuslineSetup
    );
    if (afterStatusline === null) {
      return null;
    }
    currentFile = afterStatusline;
  }

  return currentFile;
};
