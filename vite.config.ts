import { defineConfig } from 'vite';

export default defineConfig({
  root: 'ui',
  publicDir: 'public',
  build: { outDir: '../dist/ui', emptyOutDir: true },
});
