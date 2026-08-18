import { api } from '@/lib/request'
import { isLocalMode } from '@/lib/serviceRouter'
import * as local from './local/driveFile'

export interface DriveFileItem {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  parentId: string;
  key: string;
  size: number;
  mimeType: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
}

export interface DriveBreadcrumb {
  id: string;
  name: string;
}

export async function fetchDriveFiles(parentId = ''): Promise<{ items: DriveFileItem[]; breadcrumb: DriveBreadcrumb[] }> {
  if (isLocalMode()) return local.fetchDriveFiles(parentId)
  const res: any = await api.get('drive-file/list', { searchParams: { parentId } }).json()
  if (res.code === 0) {
    return {
      items: res.data.items || [],
      breadcrumb: res.data.breadcrumb || [],
    }
  }
  return { items: [], breadcrumb: [] }
}

export async function createFolder(name: string, parentId = '') {
  if (isLocalMode()) return local.createFolder(name, parentId)
  const res: any = await api.post('drive-file/folder', { json: { name, parentId } }).json()
  return res.data
}

export async function createDriveFile(data: {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  parentId?: string;
}) {
  if (isLocalMode()) return local.createDriveFile(data)
  const res: any = await api.post('drive-file/create', { json: data }).json()
  return res.data
}

export async function renameDriveFile(id: string, name: string) {
  if (isLocalMode()) return local.renameDriveFile(id, name)
  const res: any = await api.put('drive-file/rename', { json: { id, name } }).json()
  return res.data
}

export async function moveDriveFile(id: string, parentId: string) {
  if (isLocalMode()) return local.moveDriveFile(id, parentId)
  const res: any = await api.put('drive-file/move', { json: { id, parentId } }).json()
  return res.data
}

export async function deleteDriveFile(id: string) {
  if (isLocalMode()) return local.deleteDriveFile(id)
  const res: any = await api.delete('drive-file/delete', { json: { id } }).json()
  return res
}

// ==================== 回收站 ====================

export async function fetchTrashFiles(): Promise<DriveFileItem[]> {
  if (isLocalMode()) return local.fetchTrashFiles()
  const res: any = await api.get('drive-file/trash-list').json()
  return res.code === 0 ? (res.data.items || []) : []
}

export async function restoreDriveFile(id: string) {
  if (isLocalMode()) return local.restoreDriveFile(id)
  return api.post('drive-file/restore', { json: { id } }).json()
}

export async function purgeDriveFile(id: string) {
  if (isLocalMode()) return local.purgeDriveFile(id)
  return api.delete('drive-file/purge', { json: { id } }).json()
}

export async function purgeAllDriveFiles() {
  if (isLocalMode()) return local.purgeAllDriveFiles()
  return api.delete('drive-file/purge-all').json()
}

export async function getShareUrl(item: DriveFileItem, expires = 86400): Promise<string> {
  if (isLocalMode()) return local.getShareUrl(item.key, expires)
  const res: any = await api.get('drive-file/share', { searchParams: { id: item.id, expires } }).json()
  if (res.code === 0) {
    return res.data.url
  }
  throw new Error(res.message || '生成分享链接失败')
}

export async function getDownloadUrl(item: DriveFileItem): Promise<string> {
  if (isLocalMode()) return local.getDownloadUrl(item.key)
  const res: any = await api.get('drive-file/download', { searchParams: { id: item.id } }).json()
  if (res.code === 0) {
    return res.data.url
  }
  throw new Error(res.message || '生成下载链接失败')
}
