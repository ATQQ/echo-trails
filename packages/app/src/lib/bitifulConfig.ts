import { api } from './request'
import { load } from '@tauri-apps/plugin-store'

export interface BitifulConfig {
  accessKey: string
  secretKey: string
  bucket: string
  domain: string
  coverStyle: string
  previewStyle: string
  albumStyle: string
  region: string
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
  const store = await load('bitiful-config.json', { autoSave: false, defaults: {} })
  store.set('config', config)
  await store.save()
}

// 获取本地存储的 bitiful 配置
export async function getBitifulConfigLocal(): Promise<BitifulConfig | null> {
  try {
    const store = await load('bitiful-config.json', { autoSave: false, defaults: {} })
    return await store.get<BitifulConfig>('config') || null
  } catch (error) {
    return null
  }
}

// 更新配置（本地存储 + 远端更新）
export async function updateBitifulConfigComplete(config: Partial<BitifulConfig>): Promise<BitifulConfig> {
  // 先更新远端
  const updatedConfig = await updateBitifulConfig(config)
  
  // 再存储到本地
  await saveBitifulConfigLocal(updatedConfig)
  
  return updatedConfig
}