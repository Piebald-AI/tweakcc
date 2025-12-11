import React from 'react';
import { Box, Text, TextProps, useInput } from 'ink';

export interface SelectItem {
  name: string;
  desc?: string;
  styles?: TextProps;
  selectedStyles?: TextProps;
}

interface SelectInputProps {
  items: SelectItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onSubmit: (item: string) => void;
}

export function SelectInput({
  items,
  selectedIndex,
  onSelect,
  onSubmit,
}: SelectInputProps) {
  useInput((input, key) => {
    if (key.upArrow) {
      onSelect(selectedIndex > 0 ? selectedIndex - 1 : items.length - 1);
    } else if (key.downArrow) {
      onSelect(selectedIndex < items.length - 1 ? selectedIndex + 1 : 0);
    } else if (key.return) {
      onSubmit(items[selectedIndex].name);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Box key={index}>
          <Text>
            <Text
              bold={index === selectedIndex}
              color={index === selectedIndex ? 'cyan' : undefined}
              {...(index === selectedIndex
                ? (item.selectedStyles ?? {})
                : (item.styles ?? {}))}
            >
              {index === selectedIndex ? '❯ ' : '  '}
              {item.name}
            </Text>

            {item.desc && index === selectedIndex && (
              <Text dimColor bold={false}>
                {' \x1b[0;2m'}- {item.desc}
              </Text>
            )}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
