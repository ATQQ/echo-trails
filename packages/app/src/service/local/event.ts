import { invoke } from '@tauri-apps/api/core'
import dayjs from 'dayjs'

export interface EventItem {
  id: string
  name: string
  emoji: string
  /** 单位：空字符串表示不设置（一次记 1 次） */
  unit: string
  /** 默认单次值：仅在设置了单位时有意义 */
  defaultAmount: number | null
  /** 排序序号：升序展示 */
  sortOrder: number
}

export interface EventRecordItem {
  id: string
  eventId: string
  eventName: string
  emoji: string
  occurredAt: number
  date: string
  note: string
  /** 本次数量：null 表示没记数量，统计按 1 次计入 */
  amount: number | null
}

function mapEvent(row: any): EventItem {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row
  return {
    id: row.id || row._id,
    name: data.name || row.name || '',
    emoji: data.emoji || row.emoji || '',
    unit: data.unit || row.unit || '',
    defaultAmount: data.defaultAmount ?? row.defaultAmount ?? null,
    sortOrder: Number(data.sortOrder ?? row.sortOrder ?? 0),
  }
}

function mapRecord(row: any): EventRecordItem {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row
  return {
    id: row.id || row._id,
    eventId: data.eventId || row.event_id || '',
    eventName: data.eventName || row.eventName || '',
    emoji: data.emoji || row.emoji || '',
    occurredAt: data.occurredAt ? new Date(data.occurredAt).getTime() : Date.now(),
    date: data.date || row.date || '',
    note: data.note || row.note || '',
    amount: data.amount ?? row.amount ?? null,
  }
}

// ==================== 事件定义 ====================

export async function fetchEvents(familyId: string): Promise<EventItem[]> {
  const result = await invoke<any>('db_event_list', { familyId })
  return (result.data || []).map(mapEvent)
}

export async function createEvent(
  familyId: string,
  data: { name: string; emoji: string; unit?: string; defaultAmount?: number | null },
): Promise<EventItem> {
  const result = await invoke<any>('db_event_create', {
    familyId,
    name: data.name,
    emoji: data.emoji,
    unit: data.unit || '',
    defaultAmount: data.defaultAmount ?? null,
  })
  return mapEvent(result.data)
}

export async function updateEvent(
  data: Partial<EventItem> & { id: string },
): Promise<EventItem> {
  // unit / defaultAmount / sortOrder 走 JSON patch 合并，才能区分「不改」与「清空」
  const patch: Record<string, unknown> = {}
  if (data.unit !== undefined) patch.unit = data.unit
  if (data.defaultAmount !== undefined) patch.defaultAmount = data.defaultAmount
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  const result = await invoke<any>('db_event_update', {
    id: data.id,
    name: data.name,
    emoji: data.emoji,
    data: Object.keys(patch).length ? JSON.stringify(patch) : undefined,
  })
  return mapEvent(result.data)
}

export async function deleteEvent(id: string): Promise<void> {
  await invoke('db_event_delete', { id })
}

// ==================== 事件打卡记录 ====================

export async function fetchEventRecords(familyId: string, params: {
  eventId?: string
  startDate?: string
  endDate?: string
}): Promise<EventRecordItem[]> {
  const result = await invoke<any>('db_event_record_list', {
    familyId,
    eventId: params.eventId || undefined,
    startDate: params.startDate || undefined,
    endDate: params.endDate || undefined,
    page: 1,
    pageSize: 2000,
  })
  return (result.data || []).map(mapRecord)
}

export async function createEventRecord(data: {
  familyId: string
  eventId: string
  occurredAt: number
  note?: string
  amount?: number | null
}): Promise<EventRecordItem> {
  const result = await invoke<any>('db_event_record_create', {
    familyId: data.familyId,
    eventId: data.eventId,
    occurredAt: new Date(data.occurredAt).toISOString(),
    date: dayjs(data.occurredAt).format('YYYY-MM-DD'),
    note: data.note || '',
    amount: data.amount ?? null,
  })
  return mapRecord(result.data)
}

export async function deleteEventRecord(id: string): Promise<void> {
  await invoke('db_event_record_delete', { id })
}

export async function updateEventRecord(data: {
  id: string
  amount?: number | null
  note?: string
}): Promise<EventRecordItem> {
  const patch: Record<string, unknown> = {}
  if (data.amount !== undefined) patch.amount = data.amount
  if (data.note !== undefined) patch.note = data.note
  const result = await invoke<any>('db_event_record_update', {
    id: data.id,
    data: Object.keys(patch).length ? JSON.stringify(patch) : undefined,
  })
  return mapRecord(result.data)
}
