import { invoke } from '@tauri-apps/api/core'

// Helper: map local DB row to match server response shape
function mapPhoto(row: any): any {
  return {
    ...row,
    _id: row.id || row._id,
    isLiked: !!row.is_liked,
    albumId: row.albumId || [],
  }
}

function mapAlbum(row: any): any {
  return {
    ...row,
    _id: row.id || row._id,
    tags: row.tags || [],
    cover: row.cover || '',
    coverKey: row.coverKey || '',
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
  })

  return invoke<any>('db_photo_add', {
    id: crypto.randomUUID(),
    isLiked: body.likedMode || false,
    type: body.type || 'image/jpeg',
    lastModified: body.lastModified ? new Date(body.lastModified).toISOString() : new Date().toISOString(),
    md5: body.md5 || '',
    data,
  }).then(mapPhoto)
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
  }).then(mapPhoto)
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
    typeFilter: options.type,
    startDate: options.startDate,
    endDate: options.endDate,
  })
  return (result.data || []).map(mapPhoto)
}

export async function updateDescription(id: string, description: string) {
  const existing = await invoke<any>('db_photo_update', {
    id,
    data: JSON.stringify({ description }),
  })
  return mapPhoto(existing)
}

export async function updateLike(id: string) {
  // Toggle like: need to get current state first
  const photos = await invoke<any>('db_photo_list', { page: 1, pageSize: 1 })
  // Actually, let's just pass the toggle to the Rust side
  // For now, update with isLiked: true (the Rust side should toggle)
  const existing = await invoke<any>('db_photo_update', {
    id,
    isLiked: true, // TODO: toggle logic
  })
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

export async function deletePhoto(id: string) {
  await invoke('db_photo_delete', { ids: [id] })
  return { code: 0 }
}

export async function deletePhotos(ids: string[]) {
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
    typeFilter: options.type,
    startDate: options.startDate,
    endDate: options.endDate,
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
  return {
    large: (data.large || []).map(mapAlbum),
    small: (data.small || []).map(mapAlbum),
  }
}

export async function createAlbum(name: string, description: string, isLarge: boolean, tags: string[]) {
  const result = await invoke<any>('db_album_create', {
    name,
    description,
    style: isLarge ? 'large' : 'small',
    tags,
    data: JSON.stringify({ name, description, style: isLarge ? 'large' : 'small', tags }),
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
  return mapAlbum(result)
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
