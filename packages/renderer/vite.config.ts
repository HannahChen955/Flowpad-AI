import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: '.',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        floating: path.resolve(__dirname, 'floating.html'),
      },
    },
  },
  server: {
    port: 3001,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});