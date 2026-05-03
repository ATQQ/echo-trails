import { invoke } from '@tauri-apps/api/core'

function mapAsset(row: any): any {
  return {
    ...row,
    _id: row.id || row._id,
  }
}

export async function getAssetCategories() {
  const result = await invoke<any>('db_asset_category_list')
  return (result.data || []).map((cat: any) => ({
    ...cat,
    _id: cat.id || cat._id,
    subCategories: (cat.subCategories || []).map((sub: any) => ({
      ...sub,
      _id: sub.id || sub._id,
    }))
  }))
}

export async function createAssetCategory(data: { name: string, parentId?: string }) {
  const result = await invoke<any>('db_asset_category_create', {
    name: data.name,
    parentId: data.parentId,
    data: JSON.stringify(data),
  })
  const cat = result.data
  return { ...cat, id: cat.id || cat._id }
}

export async function deleteAssetCategory(id: string) {
  return invoke('db_asset_category_delete', { id })
}

export async function getAssets(params?: { categoryId?: string, subCategoryId?: string, status?: string }) {
  const result = await invoke<any>('db_asset_list', {
    categoryId: params?.categoryId,
    subCategoryId: params?.subCategoryId,
    status: params?.status,
  })
  return (result.data || []).map(mapAsset)
}

export async function createAsset(data: any) {
  const result = await invoke<any>('db_asset_create', {
    data: JSON.stringify(data),
  })
  return mapAsset(result)
}

export async function updateAsset(data: any) {
  return invoke('db_asset_update', {
    id: data.id,
    data: JSON.stringify(data),
  })
}

export async function deleteAsset(id: string) {
  return invoke('db_asset_delete', { id })
}

export async function getAssetStats() {
  const result = await invoke<any>('db_asset_stats')
  return result.data || { totalValue: 0, dailyCost: 0 }
}
