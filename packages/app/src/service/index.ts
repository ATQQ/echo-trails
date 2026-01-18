import { isTauri } from "@/constants";
import { api } from "@/lib/request";
import { invoke } from '@tauri-apps/api/core';

import ky from "ky";

export function checkServiceHealth(baseUrl: string) {
  return ky.get(`${baseUrl}/api/ping`).json()
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

export function getUploadUrl(key: string) {
  // if (isTauri) {
  //   return invoke('upload_token', {
  //     key
  //   }).then((v: any) => {
  //     console.log(v);
  //     return v.url
  //   })
  // }

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
  isDelete?: boolean
}) {
  return api.get<ServerResponse<Photo[]>>('file/photo/list', {
    searchParams: {
      page,
      pageSize,
      ...(options.likedMode ? { likedMode: true } : {}),
      ...(options.albumId ? { albumId: options.albumId } : {}),
      ...(options.isDelete ? { isDelete: true } : {})
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

export function createAlbum(name: string, description: string, isLarge: boolean) {
  return api.post<ServerResponse<Album>>('album/create', {
    json: {
      name,
      description,
      isLarge
    }
  })
}

export function updateAlbum(id: string, options: {
  name: string,
  description: string,
  isLarge: boolean
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

export function deletePhoto(id: string) {
  return api.delete<ServerResponse>('file/photo/delete', {
    json: {
      id
    }
  })
}

export function deletePhotos(ids: string[]) {
  return api.delete<ServerResponse>('file/photos/delete', {
    json: {
      ids
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
  isDelete?: boolean
}) {
  return api.get<ServerResponse<InfoItem[]>>('file/photo/listInfo', {
    searchParams: {
      ...(options.likedMode ? { likedMode: true } : {}),
      ...(options.albumId ? { albumId: options.albumId } : {}),
      ...(options.isDelete ? { isDelete: true } : {})
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
