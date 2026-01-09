#!/usr/bin/env node
/**
 * autoIdentifierMap.js - 自动从 cli.js 提取变量到人类可读名称的映射
 *
 * 原理：
 * - 工具名变量：从 `C9="Bash"` 模式提取 → C9 = BASH_TOOL_NAME
 * - Set 变量：从 `new Set([` 模式提取 → 标记为 _SET 类型
 * - 函数变量：从 `=()=>` 或 `=function` 模式提取
 *
 * 用法：
 *   node autoIdentifierMap.js <cli.js路径>
 *   node autoIdentifierMap.js  # 使用默认路径
 */

const fs = require('fs');
const path = require('path');

// 已知的工具名到人类可读名称的映射
const TOOL_NAME_MAP = {
  'Bash': 'BASH_TOOL_NAME',
  'Glob': 'GLOB_TOOL_NAME',
  'Grep': 'GREP_TOOL_NAME',
  'Read': 'READ_TOOL_NAME',
  'Edit': 'EDIT_TOOL_NAME',
  'Write': 'WRITE_TOOL_NAME',
  'Task': 'TASK_TOOL_NAME',
  'TodoWrite': 'TODOWRITE_TOOL_NAME',
  'AskUserQuestion': 'ASKUSERQUESTION_TOOL_NAME',
  'WebSearch': 'WEBSEARCH_TOOL_NAME',
  'WebFetch': 'WEBFETCH_TOOL_NAME',
  'NotebookEdit': 'NOTEBOOKEDIT_TOOL_NAME',
  'LSP': 'LSP_TOOL_NAME',
  'Skill': 'SKILL_TOOL_NAME',
  'EnterPlanMode': 'ENTERPLANMODE_TOOL_NAME',
  'ExitPlanMode': 'EXITPLANMODE_TOOL_NAME',
  'KillShell': 'KILLSHELL_TOOL_NAME',
  'TaskOutput': 'TASKOUTPUT_TOOL_NAME',
};

// 已知的特殊变量模式
const SPECIAL_PATTERNS = [
  // 函数类型（通常是生成额外说明的）
  { pattern: /([a-zA-Z_$][a-zA-Z0-9_$]*)=\(\)=>"[^"]*commit[^"]*"/gi, suffix: '_INSTRUCTION' },
  { pattern: /([a-zA-Z_$][a-zA-Z0-9_$]*)=\(\)=>"[^"]*git[^"]*"/gi, suffix: '_INSTRUCTION' },
];

/**
 * 从 cli.js 提取变量映射
 * @param {string} cliPath - cli.js 文件路径
 * @returns {Object} 变量映射 { varName: humanReadableName }
 */
function extractVariableMap(cliPath) {
  const content = fs.readFileSync(cliPath, 'utf8');
  const variableMap = {};
  const variableTypes = {}; // 记录变量类型：string, Set, function, etc.

  // 1. 提取工具名变量：varName="ToolName"
  const toolNameRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)="(Bash|Glob|Grep|Read|Edit|Write|Task|TodoWrite|AskUserQuestion|WebSearch|WebFetch|NotebookEdit|LSP|Skill|EnterPlanMode|ExitPlanMode|KillShell|TaskOutput)"/g;

  let match;
  while ((match = toolNameRegex.exec(content)) !== null) {
    const [, varName, toolName] = match;
    if (TOOL_NAME_MAP[toolName]) {
      variableMap[varName] = TOOL_NAME_MAP[toolName];
      variableTypes[varName] = 'string';
    }
  }

  // 2. 提取 Set 变量：varName=new Set(
  const setRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)=new Set\(/g;
  while ((match = setRegex.exec(content)) !== null) {
    const varName = match[1];
    // 只记录类型，不覆盖已有的名称
    variableTypes[varName] = 'Set';
    if (!variableMap[varName]) {
      // 尝试从上下文推断用途
      const contextStart = Math.max(0, match.index - 200);
      const contextEnd = Math.min(content.length, match.index + 500);
      const context = content.substring(contextStart, contextEnd);

      // 检查 Set 的内容来推断用途
      if (context.includes('available') || context.includes('tool')) {
        variableMap[varName] = 'AVAILABLE_TOOLS_SET';
      } else {
        variableMap[varName] = `SET_${varName}`;
      }
    }
  }

  // 3. 提取箭头函数变量（可能是生成 prompt 片段的函数）
  const arrowFnRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)=\(\)=>`/g;
  while ((match = arrowFnRegex.exec(content)) !== null) {
    const varName = match[1];
    variableTypes[varName] = 'function';
    if (!variableMap[varName]) {
      // 检查函数体内容来推断用途
      const fnStart = match.index;
      const fnEnd = content.indexOf('`', fnStart + match[0].length);
      if (fnEnd !== -1) {
        const fnBody = content.substring(fnStart, fnEnd + 1).toLowerCase();

        if (fnBody.includes('commit') || fnBody.includes('git')) {
          variableMap[varName] = 'GIT_COMMIT_INSTRUCTION';
        } else if (fnBody.includes('bash') || fnBody.includes('shell')) {
          variableMap[varName] = 'BASH_EXTRA_NOTES';
        } else {
          variableMap[varName] = `FN_${varName}`;
        }
      }
    }
  }

  // 4. 提取带括号的函数定义
  const fnDefRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)=\([^)]*\)=>/g;
  while ((match = fnDefRegex.exec(content)) !== null) {
    const varName = match[1];
    if (!variableTypes[varName]) {
      variableTypes[varName] = 'function';
    }
  }

  return {
    variableMap,
    variableTypes,
  };
}

