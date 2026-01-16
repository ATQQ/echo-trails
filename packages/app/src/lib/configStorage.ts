import ky from 'ky'
import { load } from '@tauri-apps/plugin-store';
import { defaultOrigin, refreshApi } from './request';
import { isTauri } from '@/constants';

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
    return ky.post<ServerResponse<{
      username: string,
      operator: string
    }>>(`${serverUrl}/api/config/check`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).then(v => v.json())
  }

}

export async function saveConfig(cfg: StorageConfig) {
  if (isTauri) {
    const store = await load('config.json', { autoSave: false, defaults: {} });
    await store.set('cfg', cfg)
    await store.save();
  } else {
    localStorage.setItem('config', JSON.stringify(cfg))
  }
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
  let cfg: Partial<StorageConfig> = {}

  if (isTauri) {
    const store = await load('config.json', { autoSave: false, defaults: {
      cfg: {
        mode: 'server',
        serverUrl: defaultOrigin,
        token: ''
      }
    } });
    cfg = (await store.get<StorageConfig>('cfg')) || {}
  } else {
    try {
      const saved = localStorage.getItem('config')
      if (saved) {
        cfg = JSON.parse(saved)
      }
    } catch (e) {
      console.error('load config error', e)
    }
  }

  let { mode = 'server', serverUrl, token } = cfg
  mode = mode || 'server'
  serverUrl = serverUrl || defaultOrigin || ''
  token = token || localStorage.getItem('token') || ''
  return { mode, serverUrl, token }
}
