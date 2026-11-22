import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Only used by Firestore's Pipeline API (not used here); see src/lib/stubs/re2js.ts
      re2js: fileURLToPath(new URL('./src/lib/stubs/re2js.ts', import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