/**
 * 为 prompt 的 identifiers 生成 identifierMap
 * @param {Array} identifiers - 标识符列表（混淆后的变量名）
 * @param {Object} variableMap - 变量到人类可读名称的映射
 * @param {Object} variableTypes - 变量类型映射
 * @returns {Object} identifierMap
 */
function generateIdentifierMap(identifiers, variableMap, variableTypes) {
  const identifierMap = {};
  const uniqueVars = [...new Set(identifiers)];

  uniqueVars.forEach((varName, idx) => {
    if (variableMap[varName]) {
      identifierMap[idx] = variableMap[varName];
    } else if (variableTypes[varName]) {
      // 根据类型生成默认名称
      const type = variableTypes[varName];
      identifierMap[idx] = `${type.toUpperCase()}_${varName}`;
    } else {
      // 未知变量
      identifierMap[idx] = `VAR_${varName}`;
    }
  });

  return identifierMap;
}

/**
 * 打印变量映射报告
 */
function printReport(variableMap, variableTypes) {
  console.log('=' .repeat(60));
  console.log('自动提取的变量映射');
  console.log('='.repeat(60));
  console.log('');

  console.log('【工具名变量】');
  Object.entries(variableMap)
    .filter(([, name]) => name.endsWith('_TOOL_NAME'))
    .forEach(([varName, humanName]) => {
      console.log(`  ${varName.padEnd(10)} → ${humanName}`);
    });

  console.log('');
  console.log('【Set 变量】');
  Object.entries(variableTypes)
    .filter(([, type]) => type === 'Set')
    .forEach(([varName]) => {
      const humanName = variableMap[varName] || `SET_${varName}`;
      console.log(`  ${varName.padEnd(10)} → ${humanName}`);
    });

  console.log('');
  console.log('【函数变量】');
  Object.entries(variableTypes)
    .filter(([, type]) => type === 'function')
    .forEach(([varName]) => {
      const humanName = variableMap[varName] || `FN_${varName}`;
      console.log(`  ${varName.padEnd(10)} → ${humanName}`);
    });

  console.log('');
}

// CLI
if (require.main === module) {
  const cliPath = process.argv[2] ||
    path.join(process.env.HOME, '.claude/local/node_modules/@anthropic-ai/claude-code/cli.js');

  if (!fs.existsSync(cliPath)) {
    console.error(`文件不存在: ${cliPath}`);
    process.exit(1);
  }

  console.log(`分析文件: ${cliPath}`);
  console.log('');

  const { variableMap, variableTypes } = extractVariableMap(cliPath);
  printReport(variableMap, variableTypes);

  // 输出 JSON 格式
  console.log('');
  console.log('【JSON 格式】');
  console.log(JSON.stringify(variableMap, null, 2));
}

module.exports = {
  extractVariableMap,
  generateIdentifierMap,
  TOOL_NAME_MAP,
};
