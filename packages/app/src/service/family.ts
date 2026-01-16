import { api } from '@/lib/request';

export interface FamilyMember {
  _id?: string;
  familyId: string;
  name: string;
}

export const getFamilyList = () => {
  return api.get('family/list').json<{ code: number, data: FamilyMember[] }>();
}

export const addFamily = (name: string) => {
  return api.post('family/add', { json: { name } }).json<{ code: number, data: FamilyMember }>();
}

export const updateFamily = (familyId: string, name: string) => {
  return api.post('family/update', { json: { familyId, name } }).json();
}

export const deleteFamily = (familyId: string) => {
  return api.post('family/delete', { json: { familyId } }).json();
}
