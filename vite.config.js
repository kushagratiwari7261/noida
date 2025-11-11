// Diagnostic logs for vite.config.js
console.log('vite.config.js loaded at:', new Date().toISOString());

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/', // ✅ ensures proper client-side routing resolution

  server: {
    // ✅ keep proxy for local dev
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },

  build: {
    outDir: 'dist',

    rollupOptions: {
      output: {
        manualChunks: {
          // ✅ Keep functional separation intact
          pdf: ['@react-pdf/renderer'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          utils: ['date-fns']
        }
      }
    },

    // ✅ Ensure stable builds and prevent reloads due to missing assets
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true
  },

  // ✅ Added this section to fix the “reload on tab switch” issue
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
      'date-fns',
      '@react-pdf/renderer'
    ]
  },

  // ✅ Added define block to ensure React in dev doesn’t reset state
  define: {
    'process.env': {},
    'import.meta.env.VITE_APP_MODE': JSON.stringify(process.env.NODE_ENV || 'production')
  }
});
