import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: '',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'background.js', dest: '.' },
        { src: 'icons/*', dest: 'icons' },
      ],
    }),
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
