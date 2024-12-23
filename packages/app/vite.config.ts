import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'

const isTauriDev = process.env.TAURI
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // vueDevTools(),
    Components({
      resolvers: [VantResolver()],
    }),
  ],
  define:{
    'process.env.TAURI': isTauriDev,
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  ... isTauriDev && {
    clearScreen: false,
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern'
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server:{
    ...isTauriDev && {
      port: 1420,
      strictPort: true,
    },
    proxy:{
      '/api': 'http://localhost:6692'
    }
  }
})
