import { Box, Text } from 'ink';
import { Theme } from '../utils/types.js';
import process from 'process';
import React, { useState, useEffect, useContext } from 'react';
import { SettingsContext } from '../App.js';
import { getClaudeSubscriptionType, getSelectedModel } from '../utils/misc.js';
import chalk from 'chalk';

interface ThemePreviewProps {
  theme: Theme;
}

/**
 * Helper component that handles ansi: prefixed colors by using chalk directly.
 * For normal colors, passes them through to Ink's Text component.
 */
export interface ColoredTextProps {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dimColor?: boolean;
  children: React.ReactNode;
}

export function ColoredText({
  color,
  backgroundColor,
  bold,
  dimColor,
  children,
}: ColoredTextProps) {
  // Check if we need chalk processing
  const needsChalkColor = color?.startsWith('ansi:');
  const needsChalkBg = backgroundColor?.startsWith('ansi:');

  if (needsChalkColor || needsChalkBg) {
    // Check if children are simple (string/number) or complex (React elements)
    const hasComplexChildren = React.Children.toArray(children).some(child =>
      React.isValidElement(child)
    );

    // If children contain React elements, we can't use chalk - render normally
    if (hasComplexChildren) {
      return <Text>{children}</Text>;
    }

    // Build chalk styling for simple text children
    let styled: typeof chalk = chalk;

    if (needsChalkColor) {
      const chalkColorName = color!.slice(5);
      styled =
        (styled as unknown as Record<string, typeof chalk>)[chalkColorName] ||
        styled;
    }

    if (needsChalkBg) {
      const chalkBgName = backgroundColor!.slice(5);
      // Background colors in chalk are like 'bgRed', but ansi might just be 'red'
      // Try with 'bg' prefix first
      const bgMethodName = chalkBgName.startsWith('bg')
        ? chalkBgName
        : `bg${chalkBgName.charAt(0).toUpperCase()}${chalkBgName.slice(1)}`;
      styled =
        (styled as unknown as Record<string, typeof chalk>)[bgMethodName] ||
        styled;
    }

    if (bold) styled = styled.bold;
    if (dimColor) styled = styled.dim;

    // Convert children to text, filtering out whitespace-only text nodes from JSX formatting
    const childrenArray = React.Children.toArray(children);
    const textContent = childrenArray
      .map(child => {
        if (typeof child === 'string' || typeof child === 'number') {
          return String(child);
        }
        return '';
      })
      .join('');

    // Apply chalk styling to text content
    return <Text>{styled(textContent)}</Text>;
  }

  // No ansi: prefix, use Ink's native props
  return (
    <Text
      color={color}
      backgroundColor={backgroundColor}
      bold={bold}
      dimColor={dimColor}
    >
      {children}
    </Text>
  );
}

interface UltrathinkRainbowShimmerProps {
  text: string;
  nonShimmerColors: string[];
  shimmerColors: string[];
  shimmerWidth?: number;
  updateDuration?: number;
  restartPoint?: number;
}

function UltrathinkRainbowShimmer({
  text,
  nonShimmerColors,
  shimmerColors,
  shimmerWidth = 3,
  updateDuration = 50,
  restartPoint = 10,
}: UltrathinkRainbowShimmerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        const next = prev + 1;
        // Wrap around after the string ends + restart point delay
        if (next >= text.length + restartPoint) {
          return -shimmerWidth;
        }
        return next;
      });
    }, updateDuration);

    return () => clearInterval(interval);
  }, [text.length, restartPoint, updateDuration]);

  // Ensure colors arrays are the same length
  if (nonShimmerColors.length !== shimmerColors.length) {
    console.error(
      'UltrathinkRainbowShimmer: nonShimmerColors and shimmerColors must have the same length'
    );
    return <Text>{text}</Text>;
  }

  return (
    <Text>
      {text.split('').map((char, i) => {
        // Determine if this character is in the shimmer zone
        const isInShimmer =
          i >= currentIndex &&
          i < currentIndex + shimmerWidth &&
          currentIndex < text.length;

        // Calculate which color to use based on position
        const colorIndex = i % nonShimmerColors.length;
        const color = isInShimmer
          ? shimmerColors[colorIndex]
          : nonShimmerColors[colorIndex];

        return (
          <Text key={i} color={color}>
            {char}
          </Text>
        );
      })}
    </Text>
  );
}

const processCwd = process.cwd();

