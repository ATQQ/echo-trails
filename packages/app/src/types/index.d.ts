interface Photo {
  _id: string
  url: string
  cover: string
  preview: string
  username: string
  fileType: string
  type: string
  key: string
  uploadDate: string
  lastModified: string
  name: string
  size: number
  category: string
  width: number
  height: number
  isLiked: boolean
  albumId?: string[]
  description?: string
  isRepeat?: boolean
}

type ServerResponse<T = any> = {
  code?: number
  message?: string
  data: T
}

interface Album {
  _id: string
  name: string
  description: string
  count: number
  cover: string
  coverKey: string
  style: 'large' | 'small'
}

interface InfoItem {
  title: string
  value: string
  label?: string
}

interface FileInfoItem {
  file: File
  objectUrl: string
  name: string
  lastModified: number
  date: Date
  exif: any
  md5?: string
  repeat?: boolean
  width?: number
  height?: number
}

interface UploadInfo {
  key: string
  name: string
  lastModified: number
  exif: any
  size: number
  type: string
  likedMode: boolean
  md5?: string
  albumId?: string[]
}
