import { api } from '@/lib/request';
import { isLocalMode } from '@/lib/serviceRouter'
import * as local from './local'

export interface FamilyMember {
  _id?: string;
  familyId: string;
  name: string;
  canDelete?: boolean;
}

export const getFamilyList = () => {
  if (isLocalMode()) return local.getFamilyList()
  return api.get('family/list').json<{ code: number, data: FamilyMember[] }>();
}

export const addFamily = (name: string) => {
  if (isLocalMode()) return local.addFamily(name)
  return api.post('family/add', { json: { name } }).json<{ code: number, data: FamilyMember }>();
}

export const updateFamily = (familyId: string, name: string) => {
  if (isLocalMode()) return local.updateFamily(familyId, name)
  return api.post('family/update', { json: { familyId, name } }).json();
}

export const deleteFamily = (familyId: string) => {
  if (isLocalMode()) return local.deleteFamily(familyId)
  return api.post('family/delete', { json: { familyId } }).json();
}
