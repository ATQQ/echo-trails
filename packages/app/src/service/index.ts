import { api } from "@/lib/request";
import ky from "ky";
import { isTauri } from "@/constants";
import { invoke } from "@tauri-apps/api/core";
import { isNativeUploadTokenEnabled } from "@/composables/useUploadTokenConfig";
import { getBitifulConfigLocal } from "@/lib/bitifulConfig";
import { showConfirmDialog } from "vant";
import router from "@/router";

export function checkServiceHealth(baseUrl: string) {
  return ky.get(`${baseUrl}/api/ping`,{
    timeout: 5000,
  }).json()
}

export function login() {
  return api.post<ServerResponse<{
    username: string
    operator: string
    isAdmin: boolean
  }>>('check').json()
}

export const checkLogin = login;

export interface User {
  username: string
  operators: { name: string, isSystem: boolean }[]
  isSystem: boolean
}

export function getUserList() {
  return api.get<ServerResponse<User[]>>('user/list').json().then(v => v.data)
}

export function addUser(data: { username: string, operator: string, token: string }) {
  return api.post<ServerResponse>('user/add', { json: data }).json()
}

export function addOperator(data: { username: string, operator: string, token: string }) {
  return api.post<ServerResponse>('user/operator/add', { json: data }).json()
}

export function updatePassword(data: { username: string, operator: string, token: string }) {
  return api.post<ServerResponse>('user/password', { json: data }).json()
}

export async function getUploadUrl(key: string) {
  if (isTauri && isNativeUploadTokenEnabled.value) {
    const config = await getBitifulConfigLocal();
    console.log('config', config);

    if (!config || !config.bucket || !config.region || !config.endpoint || !config.accessKey || !config.secretKey) {
      showConfirmDialog({
        title: '未配置 S3 参数',
        message: '原生生成上传 Token 需要配置 Bitiful(S3) 参数，是否前往配置？',
        confirmButtonText: '去配置',
        cancelButtonText: '取消',
      }).then(() => {
        router.push('/set');
      }).catch(() => {
        // 取消
      });
      throw new Error('未配置 Bitiful (S3) 参数，无法在 Native 生成上传 Token');
    }

    return invoke('upload_token', {
      key,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    }).then((v: any) => {
      return v.url
    })
  }

  return api
    .get<{
      url: string
      code: number
      message?: string
    }>('file/upload/token', {
      searchParams: {
        key
      }
    })
    .json()
    .then((v) => {
      return v.url
    })
}

export function addFileInfo(body: UploadInfo) {
  return api.post<ServerResponse<Photo>>('file/add/info', {
    json: body
  }).json().then(((v: any) => v.data))
}

export function updateFileInfo(body: Partial<UploadInfo> & { id: string }) {
  return api.put<ServerResponse<Photo>>('file/update/info', {
    json: body
  }).json().then(((v: any) => v.data))
}

export function uploadFile(file: File, url: string, onProgress?: (progress: number) => void) {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // 上传进度监听
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.floor((event.loaded / event.total) * 100)
          onProgress(percent)
        }
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(new Response(xhr.response, {
          status: xhr.status,
          statusText: xhr.statusText
        }))
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'))
    })

    xhr.open('PUT', url)
    xhr.send(file)
  })
}

export function getPhotos(page: number, pageSize: number, options: {
  likedMode?: boolean,
  albumId?: string,
  isDelete?: boolean,
  type?: string,
  startDate?: string,
  endDate?: string
}) {
  return api.get<ServerResponse<Photo[]>>('file/photo/list', {
    searchParams: {
      page,
      pageSize,
      ...(options.likedMode ? { likedMode: true } : {}),
      ...(options.albumId ? { albumId: options.albumId } : {}),
      ...(options.isDelete ? { isDelete: true } : {}),
      ...(options.type ? { type: options.type } : {}),
      ...(options.startDate ? { startDate: options.startDate } : {}),
      ...(options.endDate ? { endDate: options.endDate } : {})
    }
  }).json()
    .then((v) => {
      return v.data
    })
}

export function updateDescription(id: string, description: string) {
  return api.put<ServerResponse<Photo>>('file/photo/update/description', {
    json: {
      id,
      description
    }
  })
}

