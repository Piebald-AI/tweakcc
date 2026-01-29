// Please see the note about writing patches in ./index

import { showDiff } from './index';
import { SubagentModelsConfig } from '../types';

export const writeSubagentModels = (
  oldFile: string,
  config: SubagentModelsConfig
): string | null => {
  let newFile = oldFile;
  let applied = false;

  // Patch 1: Plan agent
  if (config.plan) {
    const planPattern =
      /(agentType\s*:\s*"Plan"\s*,[\s\S]{1,2500}?\bmodel\s*:\s*")[^"]+(")/;
    const match = newFile.match(planPattern);
    if (match) {
      const replaced = newFile.replace(planPattern, `$1${config.plan}$2`);
      if (replaced !== newFile) {
        showDiff(
          newFile,
          replaced,
          config.plan,
          match.index!,
          match.index! + match[0].length
        );
        newFile = replaced;
        applied = true;
      }
    } else {
      console.error('patch: subagentModels: failed to find Plan agent pattern');
    }
  }

  // Patch 2: Explore agent
  if (config.explore) {
    const explorePattern =
      /(agentType\s*:\s*"Explore"\s*,[\s\S]{1,2500}?\bmodel\s*:\s*")[^"]+(")/;
    const match = newFile.match(explorePattern);
    if (match) {
      const replaced = newFile.replace(explorePattern, `$1${config.explore}$2`);
      if (replaced !== newFile) {
        showDiff(
          newFile,
          replaced,
          config.explore,
          match.index!,
          match.index! + match[0].length
        );
        newFile = replaced;
        applied = true;
      }
    } else {
      console.error(
        'patch: subagentModels: failed to find Explore agent pattern'
      );
    }
  }

  // Patch 3: general-purpose agent
  if (config.generalPurpose) {
    const gpPattern =
      /(\b[$\w]+\s*=\s*\{agentType\s*:\s*"general-purpose"[\s\S]{0,2500}?)(\})/;
    const match = newFile.match(gpPattern);
    if (match) {
      const p1 = match[1];
      const p2 = match[2];
      let replacement: string;

      if (p1.includes('model:')) {
        replacement =
          p1.replace(
            /(model\s*:\s*")[^"]+(")/,
            `$1${config.generalPurpose}$2`
          ) + p2;
      } else {
        const separator = p1.trim().endsWith(',') ? '' : ',';
        replacement = p1 + `${separator}model:"${config.generalPurpose}"` + p2;
      }

      const replaced = newFile.replace(gpPattern, replacement);
      if (replaced !== newFile) {
        showDiff(
          newFile,
          replaced,
          config.generalPurpose,
          match.index!,
          match.index! + match[0].length
        );
        newFile = replaced;
        applied = true;
      }
    } else {
      console.error(
        'patch: subagentModels: failed to find general-purpose agent pattern'
      );
    }
  }

  return applied ? newFile : null;
};
