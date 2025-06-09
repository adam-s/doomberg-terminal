// vite.config.mts
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
      vs: path.resolve(__dirname, '../vs/vs'),
    },
  },
  plugins: [tsconfigPaths()],
});
