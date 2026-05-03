import { api } from '@/lib/request'
import { isLocalMode } from '@/lib/serviceRouter'
import * as local from './local'

export interface BloodPressureRecord {
  id: string;
  sbp: number;
  dbp: number;
  heartRate: number;
  bloodOxygen?: number;
  arm?: 'left' | 'right';
  timestamp: number;
  note?: string;
}

export async function fetchBpRecords(familyId: string, startTime?: number, endTime?: number) {
  if (isLocalMode()) return local.fetchBpRecords(familyId, startTime, endTime)
  const searchParams: any = { familyId }
  if (startTime && endTime) {
    searchParams.startTime = startTime
    searchParams.endTime = endTime
  }
  const res: any = await api.get('blood-pressure/list', { searchParams }).json()
  if (res.code === 0) {
    return res.data.map((item: any) => ({
      id: item._id,
      sbp: item.sbp,
      dbp: item.dbp,
      heartRate: item.heartRate,
      bloodOxygen: item.bloodOxygen,
      arm: item.arm,
      timestamp: new Date(item.date).getTime(),
      note: item.note
    }))
  }
  return []
}

export async function addBpRecord(record: Omit<BloodPressureRecord, 'id'>, familyId: string) {
  if (isLocalMode()) return local.addBpRecord(record, familyId)
  const res: any = await api.post('blood-pressure/add', {
    json: {
      ...record,
      date: new Date(record.timestamp),
      familyId
    }
  }).json()
  return res
}

export async function updateBpRecord(record: Partial<BloodPressureRecord> & { id: string }) {
  if (isLocalMode()) return local.updateBpRecord(record)
  const res: any = await api.post('blood-pressure/update', {
    json: {
      ...record,
      date: record.timestamp ? new Date(record.timestamp) : undefined
    }
  }).json()
  return res
}

export async function deleteBpRecord(id: string) {
  if (isLocalMode()) return local.deleteBpRecord(id)
  const res: any = await api.post('blood-pressure/delete', {
    json: { id }
  }).json()
  return res
}
