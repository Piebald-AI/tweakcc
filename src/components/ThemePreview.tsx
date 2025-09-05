import { Box, Text } from 'ink';
import { Theme } from '../utils/types.js';

interface ThemePreviewProps {
  theme: Theme;
}

export function ThemePreview({ theme }: ThemePreviewProps) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text bold>Preview: {theme.name}</Text>
      </Box>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Box flexDirection="column">
          <Text>╭─────────────────────────────────────────────╮</Text>
          <Text>
            │ <Text color={theme.colors.secondaryText}>1</Text>{' '}
            <Text color={theme.colors.text}>function greet() {'{'}</Text>
            {'                        '}│
          </Text>
          <Text>
            │ <Text color={theme.colors.secondaryText}>2</Text>{' '}
            <Text
              backgroundColor={theme.colors.diffRemoved}
              color={theme.colors.text}
            >
              - console.log(&quot;
              <Text backgroundColor={theme.colors.diffRemovedWord}>
                Hello, World!
              </Text>
              &quot;);
            </Text>
            {'           '}│
          </Text>
          <Text>
            │ <Text color={theme.colors.secondaryText}>2</Text>{' '}
            <Text
              backgroundColor={theme.colors.diffAdded}
              color={theme.colors.text}
            >
              + console.log(&quot;
              <Text backgroundColor={theme.colors.diffAddedWord}>
                Hello, Claude!
              </Text>
              &quot;);
            </Text>
            {'          '}│
          </Text>
          <Text color={theme.colors.warning}>
            ╭─────────────────────────────────────────────╮
          </Text>
          <Text color={theme.colors.warning}>
            │ Do you trust the files in this folder?{'      '}│
          </Text>
          <Text>
            <Text color={theme.colors.warning}>│ </Text>
            <Text dimColor>Enter to confirm · Esc to exit</Text>
            <Text color={theme.colors.warning}>{'              '}│</Text>
          </Text>
          <Text color={theme.colors.claude}>
            ╭─────────────────────────────────────────────╮
          </Text>
          <Text>
            <Text color={theme.colors.claude}>│ </Text>
            <Text color={theme.colors.claude}>✻</Text>
            <Text> Welcome to Tweak Claude Code!</Text>
            <Text color={theme.colors.claude}>{'             '}│</Text>
          </Text>
          <Text>
            <Text color={theme.colors.claude}>│</Text>
            <Text color={theme.colors.secondaryText} italic>
              {' '}
              /help for help, /status for your current set
            </Text>
            <Text color={theme.colors.claude}>│</Text>
          </Text>
          <Text color={theme.colors.success}>
            Login successful. Press <Text bold>Enter</Text> to continue…
          </Text>
          <Text color={theme.colors.bashBorder}>
            ╭─────────────────────────────────────────────╮
          </Text>
          <Text>
            <Text color={theme.colors.bashBorder}>│ !</Text>
            <Text> ls{'                                        '}</Text>
            <Text color={theme.colors.bashBorder}>│</Text>
          </Text>
          <Text color={theme.colors.planMode}>
            ╭─────────────────────────────────────────────╮
          </Text>
          <Text>
            <Text color={theme.colors.planMode}>│ </Text>
            <Text color={theme.colors.permission}>Ready to code?</Text>
            <Text color={theme.colors.planMode}>
              {'                              '}│
            </Text>
          </Text>
          <Text>
            <Text color={theme.colors.planMode}>│ </Text>
            <Text>Here is Claude&apos;s plan:</Text>
            <Text color={theme.colors.planMode}>
              {'                      '}│
            </Text>
          </Text>
          <Text color={theme.colors.secondaryBorder}>
            ╭─────────────────────────────────────────────╮
          </Text>
          <Text>
            <Text color={theme.colors.secondaryBorder}>│</Text>{' '}
            <Text color={theme.colors.secondaryText}>
              &gt; Try &ldquo;refactor &lt;filepath&gt;&rdquo;
              {'                 '}│
            </Text>
          </Text>
          <Text color={theme.colors.permission}>
            ╭─────────────────────────────────────────────╮
          </Text>
          <Text>
            <Text color={theme.colors.permission}>
              │ <Text bold>Permissions:</Text>
            </Text>{' '}
            <Text
              backgroundColor={theme.colors.permission}
              color={theme.colors.inverseText}
              bold
            >
              {' '}
              Allow{' '}
            </Text>
            {'  '}
            Deny{'   '}Workspace{'      '}
            <Text color={theme.colors.permission}>│</Text>
          </Text>
          <Text color={theme.colors.secondaryText}>&gt; list the dir</Text>
          <Text>
            <Text color={theme.colors.error}>●</Text>
            <Text> Update(__init__.py)</Text>
          </Text>
          <Text>
            <Text> ⎿ </Text>
            <Text color={theme.colors.error}>
              User rejected update to __init__.py
            </Text>
          </Text>
          <Text>
            {' '}
            <Text color={theme.colors.secondaryText}>1</Text>{' '}
            <Text
              backgroundColor={theme.colors.diffRemovedDimmed}
              color={theme.colors.text}
            >
              - import{' '}
              <Text
                backgroundColor={theme.colors.diffRemovedWordDimmed}
                color={theme.colors.text}
              >
                os
              </Text>
            </Text>
          </Text>
          <Text>
            {' '}
            <Text color={theme.colors.secondaryText}>2</Text>{' '}
            <Text
              backgroundColor={theme.colors.diffAddedDimmed}
              color={theme.colors.text}
            >
              + import{' '}
              <Text
                backgroundColor={theme.colors.diffAddedWordDimmed}
                color={theme.colors.text}
              >
                random
              </Text>
            </Text>
          </Text>
          <Text>
            <Text color={theme.colors.success}>●</Text>
            <Text> List(.)</Text>
          </Text>
          <Text> ⎿ Listed 123 paths (ctrl+r to expand)</Text>
          <Text>
            <Text color={theme.colors.secondaryText}>●</Text>
            <Text> The directory </Text>
            <Text color={theme.colors.permission}>C:\Users\user</Text>
            <Text>
              {' '}
              contains <Text bold>123</Text> files.
            </Text>
          </Text>
          <Text>
            <Text color={theme.colors.claude}>
              ✻ Th<Text color={theme.colors.claudeShimmer}>ink</Text>ing…{' '}
            </Text>
            <Text color={theme.colors.secondaryText}>
              (10s · ↑ 456 tokens · esc to interrupt)
            </Text>
          </Text>
          <Text>
            <Text color={theme.colors.autoAccept}>
              ⏵⏵ auto-accept edits on{' '}
            </Text>
            <Text color={theme.colors.secondaryText} dimColor>
              (shift+tab to cycle)
            </Text>
          </Text>
          <Text>
            <Text color={theme.colors.planMode}>⏸ plan mode on </Text>
            <Text color={theme.colors.secondaryText} dimColor>
              (shift+tab to cycle)
            </Text>
          </Text>
          <Text>
            <Text color={theme.colors.ide}>
              ◯ IDE connected ⧉ 44 lines selected
            </Text>
          </Text>
          {/* <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.red_FOR_SUBAGENTS_ONLY}>
              code-reviewer
            </Text>
            <Text>(Reviewing unstaged changes)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.orange_FOR_SUBAGENTS_ONLY}>
              performance
            </Text>
            <Text>(Optimizing hot loop performance)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.yellow_FOR_SUBAGENTS_ONLY}>
              security-auditor
            </Text>
            <Text>(Auditing codebase)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.green_FOR_SUBAGENTS_ONLY}>
              test-runner
            </Text>
            <Text>(Running integration tests)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.blue_FOR_SUBAGENTS_ONLY}>
              tech-lead
            </Text>
            <Text>(Planning next steps)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.cyan_FOR_SUBAGENTS_ONLY}>
              database-admin
            </Text>
            <Text>(Running DB migrations)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.purple_FOR_SUBAGENTS_ONLY}>
              documentation
            </Text>
            <Text>(Generating docs)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text backgroundColor={theme.colors.pink_FOR_SUBAGENTS_ONLY}>
              ui-designer
            </Text>
            <Text>(Designing new preview panel)</Text>
          </Text>
          <Text>
            <Text bold color={theme.colors.secondaryText}>
              ●
            </Text>{' '}
            <Text bold inverse>
              general
            </Text>
            <Text>(Reviewing architecture)</Text>
          </Text> */}
        </Box>
      </Box>
    </Box>
  );
}
