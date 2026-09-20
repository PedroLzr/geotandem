import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: { outDir: '../dist/public', emptyOutDir: true },
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3039', ws: true },
      '/health': 'http://localhost:3039',
    },
  },
});
