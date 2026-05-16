import { invoke } from '@tauri-apps/api/core'
import { getBitifulConfigLocal } from '@/lib/bitifulConfig'
import dayjs from 'dayjs'
import SparkMD5 from 'spark-md5'

// Cache for bitiful config to avoid repeated reads
let _bitifulConfigCache: Awaited<ReturnType<typeof getBitifulConfigLocal>> = null
async function getCachedBitifulConfig() {
  if (!_bitifulConfigCache) {
    _bitifulConfigCache = await getBitifulConfigLocal()
  }
  return _bitifulConfigCache
}

// Construct image URL from S3 key using Bitiful config
// Matches server's createLink: signs URLs with CDN token when available
async function buildFileUrl(s3Key: string, style?: string, queryParams?: string): Promise<string> {
  const config = await getCachedBitifulConfig()
  if (!config?.domain || !s3Key) return ''

  const base = config.domain.replace(/\/$/, '')
  const encodedParts = s3Key.split('/').map(p => encodeURIComponent(p)).join('/')
  const fileName = `/${encodedParts}` + (style ? `!style:${style}` : '')
  const fullKey = fileName + (queryParams ? `?${queryParams}` : '')

  // If CDN token is available, sign the URL (matches server's createLink)
  if (config.cdnToken) {
    const deadLine = Math.floor(Date.now() / 1000) + 60 * 30
    const rawString = config.cdnToken + fileName + deadLine
    const md5Result = SparkMD5.hash(rawString)
    const separator = fullKey.includes('?') ? '&' : '?'
    return `${base}${fullKey}${separator}_btf_tk=${md5Result}&_ts=${deadLine}`
  }

  return `${base}${fullKey}`
}

async function buildCoverUrl(s3Key: string, isImage = true): Promise<string> {
  const config = await getCachedBitifulConfig()
  const params = !isImage ? 'frame=0' : undefined
  const style = isImage ? config?.coverStyle : undefined
  return buildFileUrl(s3Key, style, params)
}

async function enrichPhotoUrls(row: any): Promise<any> {
  const photo = mapPhoto(row)
  const config = await getCachedBitifulConfig()
  const s3Key = photo.key
  if (s3Key && config?.domain) {
    const isImage = (photo.type || '').startsWith('image/')
    if (!photo.url) photo.url = await buildFileUrl(s3Key)
    if (!photo.cover) photo.cover = await buildCoverUrl(s3Key, isImage)
    if (!photo.preview) {
      const params = !isImage ? 'frame=0' : undefined
      const style = isImage ? config.previewStyle : undefined
      photo.preview = await buildFileUrl(s3Key, style, params)
    }
  }
  return photo
}

// Compute date category label (matches server's formatDateTitle)
function formatDateTitle(dateStr: string): string {
  const date = dayjs(dateStr)
  if (!date.isValid()) return ''
  if (date.isSame(dayjs(), 'day')) return '今天'
  if (date.isSame(dayjs().subtract(1, 'day'), 'day')) return '昨天'
  if (date.isSame(dayjs(), 'year')) return date.format('MM月DD日')
  return date.format('YYYY年MM月DD日')
}

// Helper: map local DB row to match server response shape
function mapPhoto(row: any): any {
  const lastModified = row.lastModified || row.last_modified || row.uploadDate || row.updated_at || new Date().toISOString()
  return {
    ...row,
    _id: row.id || row._id,
    isLiked: row.isLiked !== undefined ? row.isLiked : !!row.is_liked,
    albumId: row.albumId || [],
    username: row.username || 'local',
    uploadDate: row.uploadDate || row.updated_at || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || new Date().toISOString(),
    lastModified,
    category: formatDateTitle(lastModified),
    size: row.size ?? 0,
    width: row.width ?? 0,
    height: row.height ?? 0,
  }
}

function mapAlbum(row: any): any {
  const updatedAt = row.updatedAt || row.updated_at || ''
  return {
    ...row,
    _id: row.id || row._id,
    name: row.name || '',
    description: row.description || '',
    count: row.count ?? 0,
    style: row.style || 'small',
    tags: row.tags || [],
    cover: row.cover || '',
    coverKey: row.coverKey || '',
    createdAt: row.createdAt || row.created_at || updatedAt,
    updatedAt,
  }
}

// ==================== Auth ====================

export function login() {
  // Offline mode: no server auth needed
  return Promise.resolve({
    code: 0,
    data: {
      username: 'local',
      operator: 'local',
      isAdmin: false
    }
  })
}

export const checkLogin = login;

// ==================== User (disabled in offline) ====================

export function getUserList() {
  return Promise.resolve([])
}

