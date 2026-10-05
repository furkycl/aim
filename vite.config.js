import { defineConfig } from 'vite';

// Served from https://furkycl.github.io/aim/ — the base must match the repo name.
export default defineConfig({
  base: '/aim/',
  build: {
    target: 'es2020',
    sourcemap: false,
    minify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
