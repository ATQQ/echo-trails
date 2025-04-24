import ky from 'ky'
import { load } from '@tauri-apps/plugin-store';
import { defaultOrigin, refreshApi } from './request';

export interface StorageConfig {
  mode: string
  serverUrl: string
  token: string
}

export async function validConfig(cfg: StorageConfig) {
  const { mode, serverUrl, token } = cfg
  if (!serverUrl) {
    throw new Error('无效服务地址')
  }

  if (mode === 'server') {
    // 校验服务端地址是否能访问
    await ky.post(`${serverUrl}/api/config/check`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).then(v => v.json())
  }

}

export async function saveConfig(cfg: StorageConfig) {
  const store = await load('config.json', { autoSave: false });
  store.set('cfg', cfg)
  await store.save();
}

export async function refreshService(cfg: StorageConfig) {
  const { mode, serverUrl, token } = cfg
  if (mode === 'server') {
    refreshApi(`${serverUrl}/api`)
    // 更新token
    localStorage.setItem('token', token)
  }
}

export async function getConfig() {
  const store = await load('config.json', { autoSave: false });
  let { mode = 'server', serverUrl, token } = (await store.get<StorageConfig>('cfg')) || {}
  mode = mode || 'server'
  serverUrl = serverUrl || defaultOrigin || ''
  token = token || localStorage.getItem('token') || ''
  return { mode, serverUrl, token }
}
