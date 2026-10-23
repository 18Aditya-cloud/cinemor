import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    // If your backend serves the built files from a sub-path (e.g. /static/),
    // set VITE_BASE=/static/ in .env.production. Default is the site root.
    base: env.VITE_BASE || '/',

    server: {
      port: 5173,
      // During development, every request that starts with /api is forwarded to
      // your backend. This avoids CORS problems while you build.
      proxy: {
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
