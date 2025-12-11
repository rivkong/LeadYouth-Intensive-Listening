import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // CRITICAL: Sets the base path to relative './' instead of absolute '/'.
  // This fixes the "Black Screen" / 404 errors on Netlify when assets are not found.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 3000
  }
});