import { defineConfig } from 'vite';

export default defineConfig({
  base: '/boxripper/',
  build: {
    outDir: '../../boxripper',
    emptyOutDir: true,
    target: 'esnext',
  },
});
