import { api } from "@/lib/request";
import { isLocalMode } from '@/lib/serviceRouter'
import * as local from './local'

// --- Asset API ---
export function getAssetCategories() {
  if (isLocalMode()) return local.getAssetCategories()
  return api.get<ServerResponse<any[]>>('asset/category/list').json().then(res => res.data);
}

export function createAssetCategory(data: { name: string, parentId?: string }) {
  if (isLocalMode()) return local.createAssetCategory(data)
  return api.post<ServerResponse>('asset/category/create', { json: data }).json().then(res => res.data);
}

export function deleteAssetCategory(id: string) {
  if (isLocalMode()) return local.deleteAssetCategory(id)
  return api.delete<ServerResponse>('asset/category/delete', { json: { id } }).json();
}

export function getAssets(params?: { categoryId?: string, subCategoryId?: string, status?: string }) {
  if (isLocalMode()) return local.getAssets(params)
  return api.get<ServerResponse<any[]>>('asset/list', { searchParams: params }).json().then(res => res.data);
}

export function createAsset(data: any) {
  if (isLocalMode()) return local.createAsset(data)
  return api.post<ServerResponse>('asset/create', { json: data }).json().then(res => res.data);
}

export function updateAsset(data: any) {
  if (isLocalMode()) return local.updateAsset(data)
  return api.put<ServerResponse>('asset/update', { json: data }).json();
}

export function deleteAsset(id: string) {
  if (isLocalMode()) return local.deleteAsset(id)
  return api.delete<ServerResponse>('asset/delete', { json: { id } }).json();
}

export function getAssetStats() {
  if (isLocalMode()) return local.getAssetStats()
  return api.get<ServerResponse<{ totalValue: number, dailyCost: number }>>('asset/stats').json().then(res => res.data);
}