export function ThemePreview({ theme }: ThemePreviewProps) {
  const { ccVersion } = useContext(SettingsContext);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text bold>Preview: {theme.name}</Text>
      </Box>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Box flexDirection="column">
          <Box flexDirection="column">
            <Text>
              <ColoredText color={theme.colors.clawd_body}> ▐</ColoredText>
              <Text
                color={theme.colors.clawd_body}
                backgroundColor={theme.colors.clawd_background}
              >
                ▛███▜
              </Text>
              <Text>
                <ColoredText color={theme.colors.clawd_body}>▌ </ColoredText>{' '}
                <Text bold>Claude Code</Text>{' '}
                {ccVersion ? `v${ccVersion}` : 'v2.0.14'}
              </Text>
            </Text>
            <Text>
              <ColoredText color={theme.colors.clawd_body}>▝▜</ColoredText>
              <Text
                color={theme.colors.clawd_body}
                backgroundColor={theme.colors.clawd_background}
              >
                █████
              </Text>
              <ColoredText color={theme.colors.clawd_body}>▛▘</ColoredText>{' '}
              {getSelectedModel()} · {getClaudeSubscriptionType()}
            </Text>
            <ColoredText color={theme.colors.clawd_body}>
              {'  '}▘▘ ▝▝{'   '}
              {processCwd}
            </ColoredText>
            <Text>
              <ColoredText color={theme.colors.success}>
                Login successful. Press{' '}
              </ColoredText>
              <ColoredText bold color={theme.colors.success}>
                Enter
              </ColoredText>
              <ColoredText color={theme.colors.success}>
                {' '}
                to continue…
              </ColoredText>
            </Text>
          </Box>

          <Text>╭─────────────────────────────────────────────╮</Text>
          <Text>
            │ 1 function greet() {'{'}
            {'                        '}│
          </Text>
          <Text>
            │ 2{' '}
            <ColoredText
              backgroundColor={theme.colors.diffRemoved}
              color={theme.colors.text}
            >
              - console.log(&quot;
            </ColoredText>
            <ColoredText backgroundColor={theme.colors.diffRemovedWord}>
              Hello, World!
            </ColoredText>
            <ColoredText backgroundColor={theme.colors.diffRemoved}>
              &quot;);
            </ColoredText>
            {'           '}│
          </Text>
          <Text>
            │ 2{' '}
            <ColoredText
              backgroundColor={theme.colors.diffAdded}
              color={theme.colors.text}
            >
              + console.log(&quot;
            </ColoredText>
            <ColoredText backgroundColor={theme.colors.diffAddedWord}>
              Hello, Claude!
            </ColoredText>
            <ColoredText backgroundColor={theme.colors.diffAdded}>
              &quot;);
            </ColoredText>
            {'          '}│
          </Text>
          <ColoredText color={theme.colors.warning}>
            ╭─────────────────────────────────────────────╮
          </ColoredText>
          <ColoredText color={theme.colors.warning}>
            │ Do you trust the files in this folder?{'      '}│
          </ColoredText>
          <Text>
            <ColoredText color={theme.colors.warning}>│ </ColoredText>
            <Text dimColor>Enter to confirm · Esc to exit</Text>
            <ColoredText color={theme.colors.warning}>
              {'              '}│
            </ColoredText>
          </Text>
          <ColoredText color={theme.colors.bashBorder}>
            ───────────────────────────────────────────────
          </ColoredText>
          <Text>
            <ColoredText color={theme.colors.bashBorder}>!</ColoredText>
            <Text> ls</Text>
          </Text>
          <ColoredText color={theme.colors.promptBorder}>
            ───────────────────────────────────────────────
          </ColoredText>
          <Text>
            <Text>
              &gt; list the dir{' '}
              <UltrathinkRainbowShimmer
                text="ultrathink"
                nonShimmerColors={[
                  theme.colors.rainbow_red,
                  theme.colors.rainbow_orange,
                  theme.colors.rainbow_yellow,
                  theme.colors.rainbow_green,
                  theme.colors.rainbow_blue,
                  theme.colors.rainbow_indigo,
                  theme.colors.rainbow_violet,
                ]}
                shimmerColors={[
                  theme.colors.rainbow_red_shimmer,
                  theme.colors.rainbow_orange_shimmer,
                  theme.colors.rainbow_yellow_shimmer,
                  theme.colors.rainbow_green_shimmer,
                  theme.colors.rainbow_blue_shimmer,
                  theme.colors.rainbow_indigo_shimmer,
                  theme.colors.rainbow_violet_shimmer,
                ]}
                shimmerWidth={3}
                updateDuration={50}
                restartPoint={10}
              />
            </Text>
          </Text>
          <ColoredText color={theme.colors.planMode}>
            ╭─────────────────────────────────────────────╮
          </ColoredText>
          <Text>
            <ColoredText color={theme.colors.planMode}>│ </ColoredText>
            <ColoredText color={theme.colors.permission}>
              Ready to code?{'  '}
            </ColoredText>
            <Text>Here is Claude&apos;s plan:</Text>
            <ColoredText color={theme.colors.planMode}>{'      '}│</ColoredText>
          </Text>
          <ColoredText color={theme.colors.permission}>
            ╭─────────────────────────────────────────────╮
          </ColoredText>
          <Text>
            <ColoredText color={theme.colors.permission}>│ </ColoredText>
            <Text bold>Permissions:</Text>{' '}
            <ColoredText
              backgroundColor={theme.colors.permission}
              color={theme.colors.inverseText}
              bold
            >
              {' '}
              Allow{' '}
            </ColoredText>
            {'  '}
            Deny{'   '}Workspace{'      '}
            <ColoredText color={theme.colors.permission}>│</ColoredText>
          </Text>
          <Text>&gt; list the dir</Text>
          <Text>
            <ColoredText color={theme.colors.error}>●</ColoredText>
            <Text> Update(__init__.py)</Text>
          </Text>
          <Text>
            <Text> ⎿ </Text>
            <ColoredText color={theme.colors.error}>
              User rejected update to __init__.py
            </ColoredText>
          </Text>
          <Text>
            {' '}
            1{' '}
            <ColoredText backgroundColor={theme.colors.diffRemovedDimmed}>
              - import{' '}
            </ColoredText>
            <ColoredText backgroundColor={theme.colors.diffRemovedWordDimmed}>
              os
            </ColoredText>
          </Text>
          <Text>
            {' '}
            2{' '}
            <ColoredText backgroundColor={theme.colors.diffAddedDimmed}>
              + import{' '}
            </ColoredText>
            <ColoredText backgroundColor={theme.colors.diffAddedWordDimmed}>
              random
            </ColoredText>
          </Text>
          <Text>
            <ColoredText color={theme.colors.success}>●</ColoredText>
            <Text> List(.)</Text>
          </Text>
          <Text>
            <Text>●</Text>
            <Text> The directory </Text>
            <ColoredText color={theme.colors.permission}>
              C:\Users\user
            </ColoredText>
            <Text>
              {' '}
              contains <Text bold>123</Text> files.
            </Text>
          </Text>
          <Text>
            <ColoredText color={theme.colors.claude}>✻ Th</ColoredText>
            <ColoredText color={theme.colors.claudeShimmer}>ink</ColoredText>
            <ColoredText color={theme.colors.claude}>ing… </ColoredText>
            <Text>(esc to interrupt)</Text>
          </Text>
          <Text>
            <ColoredText color={theme.colors.autoAccept}>
              ⏵⏵ accept edits on (shift+tab to cycle)
            </ColoredText>
          </Text>
          <Text>
            <ColoredText color={theme.colors.planMode}>
              ⏸ plan mode on (shift+tab to cycle)
            </ColoredText>
          </Text>
          <Text>
            <ColoredText color={theme.colors.ide}>
              ◯ IDE connected ⧉ 44 lines selected
            </ColoredText>
          </Text>
          {/*<Text>
            <Text bold>●</Text>{' '}
            <ColoredText backgroundColor={theme.colors.red_FOR_SUBAGENTS_ONLY}>
              code-reviewer
            </ColoredText>
            <Text>(Reviewing unstaged changes)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <ColoredText
              backgroundColor={theme.colors.orange_FOR_SUBAGENTS_ONLY}
            >
              performance
            </ColoredText>
            <Text>(Optimizing hot loop performance)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <ColoredText
              backgroundColor={theme.colors.yellow_FOR_SUBAGENTS_ONLY}
            >
              security-auditor
            </ColoredText>
            <Text>(Auditing codebase)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <ColoredText
              backgroundColor={theme.colors.green_FOR_SUBAGENTS_ONLY}
            >
              test-runner
            </ColoredText>
            <Text>(Running integration tests)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <ColoredText backgroundColor={theme.colors.blue_FOR_SUBAGENTS_ONLY}>
              tech-lead
            </ColoredText>
            <Text>(Planning next steps)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <ColoredText backgroundColor={theme.colors.cyan_FOR_SUBAGENTS_ONLY}>
              database-admin
            </ColoredText>
            <Text>(Running DB migrations)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <ColoredText
              backgroundColor={theme.colors.purple_FOR_SUBAGENTS_ONLY}
            >
              documentation
            </ColoredText>
            <Text>(Generating docs)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <Text backgroundColor={theme.colors.pink_FOR_SUBAGENTS_ONLY}>
              ui-designer
            </Text>
            <Text>(Designing new preview panel)</Text>
          </Text>
          <Text>
            <Text bold>●</Text>{' '}
            <Text bold inverse>
              general
            </Text>
            <Text>(Reviewing architecture)</Text>
          </Text>*/}
        </Box>
      </Box>
    </Box>
  );
}
