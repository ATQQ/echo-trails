import { api } from '@/lib/request';
import { isLocalMode } from '@/lib/serviceRouter'
import * as local from './local'

export interface WeightRecord {
  _id?: string;
  weight: number;
  date: string | Date;
  tips?: string;
  operator?: string;
  familyId: string;
}

export const getWeightList = (familyId?: string, page: number = 1, pageSize: number = 30) => {
  if (isLocalMode()) return local.getWeightList(familyId, page, pageSize)
  const searchParams: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize)
  };
  if (familyId) {
    searchParams.familyId = familyId;
  }
  return api.get('weight/list', { searchParams }).json<{ code: number, data: WeightRecord[] }>();
}

export const addWeight = (data: { weight: number, date: Date | string, tips: string, operator: string, familyId: string }) => {
  if (isLocalMode()) return local.addWeight(data)
  return api.post('weight/add', { json: data }).json();
}

export const updateWeight = (data: { id: string, weight: number, date: Date | string, tips: string }) => {
  if (isLocalMode()) return local.updateWeight(data)
  return api.post('weight/update', { json: data }).json();
}

export const deleteWeight = (id: string) => {
  if (isLocalMode()) return local.deleteWeight(id)
  return api.post('weight/delete', { json: { id } }).json();
}

export const migrateWeight = (data: { oldPhone: string, targetOperator: string }) => {
  if (isLocalMode()) return local.migrateWeight(data)
  return api.post('weight/migrate', { json: data }).json<{ code: number, message: string, count?: number }>();
}