export function updateLike(id: string) {
  return api.put<ServerResponse<Photo>>('file/photo/update/like', {
    json: {
      id
    }
  })
}

export function updatePhotoAlbum(id: string, albumIds: string[]) {
  return api.put<ServerResponse<Photo>>('file/photo/update/album', {
    json: {
      id,
      albumIds
    }
  })
}

export function updatePhotosAlbums(ids: string[], albumIds: string[]) {
  return api.put<ServerResponse>('file/photos/update/albums', {
    json: {
      ids,
      albumIds
    }
  })
}


export function getAlbums() {
  return api.get<ServerResponse<{
    large: Album[],
    small: Album[]
  }>>('album/list').json().then((v) => v.data)
}

export function createAlbum(name: string, description: string, isLarge: boolean, tags: string[]) {
  return api.post<ServerResponse<Album>>('album/create', {
    json: {
      name,
      description,
      isLarge,
      tags
    }
  })
}

export function updateAlbum(id: string, options: {
  name: string,
  description: string,
  isLarge: boolean,
  tags: string[]
}) {
  return api.put<ServerResponse<Album>>('album/update', {
    json: {
      id,
      ...options
    }
  })
}

export function getAlbumInfo(id: string) {
  return api.get<ServerResponse<Album>>('album/info', {
    searchParams: {
      id
    }
  }).json().then((v) => v.data)
}


export function updateAlbumCover(id: string, key: string) {
  return api.put<ServerResponse<Album>>('album/update/cover', {
    json: {
      id,
      key
    }
  })
}

export function deletePhoto(id: string, albumId?: string) {
  return api.delete<ServerResponse>('file/photo/delete', {
    json: {
      id,
      albumId
    }
  })
}

export function deletePhotos(ids: string[], albumId?: string) {
  return api.delete<ServerResponse>('file/photos/delete', {
    json: {
      ids,
      albumId
    }
  })
}

export function restorePhotos(ids: string[]) {
  return api.put<ServerResponse>('file/photos/restore', {
    json: {
      ids
    }
  })
}

export function getPhotoListInfo(options: {
  likedMode?: boolean,
  albumId?: string,
  isDelete?: boolean,
  type?: string,
  startDate?: string,
  endDate?: string
}) {
  return api.get<ServerResponse<InfoItem[]>>('file/photo/listInfo', {
    searchParams: {
      ...(options.likedMode ? { likedMode: true } : {}),
      ...(options.albumId ? { albumId: options.albumId } : {}),
      ...(options.isDelete ? { isDelete: true } : {}),
      ...(options.type ? { type: options.type } : {}),
      ...(options.startDate ? { startDate: options.startDate } : {}),
      ...(options.endDate ? { endDate: options.endDate } : {})
    }
  }).json()
    .then((v) => {
      return v.data
    })
}

export function checkDuplicateByMd5(md5: string) {
  return api.get<ServerResponse<{
    isDuplicate: boolean,
    existingPhoto?: Photo
  }>>('file/check/duplicate', {
    searchParams: {
      md5
    }
  }).json().then((v) => v.data)
}

export function addUsageRecord(data: {
  targetId: string,
  targetType: string,
  actionType: string,
  description?: string,
  data?: any
}) {
  return api.post<ServerResponse>('usageRecord/add', { json: data }).json();
}

export function getUsageRecords(targetId: string, options?: { targetType?: string, actionType?: string }) {
  return api.get<ServerResponse<any[]>>(`usageRecord/list/${targetId}`, {
      searchParams: options as any
  }).json().then(v => v.data);
}

// --- Memorial API ---
export function getMemorials() {
    return api.get<ServerResponse<any[]>>('memorial/list').json().then(v => v.data);
}

export function createMemorial(data: any) {
    return api.post<ServerResponse<any>>('memorial/create', { json: data }).json().then(v => v.data);
}

export function updateMemorial(id: string, data: any) {
    return api.put<ServerResponse<any>>('memorial/update', { json: { id, ...data } }).json();
}

export function deleteMemorial(id: string) {
    return api.delete<ServerResponse<any>>('memorial/delete', { json: { id } }).json();
}

export function getMemorialCovers() {
    return api.get<ServerResponse<string[]>>('memorial/covers').json().then(v => v.data);
}
