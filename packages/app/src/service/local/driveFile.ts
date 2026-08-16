import { invoke } from '@tauri-apps/api/core'
import { showConfirmDialog } from 'vant'
import router from '@/router'
import { getBitifulConfigLocal } from '@/lib/bitifulConfig'
import { buildFileUrl } from './fileUrl'
import type { DriveFileItem, DriveBreadcrumb } from '../driveFile'

function mapDriveFile(row: any): DriveFileItem {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row
  return {
    id: row.id || row._id,
    name: data.name || row.name || '',
    kind: row.kind || 'file',
    parentId: row.parentId ?? row.parent_id ?? '',
    key: data.key || row.key || '',
    size: Number(data.size ?? row.size ?? 0),
    mimeType: data.mimeType || row.mimeType || '',
    provider: data.provider || row.provider || 'bitiful',
    createdAt: data.createdAt ? new Date(data.createdAt).getTime() : (row.updated_at ? new Date(row.updated_at).getTime() : Date.now()),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  }
}

export async function fetchDriveFiles(parentId = '') {
  const result = await invoke<any>('db_drive_file_list', { parentId })
  const data = result.data || {}
  return {
    items: (data.items || []).map(mapDriveFile),
    breadcrumb: (data.breadcrumb || []) as DriveBreadcrumb[],
  }
}

export async function createFolder(name: string, parentId = '') {
  const result = await invoke<any>('db_drive_file_create_folder', { name, parentId })
  return mapDriveFile(result.data)
}

export async function createDriveFile(data: {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  parentId?: string;
}) {
  const result = await invoke<any>('db_drive_file_create', {
    key: data.key,
    name: data.name,
    size: data.size,
    mimeType: data.mimeType,
    parentId: data.parentId || '',
  })
  return mapDriveFile(result.data)
}

export async function renameDriveFile(id: string, name: string) {
  const result = await invoke<any>('db_drive_file_rename', { id, name })
  return mapDriveFile(result.data)
}

export async function moveDriveFile(id: string, parentId: string) {
  const result = await invoke<any>('db_drive_file_move', { id, parentId })
  return mapDriveFile(result.data)
}

export async function deleteDriveFile(id: string) {
  return invoke('db_drive_file_delete', { id })
}

/**
 * 本地模式生成分享/下载直链：
 * 1. 配置了 CDN 域名时优先使用 CDN 鉴权直链（有效期可自定义）
 * 2. 未配置 CDN 时回退到原生 download_url 命令做 S3 GET 预签名
 */
async function resolveFileUrl(key: string, expiresSeconds: number) {
  const config = await getBitifulConfigLocal()
  if (config?.domain) {
    const cdnUrl = await buildFileUrl(key, undefined, undefined, expiresSeconds)
    if (cdnUrl) return cdnUrl
  }
  return nativePresignedUrl(key, expiresSeconds)
}

async function nativePresignedUrl(key: string, expiresSeconds: number) {
  const config = await getBitifulConfigLocal()
  if (!config || !config.bucket || !config.region || !config.endpoint || !config.accessKey || !config.secretKey) {
    showConfirmDialog({
      title: '未配置 S3 参数',
      message: '生成分享链接需要配置 Bitiful(S3) 参数，是否前往配置？',
      confirmButtonText: '去配置',
      cancelButtonText: '取消',
    }).then(() => {
      router.push('/set')
    }).catch(() => {
      // 取消
    })
    throw new Error('未配置 Bitiful (S3) 参数，无法生成分享链接')
  }

  const result = await invoke<any>('download_url', {
    key,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    expiresSeconds,
  })
  return result.url as string
}

export async function getShareUrl(key: string, expires: number) {
  return resolveFileUrl(key, expires)
}

export async function getDownloadUrl(key: string) {
  return resolveFileUrl(key, 3600)
}
