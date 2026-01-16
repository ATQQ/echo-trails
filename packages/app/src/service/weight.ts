import { api } from '@/lib/request';

export interface WeightRecord {
  _id?: string;
  weight: number;
  date: string | Date;
  tips?: string;
  operator?: string;
  familyId: string;
}

export const getWeightList = (familyId?: string) => {
  const searchParams: Record<string, string> = {};
  if (familyId) {
    searchParams.familyId = familyId;
  }
  return api.get('weight/list', { searchParams }).json<{ code: number, data: WeightRecord[] }>();
}

export const addWeight = (data: { weight: number, date: Date | string, tips: string, operator: string, familyId: string }) => {
  return api.post('weight/add', { json: data }).json();
}

export const updateWeight = (data: { id: string, weight: number, date: Date | string, tips: string }) => {
  return api.post('weight/update', { json: data }).json();
}

export const deleteWeight = (id: string) => {
  return api.post('weight/delete', { json: { id } }).json();
}

export const migrateWeight = (data: { oldPhone: string, targetOperator: string }) => {
  return api.post('weight/migrate', { json: data }).json<{ code: number, message: string, count?: number }>();
}
