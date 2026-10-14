import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is mandatory for camera access on a phone (except on localhost).
// basicSsl generates a self-signed certificate for the dev server.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
