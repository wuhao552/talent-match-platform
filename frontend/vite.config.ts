import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import postcssPresetEnv from 'postcss-preset-env'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3100',
    },
  },
  css: {
    postcss: {
      plugins: [
        postcssPresetEnv({
          overrideBrowserslist: ['Chrome 90'],
          preserve: false,
          enableClientSidePolyfills: false,
        }),
      ],
    },
    lightningcss: {
      targets: {
        chrome: 90 << 16,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // D3 相关库单独分块
            if (
              id.includes('d3-selection') ||
              id.includes('d3-force') ||
              id.includes('d3-zoom') ||
              id.includes('d3-drag') ||
              id.includes('d3-transition') ||
              id.includes('d3-interpolate')
            ) {
              return 'd3-vendor'
            }
            // React 生态单独分块
            if (
              id.includes('react-dom') ||
              id.includes('react-router')
            ) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  },
})
