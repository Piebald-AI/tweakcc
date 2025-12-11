import { Theme } from '@/types.js';
import { ColoredText } from './ThemePreview.js';

interface ColoredColorNameProps {
  colorKey: keyof Theme['colors'];
  theme: Theme;
  bold?: boolean;
}

export function ColoredColorName({
  colorKey,
  theme,
  bold = false,
}: ColoredColorNameProps) {
  const colorValue = theme.colors[colorKey];

  // Special case: inverseText gets permission background
  if (colorKey === 'inverseText') {
    return (
      <ColoredText
        color={colorValue}
        backgroundColor={theme.colors.permission}
        bold={bold}
      >
        {colorKey}
      </ColoredText>
    );
  }

  // Special case: diff* colors get their own color as background, unstyled text
  if (colorKey.startsWith('diff')) {
    return (
      <ColoredText
        backgroundColor={colorValue}
        bold={bold}
        color={theme.colors.text}
      >
        {colorKey}
      </ColoredText>
    );
  }

  // Normal case: just the color
  return (
    <ColoredText color={colorValue} bold={bold}>
      {colorKey}
    </ColoredText>
  );
}
