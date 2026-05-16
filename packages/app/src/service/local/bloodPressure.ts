import { invoke } from '@tauri-apps/api/core'

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

function mapBpRecord(row: any): BloodPressureRecord {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row
  return {
    id: row.id || row._id,
    sbp: data.sbp || row.sbp || 0,
    dbp: data.dbp || row.dbp || 0,
    heartRate: data.heartRate || row.heartRate || 0,
    bloodOxygen: data.bloodOxygen || row.bloodOxygen,
    arm: data.arm || row.arm,
    timestamp: data.date ? new Date(data.date).getTime() : (row.date ? new Date(row.date).getTime() : Date.now()),
    note: data.note || row.note || '',
  }
}

export async function fetchBpRecords(familyId: string, startTime?: number, endTime?: number) {
  const result = await invoke<any>('db_bp_list', {
    familyId,
    startTime: startTime ? new Date(startTime).toISOString() : undefined,
    endTime: endTime ? new Date(endTime).toISOString() : undefined,
  })
  return (result.data || []).map(mapBpRecord)
}

export async function addBpRecord(record: Omit<BloodPressureRecord, 'id'>, familyId: string) {
  const result = await invoke<any>('db_bp_add', {
    familyId,
    sbp: record.sbp,
    dbp: record.dbp,
    heartRate: record.heartRate,
    bloodOxygen: record.bloodOxygen,
    arm: record.arm,
    date: new Date(record.timestamp).toISOString(),
    note: record.note,
    operator: 'local',
    data: JSON.stringify({
      sbp: record.sbp,
      dbp: record.dbp,
      heartRate: record.heartRate,
      bloodOxygen: record.bloodOxygen,
      arm: record.arm,
      date: new Date(record.timestamp).toISOString(),
      note: record.note || '',
      operator: 'local',
      familyId,
    }),
  })
  return mapBpRecord(result.data)
}

export async function updateBpRecord(record: Partial<BloodPressureRecord> & { id: string }) {
  const data = JSON.stringify({
    sbp: record.sbp,
    dbp: record.dbp,
    heartRate: record.heartRate,
    bloodOxygen: record.bloodOxygen,
    arm: record.arm,
    date: record.timestamp ? new Date(record.timestamp).toISOString() : undefined,
    note: record.note,
  })
  const result = await invoke<any>('db_bp_update', { id: record.id, data })
  return mapBpRecord(result.data)
}

export async function deleteBpRecord(id: string) {
  return invoke('db_bp_delete', { id })
}
