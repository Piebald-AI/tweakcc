import React from 'react';

import { Transform, Text } from 'ink';
import terminalLink from 'terminal-link';

interface LinkProps {
  url: string;
  fallback?: boolean;
  children: React.ReactNode;
}

const Link: React.FC<LinkProps> = ({ children, url, fallback = true }) => (
  <Transform transform={text => terminalLink(text, url, { fallback })}>
    <Text>{children}</Text>
  </Transform>
);

export default Link;
