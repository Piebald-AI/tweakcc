import { useState, useEffect, Fragment } from 'react';
import { Box, Text, useInput } from 'ink';
import { isValidColorFormat, normalizeColorToRgb } from '../utils/misc.js';

interface ColorPickerProps {
  initialValue: string;
  onColorChange: (color: string) => void;
  onExit: () => void;
  onCancel: () => void;
  colorKey?: string; // Add colorKey to identify diff colors
  theme?: { colors?: { text?: string; permission?: string } }; // Add theme for text color
}

interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export function ColorPicker({
  initialValue,
  onColorChange,
  onExit,
  onCancel,
  colorKey,
  theme,
}: ColorPickerProps) {
  // Parse initial color value immediately
  const initialHsl = parseColorToHSL(initialValue) || { h: 0, s: 50, l: 50 };
  const initialRgb = parseColorToRGB(initialValue) || {
    r: 128,
    g: 128,
    b: 128,
  };

  const [hsl, setHsl] = useState<HSL>(initialHsl);
  const [rgb, setRgb] = useState<RGB>(initialRgb);
  const [sliderMode, setSliderMode] = useState<'hsl' | 'rgb'>('hsl');
  const [selectedBar, setSelectedBar] = useState<
    'h' | 's' | 'l' | 'r' | 'g' | 'b'
  >('h');
  const [updating, setUpdating] = useState(false);

  // Update values when initialValue changes (for prop changes)
  useEffect(() => {
    const parsedHsl = parseColorToHSL(initialValue);
    const parsedRgb = parseColorToRGB(initialValue);
    if (parsedHsl && parsedRgb) {
      setUpdating(true);
      setHsl(parsedHsl);
      setRgb(parsedRgb);
      setUpdating(false);
    }
  }, [initialValue]);

  // Update parent when either HSL or RGB changes
  useEffect(() => {
    if (!updating) {
      const rgbString = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      onColorChange(rgbString);
    }
  }, [hsl, rgb, updating]);

  const handlePastedColor = (pastedText: string) => {
    if (isValidColorFormat(pastedText)) {
      const normalizedColor = normalizeColorToRgb(pastedText);
      const parsedHsl = parseColorToHSL(normalizedColor);
      const parsedRgb = parseColorToRGB(normalizedColor);

      if (parsedHsl && parsedRgb) {
        setUpdating(true);
        setHsl(parsedHsl);
        setRgb(parsedRgb);
        setUpdating(false);
      }
    }
  };

  useInput((input, key) => {
    // Handle pasted text (multi-character input indicates paste)
    if (input.length > 1 && !key.ctrl && !key.meta) {
      handlePastedColor(input);
      return;
    }

    if (key.return) {
      onExit();
    } else if (key.escape) {
      onCancel();
    } else if (key.ctrl && input === 'a') {
      // Switch between HSL and RGB sliders
      setSliderMode(prev => (prev === 'hsl' ? 'rgb' : 'hsl'));
      setSelectedBar(prev => {
        if (sliderMode === 'hsl') {
          // Switching to RGB
          if (prev === 'h') return 'r';
          if (prev === 's') return 'g';
          return 'b';
        } else {
          // Switching to HSL
          if (prev === 'r') return 'h';
          if (prev === 'g') return 's';
          return 'l';
        }
      });
    } else if (key.upArrow) {
      if (sliderMode === 'hsl') {
        setSelectedBar(prev => {
          if (prev === 'h') return 'l';
          if (prev === 's') return 'h';
          return 's';
        });
      } else {
        setSelectedBar(prev => {
          if (prev === 'r') return 'b';
          if (prev === 'g') return 'r';
          return 'g';
        });
      }
    } else if (key.downArrow || key.tab) {
      if (sliderMode === 'hsl') {
        setSelectedBar(prev => {
          if (prev === 'h') return 's';
          if (prev === 's') return 'l';
          return 'h';
        });
      } else {
        setSelectedBar(prev => {
          if (prev === 'r') return 'g';
          if (prev === 'g') return 'b';
          return 'r';
        });
      }
    } else if (key.leftArrow) {
      const step = key.shift || key.ctrl || key.meta ? -10 : -1;
      adjustValue(step);
    } else if (key.rightArrow) {
      const step = key.shift || key.ctrl || key.meta ? 10 : 1;
      adjustValue(step);
    }
  });

  const adjustValue = (delta: number) => {
    setUpdating(true);

    if (sliderMode === 'hsl') {
      setHsl(prev => {
        const newHsl = { ...prev };
        if (selectedBar === 'h') {
          newHsl.h = Math.max(0, Math.min(359, prev.h + delta));
        } else if (selectedBar === 's') {
          newHsl.s = Math.max(0, Math.min(100, prev.s + delta));
        } else if (selectedBar === 'l') {
          newHsl.l = Math.max(0, Math.min(100, prev.l + delta));
        }

        // Sync RGB
        const [r, g, b] = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
        setRgb({ r, g, b });

        return newHsl;
      });
    } else {
      setRgb(prev => {
        const newRgb = { ...prev };
        if (selectedBar === 'r') {
          newRgb.r = Math.max(0, Math.min(255, prev.r + delta));
        } else if (selectedBar === 'g') {
          newRgb.g = Math.max(0, Math.min(255, prev.g + delta));
        } else if (selectedBar === 'b') {
          newRgb.b = Math.max(0, Math.min(255, prev.b + delta));
        }

        // Sync HSL
        const newHsl = rgbToHsl(newRgb.r, newRgb.g, newRgb.b);
        setHsl(newHsl);

        return newRgb;
      });
    }

    setUpdating(false);
  };

  const rgbToHsl = (r: number, g: number, b: number): HSL => {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;

    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const diff = max - min;

    // Calculate lightness
    const l = (max + min) / 2;

    // Calculate saturation
    let s = 0;
    if (diff !== 0) {
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    }

    // Calculate hue
    let h = 0;
    if (diff !== 0) {
      if (max === rNorm) {
        h = ((gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0)) / 6;
      } else if (max === gNorm) {
        h = ((bNorm - rNorm) / diff + 2) / 6;
      } else {
        h = ((rNorm - gNorm) / diff + 4) / 6;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  };

  const hslToRgb = (
    h: number,
    s: number,
    l: number
  ): [number, number, number] => {
    h /= 360;
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (0 <= h && h < 1 / 6) {
      r = c;
      g = x;
      b = 0;
    } else if (1 / 6 <= h && h < 2 / 6) {
      r = x;
      g = c;
      b = 0;
    } else if (2 / 6 <= h && h < 3 / 6) {
      r = 0;
      g = c;
      b = x;
    } else if (3 / 6 <= h && h < 4 / 6) {
      r = 0;
      g = x;
      b = c;
    } else if (4 / 6 <= h && h < 5 / 6) {
      r = x;
      g = 0;
      b = c;
    } else if (5 / 6 <= h && h < 1) {
      r = c;
      g = 0;
      b = x;
    }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  };

  const createHueGradient = () => {
    const segments = [];
    const colors = [
      [255, 0, 0], // Red
      [255, 127, 0], // Orange (red-yellow)
      [255, 255, 0], // Yellow
      [127, 255, 0], // Yellow-green
      [0, 255, 0], // Green
      [0, 255, 127], // Green-cyan
      [0, 255, 255], // Cyan
      [0, 127, 255], // Cyan-blue
      [0, 0, 255], // Blue
      [127, 0, 255], // Blue-magenta
      [255, 0, 255], // Magenta
      [255, 0, 127], // Magenta-red
      [255, 0, 0], // Red
    ];

    for (let i = 0; i < 40; i++) {
      const progress = i / 39;
      const colorIndex = progress * (colors.length - 1);
      const lowerIndex = Math.floor(colorIndex);
      const upperIndex = Math.ceil(colorIndex);
      const factor = colorIndex - lowerIndex;

      const [r1, g1, b1] = colors[lowerIndex];
      const [r2, g2, b2] = colors[upperIndex];

      const r = Math.round(r1 + (r2 - r1) * factor);
      const g = Math.round(g1 + (g2 - g1) * factor);
      const b = Math.round(b1 + (b2 - b1) * factor);

      segments.push(
        <Text key={i} backgroundColor={`rgb(${r},${g},${b})`}>
          {' '}
        </Text>
      );
    }
    return segments;
  };

  const createSaturationGradient = () => {
    const segments = [];
    for (let i = 0; i < 40; i++) {
      const saturation = (i / 39) * 100;
      const [r, g, b] = hslToRgb(hsl.h, saturation, hsl.l);
      segments.push(
        <Text key={i} backgroundColor={`rgb(${r},${g},${b})`}>
          {' '}
        </Text>
      );
    }
    return segments;
  };

  const createLightnessGradient = () => {
    const segments = [];
    for (let i = 0; i < 40; i++) {
      const lightness = (i / 39) * 100;
      const [r, g, b] = hslToRgb(hsl.h, hsl.s, lightness);
      segments.push(
        <Text key={i} backgroundColor={`rgb(${r},${g},${b})`}>
          {' '}
        </Text>
      );
    }
    return segments;
  };

  const getCurrentColor = () => {
    const [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l);
    return `rgb(${r},${g},${b})`;
  };

  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const createRedGradient = () => {
    const segments = [];
    for (let i = 0; i < 40; i++) {
      const red = Math.round((i / 39) * 255);
      segments.push(
        <Text key={i} backgroundColor={`rgb(${red},${rgb.g},${rgb.b})`}>
          {' '}
        </Text>
      );
    }
    return segments;
  };

  const createGreenGradient = () => {
    const segments = [];
    for (let i = 0; i < 40; i++) {
      const green = Math.round((i / 39) * 255);
      segments.push(
        <Text key={i} backgroundColor={`rgb(${rgb.r},${green},${rgb.b})`}>
          {' '}
        </Text>
      );
    }
    return segments;
  };

  const createBlueGradient = () => {
    const segments = [];
    for (let i = 0; i < 40; i++) {
      const blue = Math.round((i / 39) * 255);
      segments.push(
        <Text key={i} backgroundColor={`rgb(${rgb.r},${rgb.g},${blue})`}>
          {' '}
        </Text>
      );
    }
    return segments;
  };

  const getMarkerPosition = (value: number, max: number) => {
    return Math.round((value / max) * 39);
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="white"
      padding={1}
    >
      <Box flexDirection="column">
        <Text bold>Color Picker</Text>
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray" dimColor>
            ←→ to adjust (shift/ctrl/cmd +10)
          </Text>
          <Text color="gray" dimColor>
            ↑↓ to change bar
          </Text>
          <Text color="gray" dimColor>
            ctrl+a to switch rgb/hsl
          </Text>
          <Text color="gray" dimColor>
            paste color from clipboard
          </Text>
          <Text color="gray" dimColor>
            enter to exit (auto-saved)
          </Text>
          <Text color="gray" dimColor>
            esc to cancel changes
          </Text>
        </Box>
      </Box>

      {sliderMode === 'hsl' ? (
        <>
          <Box marginBottom={1}>
            <Box width={25}>
              <Text color={selectedBar === 'h' ? 'yellow' : 'white'}>
                {selectedBar === 'h' ? '❯ ' : '  '}Hue ({hsl.h}°):
              </Text>
            </Box>
            <Box>
              {createHueGradient().map((segment, i) => (
                <Fragment key={i}>
                  {i === getMarkerPosition(hsl.h, 360) ? (
                    <Text>|</Text>
                  ) : (
                    segment
                  )}
                </Fragment>
              ))}
            </Box>
          </Box>

          <Box marginBottom={1}>
            <Box width={25}>
              <Text color={selectedBar === 's' ? 'yellow' : 'white'}>
                {selectedBar === 's' ? '❯ ' : '  '}Saturation ({hsl.s}%):
              </Text>
            </Box>
            <Box>
              {createSaturationGradient().map((segment, i) => (
                <Fragment key={i}>
                  {i === getMarkerPosition(hsl.s, 100) ? (
                    <Text>|</Text>
                  ) : (
                    segment
                  )}
                </Fragment>
              ))}
            </Box>
          </Box>

          <Box marginBottom={1}>
            <Box width={25}>
              <Text color={selectedBar === 'l' ? 'yellow' : 'white'}>
                {selectedBar === 'l' ? '❯ ' : '  '}Lightness ({hsl.l}%):
              </Text>
            </Box>
            <Box>
              {createLightnessGradient().map((segment, i) => (
                <Fragment key={i}>
                  {i === getMarkerPosition(hsl.l, 100) ? (
                    <Text>|</Text>
                  ) : (
                    segment
                  )}
                </Fragment>
              ))}
            </Box>
          </Box>
        </>
      ) : (
        <>
          <Box marginBottom={1}>
            <Box width={25}>
              <Text color={selectedBar === 'r' ? 'yellow' : 'white'}>
                {selectedBar === 'r' ? '❯ ' : '  '}Red ({rgb.r}):
              </Text>
            </Box>
            <Box>
              {createRedGradient().map((segment, i) => (
                <Fragment key={i}>
                  {i === getMarkerPosition(rgb.r, 255) ? (
                    <Text>|</Text>
                  ) : (
                    segment
                  )}
                </Fragment>
              ))}
            </Box>
          </Box>

          <Box marginBottom={1}>
            <Box width={25}>
              <Text color={selectedBar === 'g' ? 'yellow' : 'white'}>
                {selectedBar === 'g' ? '❯ ' : '  '}Green ({rgb.g}):
              </Text>
            </Box>
            <Box>
              {createGreenGradient().map((segment, i) => (
                <Fragment key={i}>
                  {i === getMarkerPosition(rgb.g, 255) ? (
                    <Text>|</Text>
                  ) : (
                    segment
                  )}
                </Fragment>
              ))}
            </Box>
          </Box>

          <Box marginBottom={1}>
            <Box width={25}>
              <Text color={selectedBar === 'b' ? 'yellow' : 'white'}>
                {selectedBar === 'b' ? '❯ ' : '  '}Blue ({rgb.b}):
              </Text>
            </Box>
            <Box>
              {createBlueGradient().map((segment, i) => (
                <Fragment key={i}>
                  {i === getMarkerPosition(rgb.b, 255) ? (
                    <Text>|</Text>
                  ) : (
                    segment
                  )}
                </Fragment>
              ))}
            </Box>
          </Box>
        </>
      )}

      <Box marginBottom={1}>
        <Text>Current: </Text>
        <Text backgroundColor={getCurrentColor()}>{'        '}</Text>
      </Box>

      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="column">
          <Text dimColor>Hex </Text>
          {colorKey?.startsWith('diff') ? (
            <Text
              backgroundColor={getCurrentColor()}
              color={theme?.colors?.text || 'white'}
              bold
            >
              {rgbToHex(rgb.r, rgb.g, rgb.b)}
            </Text>
          ) : colorKey === 'inverseText' ? (
            <Text
              color={getCurrentColor()}
              backgroundColor={theme?.colors?.permission}
              bold
            >
              {rgbToHex(rgb.r, rgb.g, rgb.b)}
            </Text>
          ) : (
            <Text color={getCurrentColor()} bold>
              {rgbToHex(rgb.r, rgb.g, rgb.b)}
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text dimColor>RGB </Text>
          {colorKey?.startsWith('diff') ? (
            <Text
              backgroundColor={getCurrentColor()}
              color={theme?.colors?.text || 'white'}
              bold
            >
              {`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`}
            </Text>
          ) : colorKey === 'inverseText' ? (
            <Text
              color={getCurrentColor()}
              backgroundColor={theme?.colors?.permission}
              bold
            >
              {`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`}
            </Text>
          ) : (
            <Text
              color={getCurrentColor()}
              bold
            >{`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`}</Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text dimColor>HSL </Text>
          {colorKey?.startsWith('diff') ? (
            <Text
              backgroundColor={getCurrentColor()}
              color={theme?.colors?.text || 'white'}
              bold
            >
              {`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`}
            </Text>
          ) : colorKey === 'inverseText' ? (
            <Text
              color={getCurrentColor()}
              backgroundColor={theme?.colors?.permission}
              bold
            >
              {`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`}
            </Text>
          ) : (
            <Text
              color={getCurrentColor()}
              bold
            >{`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function parseColorToRGB(color: string): RGB | null {
  // Parse RGB format
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }

  // Parse hex format
  const hexMatch = color.match(/^#([a-fA-F0-9]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16),
    };
  }

  return null;
}

function parseColorToHSL(color: string): HSL | null {
  // Parse HSL format
  const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (hslMatch) {
    return {
      h: parseInt(hslMatch[1]),
      s: parseInt(hslMatch[2]),
      l: parseInt(hslMatch[3]),
    };
  }

  // Parse RGB format
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]) / 255;
    const g = parseInt(rgbMatch[2]) / 255;
    const b = parseInt(rgbMatch[3]) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    // Calculate lightness
    const l = (max + min) / 2;

    // Calculate saturation
    let s = 0;
    if (diff !== 0) {
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    }

    // Calculate hue
    let h = 0;
    if (diff !== 0) {
      if (max === r) {
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        h = ((b - r) / diff + 2) / 6;
      } else {
        h = ((r - g) / diff + 4) / 6;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  // Parse hex format
  const hexMatch = color.match(/^#([a-fA-F0-9]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    // Calculate lightness
    const l = (max + min) / 2;

    // Calculate saturation
    let s = 0;
    if (diff !== 0) {
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    }

    // Calculate hue
    let h = 0;
    if (diff !== 0) {
      if (max === r) {
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        h = ((b - r) / diff + 2) / 6;
      } else {
        h = ((r - g) / diff + 4) / 6;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  // Default fallback
  return { h: 0, s: 50, l: 50 };
}
