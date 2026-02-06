# Contributing

Thank you for your interest in contributing to tweakcc! This document provides guidelines and workflows for contributing to the project.

## Development Setup

### Prerequisites

- **Node.js**: 22.x (20.0.0 or higher required)
- **pnpm**: 10.13.1 or higher

```bash
pnpm install
```

### Running in Development

```bash
# Build for development (no minification)
pnpm build:dev

# Watch mode for iterative development
pnpm watch

# Run the CLI locally after building
pnpm start
```

## Code Style

This project uses ESLint and Prettier for code formatting and linting.

### Prettier Configuration

- **Quotes**: Single quotes
- **Print Width**: 80 characters
- **Semicolons**: Yes
- **Indentation**: 2 spaces (no tabs)
- **Arrow Function Parentheses**: Avoid when possible
- **Trailing Commas**: ES5

### Running Linting and Formatting

```bash
# Lint and type-check
pnpm lint

# Format code
pnpm format

# Check formatting without modifying files (used in CI)
pnpm prettier --check src
```

**Pre-commit hooks** are configured via Husky and lint-staged to automatically format staged files before commit.

### TypeScript Best Practices

- Use strict type checking (enabled in `tsconfig.json`)
- Avoid `any` types - prefer `unknown` with type guards
- Use `@/` alias for imports within the `src/` directory
- Define interfaces for all configuration objects (see `src/types.ts`)

### Naming Conventions

- **Components**: PascalCase (e.g., `ThinkingVerbsView`)
- **Functions**: camelCase (e.g., `findClaudeInstallation`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_CONFIG_PATH`)
- **Files**: camelCase (e.g., `systemPromptSync.ts`) or PascalCase for React components (e.g., `MainView.tsx`)

## Making Changes

### Branching Strategy

1. Create a new branch from `main` for your feature or fix:

   ```bash
   git checkout -b your-branch-name
   ```

2. **Branch naming conventions**:
   - `feature/your-feature-name`
   - `fix/your-fix-description`
   - `docs/your-documentation-update`

### Development Workflow

1. Make your changes following the code style guidelines
2. Run linting and tests locally:
   ```bash
   pnpm lint
   pnpm run test
   ```
3. Build your changes:
   ```bash
   pnpm build:dev
   ```
4. Test your changes by running the CLI locally:
   ```bash
   pnpm start
   ```

### Testing

Run tests before submitting:

```bash
# Run all tests once
pnpm run test

# Run tests in watch mode for development
pnpm run test:dev
```

Test files are located in:

- `src/tests/*.test.ts` - Unit tests for core functionality
- `src/patches/*.test.ts` - Tests for specific patches

**Testing patterns**:

- Use Vitest globals (`describe`, `it`, `expect`, `beforeEach`, `afterEach`)
- Mock dependencies using `vi.mock()`
- Test edge cases and error conditions

### Commit Messages

Follow these conventions for clear, meaningful commit messages:

```text
<type> <subject> (#<issue-number>)

<body>
```

**Types**:

- `Add` - New features
- `Fix` - Bug fixes
- `Prompts for` - Update for new Claude version
- `Sort` - Sorting or reorganization changes
- `Update` - Updates to existing features
- `Refactor` - Code refactoring (no functional changes)

**Examples**:

- `Add support for dangerously bypassing permissions`
- `Fix remaining patching errors`
- `Prompts for 2.1.34`
- `Add auto-accept plan mode patch`

## Submitting Pull Requests

### Before Submitting

1. Ensure all tests pass: `pnpm run test`
2. Ensure linting passes: `pnpm lint`
3. Ensure formatting is correct: `pnpm format`
4. Rebuild the project: `pnpm build:dev`
5. Test your changes locally with `pnpm start`

### PR Description Template

```markdown
## Summary

<Brief description of what this PR changes>

## Changes

- Change 1
- Change 2

## Testing

- [ ] Tests added/updated
- [ ] Manual testing completed
- [ ] All existing tests pass

## Related Issues

Closes #(issue-number) or Relates to #(issue-number)
```

### Review Process

1. PRs will be reviewed by maintainers
2. Address review feedback promptly
3. Keep the PR focused on a single change if possible
4. Ensure commit history is clean (squash/rebase as needed)

### What Happens After Merge

- Your changes will be included in the next release
- You'll be credited in the changelog
- Your contribution is greatly appreciated! 🎉

## Types of Contributions Welcome

- **Bug fixes** - Help squash issues
- **New features** - Propose new patches or customizations
- **Documentation improvements** - Clarify usage or add examples
- **Test coverage** - Add tests for existing functionality
- **Performance improvements** - Optimize CLI startup or execution
- **Prompt updates** - Contribute prompts for new Claude versions

## Reporting Issues

When reporting bugs, please include:

- **Version**: `tweakcc --version`
- **Operating System**: macOS / Linux / WSL
- **Node.js version**: `node --version`
- **Steps to reproduce**: Clear reproduction steps
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Logs**: Relevant error messages or logs

## Getting Help

- Check existing [Issues](https://github.com/Piebald-AI/tweakcc/issues) for similar problems
- Read the [README](https://github.com/Piebald-AI/tweakcc#readme) for usage documentation
- Ask questions in a new issue with the `question` label

Thank you for contributing! 🙌
