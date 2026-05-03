import { invoke } from '@tauri-apps/api/core'

export interface FamilyMember {
  _id?: string;
  familyId: string;
  name: string;
  canDelete?: boolean;
}

export async function getFamilyList() {
  const result = await invoke<any>('db_family_list')
  return {
    code: 0,
    data: (result.data || []).map((f: any) => ({
      ...f,
      _id: f.id || f._id,
      canDelete: true,
    }))
  }
}

export async function addFamily(name: string) {
  const result = await invoke<any>('db_family_add', {
    name,
    data: JSON.stringify({ name }),
  })
  return {
    code: 0,
    data: {
      ...result.data,
      _id: result.data?.id || result.data?._id,
    }
  }
}

export async function updateFamily(familyId: string, name: string) {
  return invoke('db_family_update', { familyId, name })
}

export async function deleteFamily(familyId: string) {
  return invoke('db_family_delete', { familyId })
}
