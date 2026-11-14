import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    // tools/ is its own package (npm test there).
    exclude: [...configDefaults.exclude, 'tools/**'],
    // Keep tests off the developer's real ~/.tweakcc (config.json, backups).
    env: {
      TWEAKCC_CONFIG_DIR: '/tmp/tweakcc-vitest-config',
    },
  },
});
