import { api } from "@/lib/request";
import ky from "ky";

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

export function addFileInfo(body: {
  key: string,
  exif: any,
  name: string,
  lastModified: number,
  size: number,
  type: string,
}) {
  return api.post<ServerResponse<Photo>>('file/add/info', {
    json: body
  }).json().then(((v: any) => v.data))
}

export function uploadFile(file: File, url: string) {
  return ky.put(url, {
    body: file
  })
}

export function getPhotos(page: number, pageSize: number, options:{
  likedMode: boolean,
}) {
  return api.get<ServerResponse<Photo[]>>('file/photo/list', {
    searchParams: {
      page,
      pageSize,
      likedMode: options.likedMode
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

export function updateLike(id: string){
  return api.put<ServerResponse<Photo>>('file/photo/update/like', {
    json: {
      id
    }
  })
}
