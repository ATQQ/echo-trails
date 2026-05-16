import { api } from './request'
import { load } from '@tauri-apps/plugin-store'
import { isTauri } from '@/constants'
import { isLocalMode } from './serviceRouter'

export interface BitifulConfig {
  accessKey: string
  secretKey: string
  cdnToken: string
  bucket: string
  domain: string
  coverStyle: string
  previewStyle: string
  albumStyle: string
  region: string
  endpoint: string
}

export const defaultBitifulConfig: BitifulConfig = {
  accessKey: '',
  secretKey: '',
  cdnToken: '',
  bucket: '',
  domain: '',
  coverStyle: '',
  previewStyle: '',
  albumStyle: '',
  region: 'cn-east-1',
  endpoint: 'https://s3.bitiful.net',
}

export function mergeBitifulConfig(...configs: Array<Partial<BitifulConfig> | null | undefined>): BitifulConfig {
  const merged = { ...defaultBitifulConfig }
  for (const config of configs) {
    if (!config) continue
    for (const key of Object.keys(defaultBitifulConfig) as Array<keyof BitifulConfig>) {
      const value = config[key]
      if (value !== undefined && value !== null && value !== '') {
        merged[key] = value
      }
    }
  }
  return merged
}

// 获取 bitiful 配置
export async function getBitifulConfig(): Promise<BitifulConfig> {
  try {
    const response = await api.get('config/bitiful').json<ServerResponse<BitifulConfig>>()
    return response.data
  } catch (error) {
    throw new Error('获取 bitiful 配置失败')
  }
}

// 更新 bitiful 配置
export async function updateBitifulConfig(config: Partial<BitifulConfig>): Promise<BitifulConfig> {
  try {
    const response = await api.put('config/bitiful', { json: config }).json<ServerResponse<BitifulConfig>>()
    return response.data
  } catch (error: any) {
    throw new Error(error.message || '更新 bitiful 配置失败')
  }
}

// 本地存储 bitiful 配置
export async function saveBitifulConfigLocal(config: BitifulConfig) {
  const localConfig = mergeBitifulConfig(await getBitifulConfigLocal(), config)
  if (isTauri) {
    const store = await load('bitiful-config.json', { autoSave: false, defaults: {} })
    store.set('config', localConfig)
    await store.save()
  } else {
    localStorage.setItem('bitiful-config', JSON.stringify(localConfig))
  }
}

// 获取本地存储的 bitiful 配置
export async function getBitifulConfigLocal(): Promise<BitifulConfig | null> {
  try {
    if (isTauri) {
      const store = await load('bitiful-config.json', { autoSave: false, defaults: {} })
      return await store.get<BitifulConfig>('config') || null
    } else {
      const saved = localStorage.getItem('bitiful-config')
      return saved ? JSON.parse(saved) : null
    }
  } catch (error) {
    return null
  }
}

// 更新配置（本地存储 + 远端更新）
export async function updateBitifulConfigComplete(config: Partial<BitifulConfig>): Promise<BitifulConfig> {
  const localConfig = await getBitifulConfigLocal()
  if (isLocalMode()) {
    const mergedConfig = mergeBitifulConfig(localConfig, config)
    await saveBitifulConfigLocal(mergedConfig)
    return mergedConfig
  }

  // 先更新远端
  const updatedConfig = await updateBitifulConfig(config)

  // 再存储到本地。远端为了安全可能不回显密钥，空字段不能覆盖本地已有值。
  const mergedConfig = mergeBitifulConfig(localConfig, config, updatedConfig)
  await saveBitifulConfigLocal(mergedConfig)

  return mergedConfig
}