export function addUser(_data: any) {
  return Promise.resolve({ code: 0 })
}

export function addOperator(_data: any) {
  return Promise.resolve({ code: 0 })
}

export function updatePassword(_data: any) {
  return Promise.resolve({ code: 0 })
}

// ==================== Upload ====================

export async function getUploadUrl(key: string) {
  // S3 upload still works in offline mode via native command
  // This is handled by the existing getUploadUrl in service/index.ts
  // which already routes to invoke('upload_token') when native upload is enabled
  throw new Error('Use native upload token in offline mode')
}

export async function addFileInfo(body: any) {
  const data = JSON.stringify({
    key: body.key,
    name: body.name,
    size: body.size,
    width: body.width,
    height: body.height,
    fileType: body.fileType,
    exif: body.exif,
    description: body.description || '',
    albumId: body.albumId || [],
    md5: body.md5 || '',
    bucket: body.bucket || '',
    username: 'local',
    uploadDate: new Date().toISOString(),
  })
  const added = await invoke<any>('db_photo_add', {
    id: crypto.randomUUID(),
    isLiked: body.likedMode || false,
    type: body.type || 'image/jpeg',
    lastModified: body.lastModified ? new Date(body.lastModified).toISOString() : new Date().toISOString(),
    md5: body.md5 || '',
    data,
  })
  if (body.albumId?.length) {
    await invoke('db_photo_set_albums', { photoId: added.id || added._id, albumIds: body.albumId })
    added.albumId = body.albumId
  }
  return enrichPhotoUrls(added)
}

export async function updateFileInfo(body: any) {
  const data = JSON.stringify({
    key: body.key,
    name: body.name,
    size: body.size,
    width: body.width,
    height: body.height,
    fileType: body.fileType,
    exif: body.exif,
    description: body.description || '',
    albumId: body.albumId || [],
    md5: body.md5 || '',
  })

  return invoke<any>('db_photo_update', {
    id: body.id,
    isLiked: body.likedMode !== undefined ? body.likedMode : undefined,
    type: body.type,
    lastModified: body.lastModified ? new Date(body.lastModified).toISOString() : undefined,
    md5: body.md5,
    data,
  }).then(enrichPhotoUrls)
}

// ==================== Photos ====================

export async function getPhotos(page: number, pageSize: number, options: {
  likedMode?: boolean,
  albumId?: string,
  isDelete?: boolean,
  type?: string,
  startDate?: string,
  endDate?: string
}) {
  const result = await invoke<any>('db_photo_list', {
    page,
    pageSize,
    likedMode: options.likedMode,
    albumId: options.albumId,
    isDelete: options.isDelete,
    // Server defaults to 'image' type filter when not specified
    typeFilter: options.type || undefined,
    startDate: options.startDate || undefined,
    endDate: options.endDate || undefined,
  })
  const mapped = await Promise.all((result.data || []).map(enrichPhotoUrls))
  return mapped
}

export async function updateDescription(id: string, description: string) {
  const existing = await invoke<any>('db_photo_update', {
    id,
    data: JSON.stringify({ description }),
  })
  return mapPhoto(existing)
}

export async function updateLike(id: string) {
  const existing = await invoke<any>('db_photo_toggle_like', { id })
  return mapPhoto(existing)
}

export async function updatePhotoAlbum(id: string, albumIds: string[]) {
  await invoke('db_photo_set_albums', { photoId: id, albumIds })
  return { code: 0 }
}

export async function updatePhotosAlbums(ids: string[], albumIds: string[]) {
  await invoke('db_photos_set_albums', { photoIds: ids, albumIds })
  return { code: 0 }
}

export async function deletePhoto(id: string, albumId?: string) {
  if (albumId) {
    await invoke('db_photo_remove_album', { photoId: id, albumId })
    return { code: 0 }
  }
  await invoke('db_photo_delete', { ids: [id] })
  return { code: 0 }
}

export async function deletePhotos(ids: string[], albumId?: string) {
  if (albumId) {
    for (const id of ids) {
      await invoke('db_photo_remove_album', { photoId: id, albumId })
    }
    return { code: 0 }
  }
  await invoke('db_photo_delete', { ids })
  return { code: 0 }
}

export async function restorePhotos(ids: string[]) {
  await invoke('db_photo_restore', { ids })
  return { code: 0 }
}

export async function getPhotoListInfo(options: {
  likedMode?: boolean,
  albumId?: string,
  isDelete?: boolean,
  type?: string,
  startDate?: string,
  endDate?: string
}) {
  const result = await invoke<any>('db_photo_list_info', {
    likedMode: options.likedMode,
    albumId: options.albumId,
    isDelete: options.isDelete,
    typeFilter: options.type || undefined,
    startDate: options.startDate || undefined,
    endDate: options.endDate || undefined,
  })
  return result.data || []
}

