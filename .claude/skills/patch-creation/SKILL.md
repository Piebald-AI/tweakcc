---
name: patch-creation
description: Create and register new patches for tweakcc. Use when adding new customizations to Claude Code.
---

# Patch Creation & Registration

## Overview

Patches are code modifications applied to Claude Code's `cli.js` (or native binary). Each patch finds specific patterns in the minified code and replaces/injects new behavior.

## Creating a New Patch

### 1. Create the patch file

Create `src/patches/myPatch.ts`:

````typescript
// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Description of what this patch does.
 *
 * CC X.Y.Z:
 * ```diff
 *  // Show before/after of the code change
 * -oldCode
 * +newCode
 * ```
 */
export const writeMyPatch = (
  file: string,
  configValue: string // Add parameters as needed
): string | null => {
  // Pattern to find in minified code
  // IMPORTANT: Use [$\w]+ for identifiers (not \w+) because $ is valid in JS identifiers
  // IMPORTANT: Start patterns with a boundary char (,;}{) for HIGH performance (e.g. 1.5s -> 30ms)
  const pattern = /,somePattern([$\w]+)/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: myPatch: failed to find pattern');
    return null;
  }

  const replacement = `,newCode${match[1]}`;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};
````

### 2. Add config type (if patch is configurable)

Edit `src/types.ts` - add to `MiscConfig` or create a new interface:

```typescript
export interface MiscConfig {
  // ... existing fields ...
  myNewSetting: string | null; // null = disabled
}
```

### 3. Add default value

Edit `src/defaultSettings.ts`:

```typescript
misc: {
  // ... existing fields ...
  myNewSetting: null,  // or a sensible default
},
```

### 4. Register in index.ts

Edit `src/patches/index.ts`:

**4a. Add import:**

```typescript
import { writeMyPatch } from './myPatch';
```

**4b. Add patch definition (in `PATCH_DEFINITIONS` array):**

```typescript
{
  id: 'my-patch',
  name: 'My patch',
  group: PatchGroup.FEATURES,  // or ALWAYS_APPLIED, MISC_CONFIGURABLE
  description: 'What this patch does for the user',
},
```

**4c. Add patch implementation (in `patchImplementations` object):**

```typescript
'my-patch': {
  fn: c => writeMyPatch(c, config.settings.misc!.myNewSetting!),
  condition: !!config.settings.misc?.myNewSetting,
},
```

### 5. Add UI (optional)

Edit `src/ui/components/MiscView.tsx` to add a toggle or input for the setting.

## Key Files

| File                             | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `src/patches/*.ts`               | Individual patch implementations                   |
| `src/patches/index.ts`           | Patch registry, definitions, and application logic |
| `src/types.ts`                   | Config type definitions (`MiscConfig`, etc.)       |
| `src/defaultSettings.ts`         | Default values for all settings                    |
| `src/ui/components/MiscView.tsx` | UI for misc settings                               |

## Registration Checklist

When adding a new patch, update these locations:

- [ ] `src/patches/myPatch.ts` - Create the patch file with exported function
- [ ] `src/types.ts` - Add config type (if configurable)
- [ ] `src/defaultSettings.ts` - Add default value (if configurable)
- [ ] `src/patches/index.ts`:
  - [ ] Import the patch function
  - [ ] Add to `PATCH_DEFINITIONS` array (id, name, group, description)
  - [ ] Add to `patchImplementations` object (fn, condition)
- [ ] `src/ui/components/MiscView.tsx` - Add UI controls (optional)

## Patch Groups

- `PatchGroup.ALWAYS_APPLIED` - Core patches that are always applied
- `PatchGroup.MISC_CONFIGURABLE` - User-configurable misc settings
- `PatchGroup.FEATURES` - Feature patches that can be enabled/disabled

## Pattern Writing Tips

1. **Use `[$\w]+` for identifiers** - Not `\w+`, because `$` is valid in JS identifiers and common in minified code

2. **Start patterns with boundary characters** - Use `,`, `;`, `{`, `}` at the start to dramatically speed up matching (can reduce 1.5s to 30ms)

3. **Don't use `\b` for word boundaries** - It doesn't treat `$` as a word character, so `\b[$\w]+` won't match `,$=`

4. **Extract function bodies carefully** - Count braces to find matching `}` when you need the full function

5. **Use `showDiff()` for debugging** - Always call it to log what the patch is changing

6. **Return `null` on failure** - Let the patch system know the patch couldn't be applied

7. **Handle multiple CC versions** - Code patterns may change between versions; try multiple patterns if needed

## Example: Simple Toggle Patch

```typescript
// Bypass a feature flag check
const pattern = /function [$\w]+\(\)\{return [$\w]+\("my_feature_flag"/;
const match = file.match(pattern);

if (!match || match.index === undefined) {
  console.error('patch: myPatch: failed to find feature flag');
  return null;
}

const insertIndex = match.index + match[0].indexOf('{') + 1;
const insertion = 'return true;';

const newFile =
  file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

showDiff(file, newFile, insertion, insertIndex, insertIndex);
return newFile;
```

## Example: Replace a Value

```typescript
// Replace a hardcoded value
const pattern = /(someConfig=)\d+(;)/;
const match = file.match(pattern);

if (!match || match.index === undefined) {
  console.error('patch: myPatch: failed to find config value');
  return null;
}

const replacement = match[1] + newValue + match[2];
const startIndex = match.index;
const endIndex = startIndex + match[0].length;

const newFile = file.slice(0, startIndex) + replacement + file.slice(endIndex);

showDiff(file, newFile, replacement, startIndex, endIndex);
return newFile;
```

## Testing

1. Run `npm run build` to compile
2. Run `npx tweakcc --apply` to apply patches
3. Check console output for patch success/failure
4. Run Claude Code to verify behavior
