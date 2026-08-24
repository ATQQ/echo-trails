import { api } from '@/lib/request'
import { isLocalMode } from '@/lib/serviceRouter'
import type { TodoStatusItem } from './local/todoStatus'
import * as local from './local/todoStatus'

/** 系统预设状态，不落库，始终置顶展示且不可删除 */
export const DEFAULT_STATUSES: TodoStatusItem[] = [
  { key: 'todo', name: '待开始', color: '#969799', isSystem: true },
  { key: 'in_progress', name: '进行中', color: '#1989fa', isSystem: true },
  { key: 'paused', name: '已暂停', color: '#ff976a', isSystem: true },
  { key: 'pending_review', name: '待审核', color: '#7232dd', isSystem: true },
  { key: 'done', name: '已完成', color: '#07c160', isSystem: true },
  { key: 'cancelled', name: '已取消', color: '#ee0a24', isSystem: true },
  { key: 'archived', name: '已归档', color: '#00bcd4', isSystem: true },
]

export type { TodoStatusItem } from './local/todoStatus'

export async function fetchTodoStatuses(): Promise<TodoStatusItem[]> {
  let customs: TodoStatusItem[]
  if (isLocalMode()) {
    customs = await local.fetchCustomStatuses()
  } else {
    const res: any = await api.get('todoStatus/list').json()
    customs = res.code === 0 ? (res.data || []).map((s: any) => ({
      key: s.key,
      name: s.name,
      color: s.color || '#969799',
      isSystem: false,
    })) : []
  }
  return [...DEFAULT_STATUSES, ...customs]
}

export async function createTodoStatus(data: { name: string; color: string }): Promise<TodoStatusItem> {
  // 生成 key：优先用名称拼音首字母兜底，这里用随机串保证唯一
  const key = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const payload = { key, name: data.name.trim(), color: data.color }
  if (isLocalMode()) {
    return local.createCustomStatus(payload)
  }
  const res: any = await api.post('todoStatus/create', { json: payload }).json()
  if (res.code !== 0) throw new Error(res.message || '创建失败')
  return { key: res.data.key, name: res.data.name, color: res.data.color, isSystem: false }
}

export async function deleteTodoStatus(key: string): Promise<void> {
  if (DEFAULT_STATUSES.some((s) => s.key === key)) return
  if (isLocalMode()) {
    return local.deleteCustomStatus(key)
  }
  await api.delete('todoStatus/delete', { json: { key } }).json()
}
