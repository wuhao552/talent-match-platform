import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import postcssPresetEnv from 'postcss-preset-env'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
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
}))
