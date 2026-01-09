#!/usr/bin/env node
/**
 * validateCustomPrompts.js - 验证用户自定义的 prompts 是否兼容
 *
 * 用法: node validateCustomPrompts.js <旧prompts目录> <prompts.json>
 */

const fs = require('fs');
const path = require('path');

const oldDir = process.argv[2] || path.join(process.env.HOME, '.tweakcc/system-prompts.backup');
const promptsJson = process.argv[3] || 'data/prompts/prompts-2.1.2.json';
const newDir = path.join(process.env.HOME, '.tweakcc/system-prompts');

// 加载 prompts.json 获取每个 prompt 的 variables
const promptsData = JSON.parse(fs.readFileSync(promptsJson, 'utf8'));
const promptVariables = {};
promptsData.prompts.forEach(p => {
  if (p.id) {
    promptVariables[p.id] = new Set(Object.values(p.identifierMap || {}));
  }
});

// 从 markdown 内容中提取使用的变量
function extractUsedVariables(content) {
  const variables = new Set();
  // 匹配 ${VAR_NAME} 或 ${VAR_NAME(...)} 或 ${VAR.property}
  const regex = /\$\{([A-Z_][A-Z0-9_]*)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]);
  }
  return variables;
}

// 从 markdown frontmatter 中提取 id
function extractId(content) {
  const match = content.match(/ccVersion:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

// 获取所有旧的 .md 文件
const oldFiles = fs.readdirSync(oldDir).filter(f => f.endsWith('.md'));

console.log('=' .repeat(70));
console.log('自定义 Prompts 兼容性检查');
console.log('='.repeat(70));
console.log(`旧目录: ${oldDir}`);
console.log(`新目录: ${newDir}`);
console.log(`Prompts JSON: ${promptsJson}`);
console.log('');

const results = {
  compatible: [],    // 可以直接使用
  needsReview: [],   // 需要检查但可能可用
  incompatible: [],  // 不兼容，需要重写
};

for (const file of oldFiles) {
  const oldPath = path.join(oldDir, file);
  const newPath = path.join(newDir, file);
  const oldContent = fs.readFileSync(oldPath, 'utf8');

  // 获取 prompt id (从文件名)
  const promptId = file.replace('.md', '');
  const allowedVars = promptVariables[promptId] || new Set();

  // 提取使用的变量
  const usedVars = extractUsedVariables(oldContent);

  // 检查是否有不允许的变量
  const invalidVars = [];
  for (const v of usedVars) {
    if (!allowedVars.has(v)) {
      invalidVars.push(v);
    }
  }

  // 检查是否有复杂表达式 (函数调用、属性访问)
  const hasComplexExpr = /\$\{[A-Z_][A-Z0-9_]*[.(]/.test(oldContent);

  // 检查新文件是否存在
  const newExists = fs.existsSync(newPath);

  // 检查是否与原始模板相同（未修改）
  let isModified = true;
  if (newExists) {
    const newContent = fs.readFileSync(newPath, 'utf8');
    // 只比较正文部分（去掉 frontmatter）
    const oldBody = oldContent.replace(/^<!--[\s\S]*?-->\n?/, '').trim();
    const newBody = newContent.replace(/^<!--[\s\S]*?-->\n?/, '').trim();
    isModified = oldBody !== newBody;
  }

  const result = {
    file,
    promptId,
    isModified,
    newExists,
    usedVars: [...usedVars],
    allowedVars: [...allowedVars],
    invalidVars,
    hasComplexExpr,
  };

  if (!isModified) {
    // 未修改，不需要处理
    continue;
  } else if (invalidVars.length === 0 && !hasComplexExpr) {
    results.compatible.push(result);
  } else if (hasComplexExpr) {
    results.incompatible.push(result);
  } else {
    results.needsReview.push(result);
  }
}

// 输出结果
console.log(`\n✅ 【可直接使用】 ${results.compatible.length} 个\n`);
for (const r of results.compatible) {
  console.log(`  ${r.file}`);
}

console.log(`\n⚠️  【需要检查】 ${results.needsReview.length} 个\n`);
for (const r of results.needsReview) {
  console.log(`  ${r.file}`);
  console.log(`     使用了未定义变量: ${r.invalidVars.join(', ')}`);
}

console.log(`\n❌ 【需要重写】 ${results.incompatible.length} 个 (包含复杂表达式)\n`);
for (const r of results.incompatible) {
  console.log(`  ${r.file}`);
  if (r.invalidVars.length > 0) {
    console.log(`     未定义变量: ${r.invalidVars.join(', ')}`);
  }
  console.log(`     包含函数调用或属性访问语法`);
}

// 输出可操作的命令
console.log('\n' + '='.repeat(70));
console.log('操作建议');
console.log('='.repeat(70));

if (results.compatible.length > 0) {
  console.log('\n# 恢复可直接使用的 prompts:');
  for (const r of results.compatible) {
    console.log(`cp "${path.join(oldDir, r.file)}" "${path.join(newDir, r.file)}"`);
  }
}

if (results.incompatible.length > 0) {
  console.log('\n# 需要手动重写的 prompts:');
  for (const r of results.incompatible) {
    console.log(`# ${r.file} - 打开对比查看:`);
    console.log(`# diff "${path.join(oldDir, r.file)}" "${path.join(newDir, r.file)}"`);
  }
}

// 保存结果到 JSON
const outputPath = '/tmp/prompt-validation-result.json';
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\n详细结果已保存到: ${outputPath}`);
