import { invoke } from '@tauri-apps/api/core'

export interface WeightRecord {
  _id?: string;
  weight: number;
  date: string | Date;
  tips?: string;
  operator?: string;
  familyId: string;
}

export async function getWeightList(familyId?: string, page: number = 1, pageSize: number = 30) {
  const result = await invoke<any>('db_weight_list', {
    familyId,
    page,
    pageSize,
  })
  return {
    code: 0,
    data: (result.data || []).map((w: any) => ({
      ...w,
      _id: w.id || w._id,
    }))
  }
}

export async function addWeight(data: { weight: number, date: Date | string, tips: string, operator: string, familyId: string }) {
  const result = await invoke<any>('db_weight_add', {
    weight: data.weight,
    date: typeof data.date === 'string' ? data.date : data.date.toISOString(),
    tips: data.tips,
    familyId: data.familyId,
    operator: data.operator,
    data: JSON.stringify(data),
  })
  return {
    code: 0,
    data: {
      ...result.data,
      _id: result.data?.id || result.data?._id,
    }
  }
}

export async function updateWeight(data: { id: string, weight: number, date: Date | string, tips: string }) {
  return invoke('db_weight_update', {
    id: data.id,
    weight: data.weight,
    date: typeof data.date === 'string' ? data.date : data.date.toISOString(),
    tips: data.tips,
  })
}

export async function deleteWeight(id: string) {
  return invoke('db_weight_delete', { id })
}

// migrateWeight is not available in offline mode
export async function migrateWeight(_data: { oldPhone: string, targetOperator: string }) {
  return { code: 0, message: '本地模式下不支持迁移', count: 0 }
}
