import { api } from '@/lib/request'
import { isLocalMode } from '@/lib/serviceRouter'
import * as local from './local/event'

export type { EventItem, EventRecordItem } from './local/event'

export async function fetchEvents(familyId: string): Promise<local.EventItem[]> {
  if (isLocalMode()) return local.fetchEvents(familyId)
  const res: any = await api.get('event/list', { searchParams: { familyId } }).json()
  if (res.code === 0) {
    return (res.data || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      emoji: e.emoji || '',
    }))
  }
  return []
}

export async function createEvent(familyId: string, data: { name: string; emoji: string }): Promise<local.EventItem> {
  if (isLocalMode()) return local.createEvent(familyId, data)
  const res: any = await api.post('event/create', { json: { ...data, familyId } }).json()
  return res.data
}

export async function updateEvent(data: Partial<local.EventItem> & { id: string }): Promise<local.EventItem> {
  if (isLocalMode()) return local.updateEvent(data)
  const res: any = await api.put('event/update', { json: data }).json()
  return res.data
}

export async function deleteEvent(id: string): Promise<void> {
  if (isLocalMode()) return local.deleteEvent(id)
  await api.delete('event/delete', { json: { id } }).json()
}

export async function fetchEventRecords(familyId: string, params: {
  eventId?: string
  startDate?: string
  endDate?: string
}): Promise<local.EventRecordItem[]> {
  if (isLocalMode()) return local.fetchEventRecords(familyId, params)
  const searchParams: any = { familyId }
  if (params.eventId) searchParams.eventId = params.eventId
  if (params.startDate) searchParams.startDate = params.startDate
  if (params.endDate) searchParams.endDate = params.endDate
  const res: any = await api.get('event/record/list', { searchParams }).json()
  if (res.code === 0) {
    return (res.data || []).map((r: any) => ({
      id: r.id,
      eventId: r.eventId,
      eventName: r.eventName || '',
      emoji: r.emoji || '',
      occurredAt: r.occurredAt,
      date: r.date || '',
      note: r.note || '',
    }))
  }
  return []
}

export async function createEventRecord(data: { familyId: string; eventId: string; occurredAt: number; note?: string }): Promise<local.EventRecordItem> {
  if (isLocalMode()) return local.createEventRecord(data)
  const res: any = await api.post('event/record/create', {
    json: {
      familyId: data.familyId,
      eventId: data.eventId,
      occurredAt: new Date(data.occurredAt).toISOString(),
      note: data.note || '',
    },
  }).json()
  return res.data
}

export async function deleteEventRecord(id: string): Promise<void> {
  if (isLocalMode()) return local.deleteEventRecord(id)
  await api.delete('event/record/delete', { json: { id } }).json()
}
