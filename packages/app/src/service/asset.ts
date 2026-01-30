import { api } from "@/lib/request";

// --- Asset API ---
export function getAssetCategories() {
  return api.get<ServerResponse<any[]>>('asset/category/list').json().then(res => res.data);
}

export function createAssetCategory(data: { name: string, parentId?: string }) {
  return api.post<ServerResponse>('asset/category/create', { json: data }).json().then(res => res.data);
}

export function deleteAssetCategory(id: string) {
  return api.delete<ServerResponse>('asset/category/delete', { json: { id } }).json();
}

export function getAssets(params?: { categoryId?: string, subCategoryId?: string, status?: string }) {
  return api.get<ServerResponse<any[]>>('asset/list', { searchParams: params }).json().then(res => res.data);
}

export function createAsset(data: any) {
  return api.post<ServerResponse>('asset/create', { json: data }).json().then(res => res.data);
}

export function updateAsset(data: any) {
  return api.put<ServerResponse>('asset/update', { json: data }).json();
}

export function deleteAsset(id: string) {
  return api.delete<ServerResponse>('asset/delete', { json: { id } }).json();
}

export function getAssetStats() {
  return api.get<ServerResponse<{ totalValue: number, dailyCost: number }>>('asset/stats').json().then(res => res.data);
}
