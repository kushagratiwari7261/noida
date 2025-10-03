import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // ensures routes resolve correctly on Vercel
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate PDF generation library
          pdf: ['@react-pdf/renderer'],
          // Separate other large libraries
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Supabase and other utilities
          supabase: ['@supabase/supabase-js'],
          // Date utilities
          utils: ['date-fns'],
          // Other chunks for remaining dependencies
        }
      }
    }
  }
})
