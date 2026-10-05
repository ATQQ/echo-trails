import { fileURLToPath, URL } from 'node:url'
import { networkInterfaces } from 'os';
import { execSync } from 'node:child_process';

import { defineConfig, type PluginOption } from 'vite'
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

// 构建期注入 git 短 hash，供版本页展示（与 smart-expense-app 的 __APP_COMMIT__ 对齐）。
function getGitCommit() {
  const injected = process.env.VITE_APP_COMMIT?.trim();
  if (injected) return injected;
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue() as unknown as PluginOption,
    // vueDevTools(),
    AutoImport({
      resolvers: [VantResolver()],
    }) as unknown as PluginOption,
    Components({
      resolvers: [VantResolver()],
    }) as unknown as PluginOption,
  ],
  // build:{
  //   sourcemap: true
  // },
  define:{
    'process.env.TAURI': isTauriDev,
    __APP_COMMIT__: JSON.stringify(getGitCommit()),
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
