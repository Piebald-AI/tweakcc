import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globbySync } from 'globby';

// Mock globby module
vi.mock('globby', () => ({
  globbySync: vi.fn(),
}));

const createEacces = () => {
  const error: NodeJS.ErrnoException = new Error('EACCES: permission denied');
  error.code = 'EACCES';
  return error;
};

const createEperm = () => {
  const error: NodeJS.ErrnoException = new Error(
    'EPERM: operation not permitted'
  );
  error.code = 'EPERM';
  return error;
};

describe('getClijsSearchPathsWithInfo - glob error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.skipIf(process.platform === 'win32')(
    'should handle EACCES errors from globbySync gracefully',
    async () => {
      // Mock globbySync to throw EACCES for /usr/local patterns
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
          if (
            typeof patternStr === 'string' &&
            patternStr.includes('/usr/local/n/versions/node')
          ) {
            throw createEacces();
          }
          return [];
        }
      );

      // Import after mocks are set up to ensure module is loaded with mocks
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Find the /usr/local/n/versions/node pattern in search paths
      const problematicPath = CLIJS_SEARCH_PATH_INFO.find(
        info =>
          info.isGlob && info.pattern.includes('/usr/local/n/versions/node')
      );

      // Should exist and have empty expandedPaths (not crash)
      expect(problematicPath).toBeDefined();
      expect(problematicPath?.expandedPaths).toEqual([]);
    }
  );

  it.skipIf(process.platform === 'win32')(
    'should handle EPERM errors from globbySync gracefully',
    async () => {
      // Mock globbySync to throw EPERM for certain patterns
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
          if (
            typeof patternStr === 'string' &&
            patternStr.includes('/usr/local/nvm/versions')
          ) {
            throw createEperm();
          }
          return [];
        }
      );

      // Import after mocks are set up
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Find the /usr/local/nvm pattern in search paths
      const problematicPath = CLIJS_SEARCH_PATH_INFO.find(
        info => info.isGlob && info.pattern.includes('/usr/local/nvm/versions')
      );

      // Should exist and have empty expandedPaths (not crash)
      expect(problematicPath).toBeDefined();
      expect(problematicPath?.expandedPaths).toEqual([]);
    }
  );

  it.skipIf(process.platform === 'win32')(
    'should handle other errors from globbySync gracefully',
    async () => {
      // Mock globbySync to throw a different error
      const otherError = new Error('Some other error');
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
          if (
            typeof patternStr === 'string' &&
            patternStr.includes('/.nvm/versions')
          ) {
            throw otherError;
          }
          return [];
        }
      );

      // Import after mocks are set up
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Find the ~/.nvm pattern in search paths
      const problematicPath = CLIJS_SEARCH_PATH_INFO.find(
        info => info.isGlob && info.pattern.includes('/.nvm/versions')
      );

      // Should exist and have empty expandedPaths (not crash)
      expect(problematicPath).toBeDefined();
      expect(problematicPath?.expandedPaths).toEqual([]);
    }
  );

  it.skipIf(process.platform === 'win32')(
    'should continue processing other paths after encountering EACCES',
    async () => {
      let callCount = 0;
      const successPattern = '/.config/test/pattern';

      // Mock globbySync to fail on first call, succeed on second
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          callCount++;
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;

          // First glob pattern fails with EACCES
          if (callCount === 1) {
            throw createEacces();
          }

          // Return some paths for other patterns
          if (
            typeof patternStr === 'string' &&
            patternStr.includes(successPattern)
          ) {
            return ['/some/path/1', '/some/path/2'];
          }

          return [];
        }
      );

      // Import after mocks are set up
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Should have multiple search paths, including ones after the failed one
      expect(CLIJS_SEARCH_PATH_INFO.length).toBeGreaterThan(10);

      // Verify at least some paths have expanded results (not all failed)
      const pathsWithResults = CLIJS_SEARCH_PATH_INFO.filter(
        info => info.expandedPaths.length > 0
      );
      expect(pathsWithResults.length).toBeGreaterThan(0);
    }
  );

  // Windows-specific permission error tests
  it.skipIf(process.platform !== 'win32')(
    'should handle EACCES errors from globbySync gracefully (Windows)',
    async () => {
      // Mock globbySync to throw EACCES for Windows nvm patterns
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
          if (
            typeof patternStr === 'string' &&
            patternStr.includes('/AppData/Roaming/nvm/')
          ) {
            throw createEacces();
          }
          return [];
        }
      );

      // Import after mocks are set up to ensure module is loaded with mocks
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Find the AppData/Roaming/nvm pattern in search paths (converted to backslashes)
      const problematicPath = CLIJS_SEARCH_PATH_INFO.find(
        info =>
          info.isGlob && info.pattern.includes('\\AppData\\Roaming\\nvm\\')
      );

      // Should exist and have empty expandedPaths (not crash)
      expect(problematicPath).toBeDefined();
      expect(problematicPath?.expandedPaths).toEqual([]);
    }
  );

  it.skipIf(process.platform !== 'win32')(
    'should handle EPERM errors from globbySync gracefully (Windows)',
    async () => {
      // Mock globbySync to throw EPERM for Windows pnpm patterns
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
          if (
            typeof patternStr === 'string' &&
            patternStr.includes('/AppData/Local/pnpm/global/')
          ) {
            throw createEperm();
          }
          return [];
        }
      );

      // Import after mocks are set up
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Find the pnpm pattern in search paths (converted to backslashes)
      const problematicPath = CLIJS_SEARCH_PATH_INFO.find(
        info =>
          info.isGlob &&
          info.pattern.includes('\\AppData\\Local\\pnpm\\global\\')
      );

      // Should exist and have empty expandedPaths (not crash)
      expect(problematicPath).toBeDefined();
      expect(problematicPath?.expandedPaths).toEqual([]);
    }
  );

  it.skipIf(process.platform !== 'win32')(
    'should handle other errors from globbySync gracefully (Windows)',
    async () => {
      // Mock globbySync to throw a different error
      const otherError = new Error('Some other error');
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
          if (
            typeof patternStr === 'string' &&
            patternStr.includes('/AppData/Local/fnm_multishells/')
          ) {
            throw otherError;
          }
          return [];
        }
      );

      // Import after mocks are set up
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Find the fnm pattern in search paths (converted to backslashes)
      const problematicPath = CLIJS_SEARCH_PATH_INFO.find(
        info =>
          info.isGlob &&
          info.pattern.includes('\\AppData\\Local\\fnm_multishells\\')
      );

      // Should exist and have empty expandedPaths (not crash)
      expect(problematicPath).toBeDefined();
      expect(problematicPath?.expandedPaths).toEqual([]);
    }
  );

  it.skipIf(process.platform !== 'win32')(
    'should continue processing other paths after encountering EACCES (Windows)',
    async () => {
      let callCount = 0;

      // Mock globbySync to fail on first call, succeed on subsequent
      vi.mocked(globbySync).mockImplementation(
        (pattern: string | readonly string[]) => {
          callCount++;
          const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;

          // First glob pattern fails with EACCES
          if (callCount === 1) {
            throw createEacces();
          }

          // Return some paths for AppData patterns
          if (
            typeof patternStr === 'string' &&
            patternStr.includes('/AppData/')
          ) {
            return [
              'C:/Users/test/AppData/path/1',
              'C:/Users/test/AppData/path/2',
            ];
          }

          return [];
        }
      );

      // Import after mocks are set up
      const { CLIJS_SEARCH_PATH_INFO } = await import(
        '../installationPaths.js'
      );

      // Should have multiple search paths, including ones after the failed one
      expect(CLIJS_SEARCH_PATH_INFO.length).toBeGreaterThan(10);

      // Verify at least some paths have expanded results (not all failed)
      const pathsWithResults = CLIJS_SEARCH_PATH_INFO.filter(
        info => info.expandedPaths.length > 0
      );
      expect(pathsWithResults.length).toBeGreaterThan(0);
    }
  );

  it('should work normally when globbySync succeeds', async () => {
    // Mock globbySync to return successful results
    vi.mocked(globbySync).mockImplementation(() => {
      return ['/mock/path/1', '/mock/path/2'];
    });

    // Import after mocks are set up
    const { CLIJS_SEARCH_PATH_INFO } = await import('../installationPaths.js');

    // Find a glob pattern (should have expanded paths)
    const globPattern = CLIJS_SEARCH_PATH_INFO.find(info => info.isGlob);

    expect(globPattern).toBeDefined();
    // On Windows, paths are converted to backslashes
    const expectedPaths =
      process.platform === 'win32'
        ? ['\\mock\\path\\1', '\\mock\\path\\2']
        : ['/mock/path/1', '/mock/path/2'];
    expect(globPattern?.expandedPaths).toEqual(expectedPaths);
  });
});
