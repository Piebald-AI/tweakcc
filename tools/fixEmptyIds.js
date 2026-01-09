#!/usr/bin/env node
const fs = require('fs');

const filePath = process.argv[2] || 'data/prompts/prompts-2.1.2.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.prompts = data.prompts.map(prompt => {
  if (prompt.id !== '') return prompt;

  const content = prompt.pieces[0] || '';

  if (content.includes('MCP CLI Command')) {
    prompt.name = 'System Prompt: MCP CLI Command';
    prompt.id = 'system-prompt-mcp-cli-command';
  } else if (content.includes('You are an interactive CLI tool')) {
    prompt.name = 'Main System Prompt';
    prompt.id = 'main-system-prompt';
  } else if (content.includes('Committing changes with git')) {
    prompt.name = 'System Prompt: Git commit instructions';
    prompt.id = 'system-prompt-git-commit-instructions';
  } else if (content.includes('Plan mode is active') && content.includes('plan file')) {
    prompt.name = 'System Reminder: Plan mode with plan file';
    prompt.id = 'system-reminder-plan-mode-with-plan-file';
  } else if (content.includes('Plan mode is active')) {
    prompt.name = 'System Reminder: Plan mode active';
    prompt.id = 'system-reminder-plan-mode-active';
  } else if (content.includes('Search for or select MCP tools')) {
    prompt.name = 'Tool Description: MCP Search v2';
    prompt.id = 'tool-description-mcp-search-v2';
  } else if (content.includes('AI assistant integrated into a git')) {
    prompt.name = 'Agent Prompt: GitHub PR comments fetcher';
    prompt.id = 'agent-prompt-github-pr-comments-fetcher';
  } else {
    // Generate an id from first 50 chars of content
    const slug = content.slice(0, 50).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    prompt.id = 'unknown-' + slug;
    prompt.name = 'Unknown: ' + content.slice(0, 50);
  }

  return prompt;
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed empty ids in', filePath);