export async function checkDuplicateByMd5(md5: string) {
  const result = await invoke<any>('db_photo_check_duplicate', { md5 })
  return {
    isDuplicate: result.isDuplicate,
    existingPhoto: result.existingPhoto ? mapPhoto(result.existingPhoto) : undefined
  }
}

// ==================== Albums ====================

export async function getAlbums() {
  const result = await invoke<any>('db_album_list')
  const data = result.data || { large: [], small: [] }

  const enrichAlbum = async (row: any) => {
    const album = mapAlbum(row)
    if (!album.cover && album.coverKey) {
      album.cover = await buildCoverUrl(album.coverKey)
    }
    return album
  }

  const large = await Promise.all((data.large || []).map(enrichAlbum))
  const small = await Promise.all((data.small || []).map(enrichAlbum))
  return { large, small }
}

export async function createAlbum(name: string, description: string, isLarge: boolean, tags: string[]) {
  const now = new Date().toISOString()
  const result = await invoke<any>('db_album_create', {
    name,
    description,
    style: isLarge ? 'large' : 'small',
    tags,
    data: JSON.stringify({
      name,
      description,
      style: isLarge ? 'large' : 'small',
      tags,
      createdAt: now,
      updatedAt: now,
    }),
  })
  return mapAlbum(result)
}

export async function updateAlbum(id: string, options: {
  name: string,
  description: string,
  isLarge: boolean,
  tags: string[]
}) {
  const data = JSON.stringify({
    name: options.name,
    description: options.description,
    style: options.isLarge ? 'large' : 'small',
    tags: options.tags,
  })
  const result = await invoke<any>('db_album_update', { id, data })
  return mapAlbum(result)
}

export async function getAlbumInfo(id: string) {
  const result = await invoke<any>('db_album_get', { id })
  let album = mapAlbum(result)
  try {
    const albumList = await getAlbums()
    const enriched = [...(albumList.large || []), ...(albumList.small || [])]
      .find(item => item._id === album._id)
    if (enriched) {
      album = {
        ...album,
        ...enriched,
      }
    }
  } catch (e) {
    console.warn('[Local] enrich album info failed:', e)
  }
  if (!album.cover && album.coverKey) {
    album.cover = await buildCoverUrl(album.coverKey)
  }
  return album
}

export async function updateAlbumCover(id: string, key: string) {
  const result = await invoke<any>('db_album_update_cover', { id, key })
  return mapAlbum(result)
}

// ==================== Usage Records ====================

export async function addUsageRecord(data: {
  targetId: string,
  targetType: string,
  actionType: string,
  description?: string,
  data?: any
}) {
  return invoke('db_usage_record_add', {
    targetId: data.targetId,
    targetType: data.targetType,
    actionType: data.actionType,
    description: data.description,
    data: data.data ? JSON.stringify(data.data) : undefined,
  })
}

export async function getUsageRecords(targetId: string, options?: { targetType?: string, actionType?: string }) {
  const result = await invoke<any>('db_usage_record_list', {
    targetId,
    targetType: options?.targetType,
    actionType: options?.actionType,
  })
  return result.data || []
}

// ==================== Memorials ====================

export async function getMemorials() {
  const result = await invoke<any>('db_memorial_list')
  return (result.data || []).map((m: any) => ({
    ...m,
    _id: m.id || m._id,
    isPinned: !!m.isPinned,
    isLunar: !!m.isLunar,
  }))
}

export async function createMemorial(data: any) {
  const memorialData = JSON.stringify(data)
  const result = await invoke<any>('db_memorial_create', {
    id: crypto.randomUUID(),
    data: memorialData,
  })
  return { ...result, _id: result.id || result._id }
}

export async function updateMemorial(id: string, data: any) {
  const memorialData = JSON.stringify(data)
  return invoke('db_memorial_update', { id, data: memorialData })
}

export async function deleteMemorial(id: string) {
  return invoke('db_memorial_delete', { id })
}

export async function getMemorialCovers() {
  const result = await invoke<any>('db_memorial_covers')
  return result.data || []
}

// ==================== Check Update ====================

export async function checkUpdate(params: {
  currentVersion: string,
  platform: string
}) {
  return invoke<any>('check_update', {
    currentVersion: params.currentVersion,
    platform: params.platform,
  })
}

// ==================== Re-export sub-modules ====================
export * from './asset'
export * from './family'
export * from './weight'
export * from './bloodPressure'
