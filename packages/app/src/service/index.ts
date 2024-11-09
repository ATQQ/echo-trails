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

export function getPhotos(page: number, pageSize: number){
  return api.get<ServerResponse<Photo[]>>('file/photo/list', {
    searchParams: {
      page,
      pageSize
    }
  }).json()
    .then((v) => {
      return v.data
    })
}
