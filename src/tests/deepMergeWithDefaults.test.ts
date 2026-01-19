import { describe, it, expect } from 'vitest';
import { deepMergeWithDefaults } from '../utils';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import { Settings } from '../types';

describe('deepMergeWithDefaults', () => {
  describe('basic merging', () => {
    it('should merge two simple objects', () => {
      const partial = { a: 1 };
      const defaults = { a: 0, b: 2 };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should use defaults when partial is null', () => {
      const defaults = { a: 1, b: 2 };
      const result = deepMergeWithDefaults(null, defaults);

      expect(result).toEqual(defaults);
    });

    it('should use defaults when partial is undefined', () => {
      const defaults = { a: 1, b: 2 };
      const result = deepMergeWithDefaults(undefined, defaults);

      expect(result).toEqual(defaults);
    });

    it('should return partial when defaults is not an object', () => {
      const partial = 'some value';
      const result = deepMergeWithDefaults(partial, 42);

      expect(result).toBe(partial);
    });
  });

  describe('nested object merging', () => {
    it('should recursively merge nested objects', () => {
      const partial = {
        outer: {
          inner: 'custom',
        },
      };
      const defaults = {
        outer: {
          inner: 'default',
          another: 'value',
        },
        topLevel: 'value',
      };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({
        outer: {
          inner: 'custom',
          another: 'value',
        },
        topLevel: 'value',
      });
    });

    it('should fill in missing nested properties', () => {
      const partial = {
        level1: {
          level2: {
            custom: 'value',
          },
        },
      };
      const defaults = {
        level1: {
          level2: {
            custom: 'default',
            default: 'filled',
          },
          other: 'data',
        },
      };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({
        level1: {
          level2: {
            custom: 'value',
            default: 'filled',
          },
          other: 'data',
        },
      });
    });

    it('should handle deeply nested structures', () => {
      const partial = {
        a: {
          b: {
            c: {
              d: 'custom',
            },
          },
        },
      };
      const defaults = {
        a: {
          b: {
            c: {
              d: 'default',
              e: 'also default',
            },
            f: 'default',
          },
        },
      };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({
        a: {
          b: {
            c: {
              d: 'custom',
              e: 'also default',
            },
            f: 'default',
          },
        },
      });
    });
  });

  describe('array handling', () => {
    it('should preserve arrays from partial when they exist', () => {
      const partial = { items: [1, 2, 3] };
      const defaults = { items: [4, 5, 6] };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('should use default array when partial does not have the property', () => {
      const partial = {};
      const defaults = { items: [1, 2, 3] };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('should preserve null value from partial when it is explicitly set', () => {
      const partial = { items: null };
      const defaults = { items: [1, 2, 3] };
      const result = deepMergeWithDefaults(partial, defaults);

      // When a value is explicitly null in partial, preserve it (don't use default)
      expect(result).toEqual({ items: null });
    });
  });

  describe('Settings structure merging (the actual use case)', () => {
    it('should fill in missing inputPatternHighlighters', () => {
      const partial: Partial<Settings> = {
        themes: [],
        thinkingVerbs: { format: '', verbs: [] },
        // Missing inputPatternHighlighters
      };

      const result = deepMergeWithDefaults(
        partial,
        DEFAULT_SETTINGS
      ) as Settings;

      expect(result.inputPatternHighlighters).toBeDefined();
      expect(Array.isArray(result.inputPatternHighlighters)).toBe(true);
      expect(result.inputPatternHighlighters).toEqual(
        DEFAULT_SETTINGS.inputPatternHighlighters
      );
    });

    it('should fill in missing inputPatternHighlightersTestText', () => {
      const partial: Partial<Settings> = {
        themes: [],
        thinkingVerbs: { format: '', verbs: [] },
        // Missing inputPatternHighlightersTestText
      };

      const result = deepMergeWithDefaults(
        partial,
        DEFAULT_SETTINGS
      ) as Settings;

      expect(result.inputPatternHighlightersTestText).toBeDefined();
      expect(typeof result.inputPatternHighlightersTestText).toBe('string');
    });

    it('should preserve user inputPatternHighlighters', () => {
      const userHighlighters = [
        {
          name: 'Custom',
          regex: '^test',
          regexFlags: 'g',
          format: '{MATCH}',
          styling: [],
          foregroundColor: null,
          backgroundColor: null,
          enabled: true,
        },
      ];

      const partial: Partial<Settings> = {
        themes: [],
        thinkingVerbs: { format: '', verbs: [] },
        inputPatternHighlighters: userHighlighters,
      };

      const result = deepMergeWithDefaults(
        partial,
        DEFAULT_SETTINGS
      ) as Settings;

      expect(result.inputPatternHighlighters).toEqual(userHighlighters);
    });

    it('should handle partial Settings with missing multiple keys', () => {
      const partial: Partial<Settings> = {
        themes: DEFAULT_SETTINGS.themes,
        // Missing: thinkingVerbs, thinkingStyle, userMessageDisplay, inputBox, misc,
        //          toolsets, defaultToolset, planModeToolset, subagentModels,
        //          inputPatternHighlighters, inputPatternHighlightersTestText
      };

      const result = deepMergeWithDefaults(
        partial,
        DEFAULT_SETTINGS
      ) as Settings;

      // Check all required keys are present
      expect(result.thinkingVerbs).toBeDefined();
      expect(result.thinkingStyle).toBeDefined();
      expect(result.userMessageDisplay).toBeDefined();
      expect(result.inputBox).toBeDefined();
      expect(result.misc).toBeDefined();
      expect(result.toolsets).toBeDefined();
      expect(result.subagentModels).toBeDefined();
      expect(result.inputPatternHighlighters).toBeDefined();
      expect(result.inputPatternHighlightersTestText).toBeDefined();
    });

    it('should not crash when applying patches with empty Settings', () => {
      const emptySettings = {} as Partial<Settings>;

      // This should not throw
      const result = deepMergeWithDefaults(
        emptySettings,
        DEFAULT_SETTINGS
      ) as Settings;

      // Verify all required keys exist
      expect(result.inputPatternHighlighters).toBeDefined();
      expect(Array.isArray(result.inputPatternHighlighters)).toBe(true);
    });

    it('should fill in missing properties in individual highlighter objects', () => {
      // Simulates a highlighter where user deleted the 'regex' property
      const highlighterMissingRegex = {
        name: 'Code (markdown)',
        regexFlags: 'g',
        format: '{MATCH}',
        styling: ['bold'],
        foregroundColor: 'rgb(172,71,235)',
        backgroundColor: null,
        enabled: true,
        // NOTE: regex is MISSING
      };

      const defaultHighlighter = {
        name: 'Unnamed Highlighter',
        regex: '',
        regexFlags: 'g',
        format: '{MATCH}',
        styling: [],
        foregroundColor: null,
        backgroundColor: null,
        enabled: true,
      };

      const result = deepMergeWithDefaults(
        highlighterMissingRegex,
        defaultHighlighter
      ) as typeof defaultHighlighter;

      // Should have the missing 'regex' property filled in from default
      expect(result.regex).toBeDefined();
      expect(result.regex).toBe('');

      // Should preserve user values
      expect(result.name).toBe('Code (markdown)');
      expect(result.foregroundColor).toBe('rgb(172,71,235)');
      expect(result.styling).toEqual(['bold']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const partial = {};
      const defaults = { a: 1, b: 2 };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should not mutate the original objects', () => {
      const partial = { a: 1 };
      const defaults = { a: 0, b: 2 };
      const partialCopy = JSON.parse(JSON.stringify(partial));

      deepMergeWithDefaults(partial, defaults);

      expect(partial).toEqual(partialCopy);
    });

    it('should handle mixed primitive and object values', () => {
      const partial = {
        primitive: 'custom',
        nested: {
          value: 'custom',
        },
      };
      const defaults = {
        primitive: 'default',
        nested: {
          value: 'default',
          extra: 'extra',
        },
        anotherPrimitive: 42,
      };
      const result = deepMergeWithDefaults(partial, defaults);

      expect(result).toEqual({
        primitive: 'custom',
        nested: {
          value: 'custom',
          extra: 'extra',
        },
        anotherPrimitive: 42,
      });
    });

    it('should handle null values in nested objects', () => {
      const partial = {
        nested: {
          nullable: null,
        },
      };
      const defaults = {
        nested: {
          nullable: 'default',
          other: 'value',
        },
      };
      const result = deepMergeWithDefaults(partial, defaults);

      // null from partial should be preserved
      expect(result).toEqual({
        nested: {
          nullable: null,
          other: 'value',
        },
      });
    });

    it('should not recurse into arrays within objects', () => {
      const partial = {
        config: {
          items: [{ a: 1 }],
        },
      };
      const defaults = {
        config: {
          items: [{ a: 0, b: 2 }],
        },
      };
      const result = deepMergeWithDefaults(partial, defaults) as {
        config: { items: { a: number }[] };
      };

      // Array should be preserved as-is from partial
      expect(result.config.items).toEqual([{ a: 1 }]);
    });
  });
});
