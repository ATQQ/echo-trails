import { api } from "@/lib/request";
import ky from "ky";

export function getUploadUrl(key: string) {
  return api
    .get<{
      url: string
    }>('file/upload/token', {
      searchParams:{
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
}){
  return api.post('file/add/info',{
    json: body
  })
}

export function uploadFile(file: File, url: string) {
  return ky.put(url, {
    body: file
  })
}
