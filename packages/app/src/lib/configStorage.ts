import ky from 'ky'
import { load } from '@tauri-apps/plugin-store';
import { defaultOrigin, refreshApi } from './request';
import { isTauri, OFFLINE_USERNAME } from '@/constants';
import { setMode } from './serviceRouter';
import { resetBitifulConfigCache } from '@/service/local/fileUrl';

export interface StorageConfig {
  mode: 'server' | 'offline'
  serverUrl: string
  token: string
}

export async function validConfig(cfg: StorageConfig) {
  const { mode, serverUrl, token } = cfg

  if (mode === 'offline') {
    return { username: OFFLINE_USERNAME, operator: OFFLINE_USERNAME, isAdmin: false }
  }

  if (!serverUrl) {
    throw new Error('无效服务地址')
  }

  if (mode === 'server') {
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

  if (mode === 'offline') {
    // 进入本地模式：清理远端残留 token，避免旧凭证污染本地模式
    localStorage.removeItem('token')
    setMode('offline')
    return
  }

  if (mode === 'server') {
    refreshApi(`${serverUrl}/api`)
    // 有 token 则同步到 localStorage；空 token 则移除，避免空字符串被 getConfig fallback 拾取
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
    setMode('server')
  }
}

/**
 * 清理用户会话数据（切换模式/地址时调用）。
 *
 * 只清理与登录态直接相关的会话数据，保留可复用的缓存：
 * - 清理：token、userInfo（旧 server 凭证失效，需重新登录）
 * - 重置：Bitiful 配置模块级缓存（内存变量，会自动重新读取）
 * - 保留：image_cache/ 图片缓存文件（来回切换可复用，避免重复下载）
 * - 保留：image_memory_cache_v1 图片映射（不同 URL hash 不同，不会读到错误图片）
 * - 保留：footer_menus（用户自定义菜单项）
 * - 保留：TTL 缓存（有过期机制，默认 15 分钟自动失效；且 key 含 familyId 等参数，切换后 key 不匹配）
 * - 保留：kv_cache 表整体（不调用 db_clear_all_cache，避免误删用户数据）
 * - 保留：bitiful-config（S3 凭证跨模式共用）、isNativeUploadTokenEnabled（用户偏好）
 */
export async function clearUserData() {
  // 1. 清理 localStorage 中的登录会话数据
  localStorage.removeItem('token')
  localStorage.removeItem('userInfo')

  // 2. 重置 Bitiful 配置模块级缓存（仅内存变量，下次访问重新读取）
  resetBitifulConfigCache()
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
  return { mode: mode as StorageConfig['mode'], serverUrl, token }
}
