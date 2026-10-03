import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    env: {
      TWEAKCC_CONFIG_DIR: '/tmp/tweakcc-vitest-config',
    },
  },
});
