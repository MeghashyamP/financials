import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Default build (used for GitHub Pages): normal multi-file output. The PDF / OCR libraries are
// code-split and only downloaded when an import dialog needs them.
// `npm run build:single` (SINGLE_FILE=1) still produces one self-contained index.html for
// opening straight from disk.
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
});
