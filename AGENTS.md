# AGENTS.md

This document provides guidelines for agentic coding assistants working in this repository.

## Development Commands

```bash
# Build
pnpm build           # Production build (typecheck + minify)
pnpm build:dev       # Development build (no minification)
pnpm watch           # Watch mode for iterative development

# Testing
pnpm test            # Run all tests once
pnpm test:dev        # Run tests in watch mode
npx vitest run <test-file>     # Run single test file
pnpm run test -- <pattern>     # Run tests matching pattern

# Linting & Formatting
pnpm lint            # Typecheck + ESLint
pnpm format          # Format code with Prettier

# Run CLI
pnpm start           # Run built CLI
node dist/index.mjs  # Alternative run command
```

## Code Style

### Formatting

- **Prettier**: 80 char width, single quotes, 2 spaces, semicolons required
- **No comments**: Do not add comments unless explicitly requested
- **Section dividers**: Use `// ======` lines for major code sections

### Imports

```typescript
// Group imports in this order:
import fs from 'node:fs/promises'; // Node.js built-ins (use node: prefix)
import path from 'node:path';
import chalk from 'chalk'; // Third-party libraries
import ink from 'ink';
import { getConfig } from '@/config'; // Internal imports (use @/ alias)
import { PatchConfig } from '@/types';
```

### TypeScript

- **Strict mode** enabled in tsconfig.json
- **Avoid `any`**: Use `unknown` with type guards or `as unknown as Type` for assertions
- **Interfaces** for complex objects, types for simple unions
- **Custom errors**: Extend `Error` class with `name` property

```typescript
export class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomError';
  }
}
```

### Naming Conventions

- **Files**: camelCase for logic (`config.ts`), PascalCase for React components (`MainView.tsx`)
- **Functions**: camelCase (`getConfig`, `detectInstallation`)
- **Constants**: UPPER_SNAKE_CASE (`CONFIG_DIR`, `DEFAULT_CONFIG`)
- **Components**: PascalCase with descriptive names (`ThinkingVerbsView`)
- **Interfaces**: PascalCase, descriptive (`StringsPrompt`, `MarkdownPrompt`)

### Error Handling

```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  debug('Error occurred:', error);
  return null; // Graceful fallback
}
```

### React Patterns

- Use hooks: `useState`, `useEffect`, `useCallback`
- Context API for state management
- Ink components: `Box`, `Text`, `Newline`
- Explicit prop types with interfaces

### Writing Patches

- **Identifier matching**: Use `[$\\w]+` instead of `\\w+` (includes `$` for React refs)
- **Word boundaries**: Use `,` `;` `}` `{` literal characters at regex start instead of `\\b` for performance
- **Avoid `\\b`**: Performance issue in V8, use literal alternatives

### Testing

```typescript
// Use Vitest globals
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('functionName', () => {
  beforeEach(() => {
    vi.mock('some-module');
  });

  it('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

- Test files in `src/tests/*.test.ts` and `src/patches/*.test.ts`
- Mock dependencies with `vi.mock()`
- Test edge cases and error conditions

### CLI Patterns

- Use `ink` for CLI rendering
- Use `chalk` for terminal colors
- Use `commander` for CLI argument parsing
- Add shebang to index.tsx for executable support
