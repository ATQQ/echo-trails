import { invoke } from '@tauri-apps/api/core'

const CACHE_KEY = 'todo_statuses'

export interface TodoStatusItem {
  key: string
  name: string
  color: string
  isSystem: boolean
}

/** 读取本地缓存中的自定义状态列表（不含系统预设） */
async function readCustoms(): Promise<TodoStatusItem[]> {
  try {
    const value = await invoke<string | null>('db_get_cache', { key: CACHE_KEY })
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 写入自定义状态列表 */
async function writeCustoms(list: TodoStatusItem[]) {
  await invoke('db_set_cache', { key: CACHE_KEY, value: JSON.stringify(list) })
}

export async function fetchCustomStatuses(): Promise<TodoStatusItem[]> {
  return readCustoms()
}

export async function createCustomStatus(data: { key: string; name: string; color: string }): Promise<TodoStatusItem> {
  const list = await readCustoms()
  if (list.some((s) => s.key === data.key)) {
    throw new Error('状态标识已存在')
  }
  const item: TodoStatusItem = { ...data, isSystem: false }
  list.push(item)
  await writeCustoms(list)
  return item
}

export async function deleteCustomStatus(key: string): Promise<void> {
  const list = await readCustoms()
  await writeCustoms(list.filter((s) => s.key !== key))
}
