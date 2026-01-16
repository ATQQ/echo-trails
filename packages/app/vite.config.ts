import { fileURLToPath, URL } from 'node:url'
import { networkInterfaces } from 'os';

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';

function getLocalIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    // @ts-ignore
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const isTauriDev = process.env.TAURI
const host = getLocalIp();
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // vueDevTools(),
    AutoImport({
      resolvers: [VantResolver()],
    }),
    Components({
      resolvers: [VantResolver()],
    }),
  ],
  // build:{
  //   sourcemap: true
  // },
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
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server:{
    ...isTauriDev && {
      port: 1420,
      host,
      strictPort: true,
    },
    hmr: {
      host,
      port: 1421,
    },
    proxy:{
      '/api': 'http://localhost:6692'
    }
  }
})
