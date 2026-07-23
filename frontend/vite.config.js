import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Allow Ingress and cross-container hostnames through Vite's security check
    allowedHosts: true,
    // Or set to true to allow any host header:
    // allowedHosts: true,
  },
});