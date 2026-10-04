import { invoke } from '@tauri-apps/api/core'
import dayjs from 'dayjs'

export interface EventItem {
  id: string
  name: string
  emoji: string
}

export interface EventRecordItem {
  id: string
  eventId: string
  eventName: string
  emoji: string
  occurredAt: number
  date: string
  note: string
}

function mapEvent(row: any): EventItem {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row
  return {
    id: row.id || row._id,
    name: data.name || row.name || '',
    emoji: data.emoji || row.emoji || '',
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
  }
}

// ==================== 事件定义 ====================

export async function fetchEvents(familyId: string): Promise<EventItem[]> {
  const result = await invoke<any>('db_event_list', { familyId })
  return (result.data || []).map(mapEvent)
}

export async function createEvent(familyId: string, data: { name: string; emoji: string }): Promise<EventItem> {
  const result = await invoke<any>('db_event_create', {
    familyId,
    name: data.name,
    emoji: data.emoji,
  })
  return mapEvent(result.data)
}

export async function updateEvent(data: Partial<EventItem> & { id: string }): Promise<EventItem> {
  const result = await invoke<any>('db_event_update', {
    id: data.id,
    name: data.name,
    emoji: data.emoji,
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

export async function createEventRecord(data: { familyId: string; eventId: string; occurredAt: number; note?: string }): Promise<EventRecordItem> {
  const result = await invoke<any>('db_event_record_create', {
    familyId: data.familyId,
    eventId: data.eventId,
    occurredAt: new Date(data.occurredAt).toISOString(),
    date: dayjs(data.occurredAt).format('YYYY-MM-DD'),
    note: data.note || '',
  })
  return mapRecord(result.data)
}

export async function deleteEventRecord(id: string): Promise<void> {
  await invoke('db_event_record_delete', { id })
}
