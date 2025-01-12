import { api } from "@/lib/request";
import ky from "ky";

export function login() {
  return api.post<ServerResponse>('check')
}

export function getUploadUrl(key: string) {
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

export function uploadFile(file: File, url: string) {
  return ky.put(url, {
    body: file
  })
}

export function getPhotos(page: number, pageSize: number, options: {
  likedMode?: boolean,
  albumId?: string,
}) {
  return api.get<ServerResponse<Photo[]>>('file/photo/list', {
    searchParams: {
      page,
      pageSize,
      ...(options.likedMode ? { likedMode: true } : {}),
      ...(options.albumId ? { albumId: options.albumId } : {}),
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

export function getPhotoListInfo(options: {
  likedMode?: boolean,
  albumId?: string,
}) {
  return api.get<ServerResponse<InfoItem[]>>('file/photo/listInfo', {
    searchParams: {
      ...(options.likedMode ? { likedMode: true } : {}),
      ...(options.albumId ? { albumId: options.albumId } : {}),
    }
  }).json()
    .then((v) => {
      return v.data
    })
}
