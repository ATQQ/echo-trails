import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/constants'
import { api } from '@/lib/request'
import { isLocalMode } from '@/lib/serviceRouter'

export type RequirementKind = 'project' | 'idea' | 'task'
export interface RequirementProject { id: string; name: string; description: string; color: string; archived: boolean }
export interface RequirementIdea { id: string; title: string; body: string; tag: string; created: string }
export interface RequirementTask {
  id: string; title: string; projectId: string; status: 'todo' | 'active' | 'done'; progress: number
  priority: 'high' | 'medium' | 'low'; due: string; note: string
}
export interface RequirementData { projects: RequirementProject[]; ideas: RequirementIdea[]; tasks: RequirementTask[] }

const emptyData = (): RequirementData => ({ projects: [], ideas: [], tasks: [] })

export async function fetchRequirements(): Promise<RequirementData> {
  if (isLocalMode()) {
    const result = await invoke<{ data?: RequirementData }>('db_requirement_list')
    return result.data || emptyData()
  }
  const result: any = await api.get('requirement/list').json()
  return result.code === 0 ? result.data : emptyData()
}

export async function createRequirement<K extends RequirementKind>(kind: K, data: Record<string, unknown>) {
  if (isLocalMode()) return invoke('db_requirement_create', { kind, data })
  return api.post('requirement/create', { json: { kind, data } }).json()
}

export async function updateRequirement<K extends RequirementKind>(kind: K, id: string, data: Record<string, unknown>) {
  if (isLocalMode()) return invoke('db_requirement_update', { id, kind, data })
  return api.put('requirement/update', { json: { kind, id, data } }).json()
}

export async function deleteRequirement<K extends RequirementKind>(kind: K, id: string) {
  if (isLocalMode()) return invoke('db_requirement_delete', { id, kind })
  return api.delete('requirement/delete', { json: { kind, id } }).json()
}

export const canUseNativeRequirementStorage = () => isTauri && isLocalMode()
