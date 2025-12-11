import { Text, TextProps } from 'ink';

const Header = ({
  children,
  ...props
}: TextProps): React.JSX.Element | null => (
  <Text bold backgroundColor="#ffd500" color="#000" {...props}>
    {' '}
    {children}{' '}
  </Text>
);

export default Header;
