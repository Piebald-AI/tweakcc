import { defineConfig } from 'vite';

import react from '@vitejs/plugin-react-oxc';
import nodeExternals from 'rollup-plugin-node-externals';

export default defineConfig(({ mode }) => ({
  appType: 'custom',
  build: {
    assetsDir: '',
    target: 'es2023',
    minify: mode === 'production' ? 'esbuild' : false,
    sourcemap: mode === 'development' ? 'inline' : false,
    rollupOptions: {
      input: {
        index: 'src/index.tsx',
      },
      output: {
        entryFileNames: 'index.js',
      },
    },
  },
  plugins: [nodeExternals(), react()],
}));
