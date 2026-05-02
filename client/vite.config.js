import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Captured once per `vite build` invocation so the value baked into the JS
// bundle exactly matches what we write to dist/build-id.txt (which the server
// reads at startup). Used to detect stale-client-vs-fresh-server mismatches.
const BUILD_ID = process.env.BITEWISE_BUILD_ID || String(Date.now());

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'bitewise-build-id',
      writeBundle(outputOptions) {
        const dir = outputOptions.dir || path.join(__dirname, 'dist');
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'build-id.txt'), BUILD_ID);
        } catch (e) {
          console.error('Failed to write build-id.txt:', e.message);
        }
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
