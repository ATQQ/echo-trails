import { isTauri } from "@/constants";
import { showNotify } from "vant";
// import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
// 检查是否为Android平台，因为Android需要特殊处理文件路径权限
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import SparkMD5 from 'spark-md5';
import { PromiseWithResolver } from "./util";
import ExifReader from "exifreader";
import { readFile, BaseDirectory, lstat } from '@tauri-apps/plugin-fs';

export function generateFileKey(fileInfo: FileInfoItem) {
  // 年-月-日/时分/上传时间-文件名
  const year = fileInfo.date.getFullYear();
  const month = (fileInfo.date.getMonth() + 1).toString().padStart(2, '0');
  const day = fileInfo.date.getDate().toString().padStart(2, '0');
  const hour = fileInfo.date.getHours().toString().padStart(2, '0');
  const minute = fileInfo.date.getMinutes().toString().padStart(2, '0');
  const second = fileInfo.date.getSeconds().toString().padStart(2, '0');
  const uploadTime = new Date().getTime()
  const { operator = 'unknow', username = 'unknow' } = JSON.parse(localStorage.getItem('userInfo') || '{}')

  const typeSplit = fileInfo.file.type.split('/')[0]
  const keySuffix = `${username}/${operator}/${year}-${month}-${day}/${hour}-${minute}-${second}-${uploadTime}-${fileInfo.name}`

  // 视频类型 前缀/video/原视频时间年-月-日/时分秒-上传时间戳-原文件名
  if (typeSplit === 'video') {
    return `${import.meta.env.VITE_S3_PREFIX}/video/${keySuffix}`
  }
  // 前缀/原图时间年-月-日/时分秒-上传时间戳-原文件名
  return `${import.meta.env.VITE_S3_PREFIX}/${keySuffix}`
}


export function formatSize(
  size: number,
  pointLength?: number,
  units?: string[],
) {
  let unit
  units = units || ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  // eslint-disable-next-line no-cond-assign
  while ((unit = units.shift()) && size > 1024) {
    size /= 1024
  }
  return (
    (unit === 'B'
      ? size
      : size.toFixed(pointLength === undefined ? 2 : pointLength)) + unit!
  )
}

export function downloadFile(url: string, name: string, isImage: boolean = true) {
  const { promise, resolve, reject } = PromiseWithResolver()
  if (isTauri) {
    // 添加保存到相册的功能
    // 创建一个函数来处理保存到相册
    const saveToGallery = async () => {
      try {
        // 使用Tauri的API保存到相册
        const response = await tauriFetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        // 保存到相册目录
        // TODO: 可以优化 使用 Rust 写入系统相册
        const filePath = await invoke('save_to_pictures', {
          fileName: name,
          data: Array.from(uint8Array)
        });
        // console.log('filePath', filePath);
        // await writeFile(name, uint8Array, { baseDir: BaseDirectory.Picture });
        showNotify?.({ type: 'success', message: '已保存到相册' });
        resolve(name)
      } catch (error) {
        console.error('保存到相册失败:', error);
        showNotify?.({ type: 'danger', message: '保存到相册失败' });
        resolve(name)
      }
    };
    saveToGallery()
  } else {
    // 图片文件下载
    if (isImage) {
      const img = new Image()
      img.src = url
      img.onload = () => {
        const a = document.createElement('a')
        a.href = img.src
        a.download = name
        a.click()
      }
    } else {
      // 其它类型文件下载
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
    }
    resolve(name)
  }
  return promise
}

// 实现一个方法生成用于下载文件的文件名
export function generateDownloadFileName(name: string, type: string) {
  const typeSplits = type.split('/')
  // 原文件名拼上时间戳
  const newName = `${Date.now()}-${name}`
  // 如果文件没有后缀 则添加对应文件格式的后缀
  if (!name.includes('.')) {
    return `${newName}.${typeSplits[typeSplits.length - 1]}`
  }
  return newName
}

export function getFileMd5Hash(file: File) {
  return new Promise((resolve, reject) => {
    const blobSlice = File.prototype.slice
    const chunkSize = 2097152 // Read in chunks of 2MB
    const chunks = Math.ceil(file.size / chunkSize)
    let currentChunk = 0
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()

    function loadNext() {
      const start = currentChunk * chunkSize
      const end = start + chunkSize >= file.size ? file.size : start + chunkSize

      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end))
    }
    fileReader.onload = function (e) {
      // console.log('read chunk nr', currentChunk + 1, 'of', chunks)
      spark.append(e?.target?.result as ArrayBuffer) // Append array buffer
      currentChunk += 1

      if (currentChunk < chunks) {
        loadNext()
      }
      else {
        // console.log('finished loading')
        const hashResult = spark.end()
        // console.info('computed hash', hashResult) // Compute hash
        resolve(hashResult)
      }
    }

    fileReader.onerror = function () {
      reject(new Error('oops, something went wrong.'))
    }

    loadNext()
  })
}

export const getImageDimensions = (file: File | Blob): Promise<{ width: number, height: number }> => {
  return new Promise((resolve) => {
    const imgUrl = URL.createObjectURL(file)
    const img = new Image()
    img.src = imgUrl
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(imgUrl)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(imgUrl)
    }
  })
}

export const getVideoInfo = (file: File | Blob | string): Promise<{ width: number, height: number, cover: string }> => {
  return new Promise((resolve) => {
    let videoUrl = ''
    if (typeof file === 'string') {
      videoUrl = file
    } else {
      videoUrl = URL.createObjectURL(file)
    }

    const video = document.createElement('video')
    video.src = videoUrl
    video.muted = true
    video.currentTime = 0.1 // Seek to capture frame
    video.preload = 'auto'

    // Helper to cleanup
    const cleanup = () => {
      if (typeof file !== 'string') {
        URL.revokeObjectURL(videoUrl)
      }
      video.remove()
    }

    video.onloadeddata = () => {
      // Ensure we have dimensions
    }

    video.onseeked = () => {
      try {
        const width = video.videoWidth
        const height = video.videoHeight
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(video, 0, 0, width, height)
        const cover = canvas.toDataURL('image/jpeg', 0.7)
        resolve({ width, height, cover })
      } catch (e) {
        console.error('Failed to generate video cover', e)
        resolve({ width: 0, height: 0, cover: '' })
      } finally {
        cleanup()
      }
    }

    video.onerror = () => {
      resolve({ width: 0, height: 0, cover: '' })
      cleanup()
    }
  })
}

export function getImageExif(file: any) {
  try {
    return ExifReader.load(file)
  } catch {
    return {}
  }
}

export function filePath2Name(filePath: string) {
  return decodeURIComponent(filePath).split('/').pop()
}


export function getFileInfo(filePath: string) {
  return invoke<{ last_modified: number, creation_time: number, width: number, height: number, file_type: string, md5?: string, size: number }>('get_file_info', { filePath })
}


/**
 * 尝试获取原生文件信息（尺寸、修改时间、MD5等）
 * 优先使用 Rust Bridge，失败则降级到 fs.lstat
 */
async function getNativeFileInfo(filePath: string) {
  const result = {
    lastModified: 0,
    width: 0,
    height: 0,
    fileType: '',
    md5: '',
    size: 0
  }

  try {
    const info = await getFileInfo(filePath)
    if (info) {
      if (info.last_modified > 0) result.lastModified = info.last_modified
      if (info.width > 0 && info.height > 0) {
        result.width = info.width
        result.height = info.height
      }
      result.fileType = info.file_type
      if (info.md5) result.md5 = info.md5
      if (info.size) result.size = info.size
    }
  } catch (e) {
    console.error('Failed to get file info via Rust:', e)
    // Fallback to lstat if bridge fails
    try {
      const fileInfo = await lstat(filePath, { baseDir: BaseDirectory.Resource })
      if (fileInfo.mtime) {
        result.lastModified = +fileInfo.mtime
      }
      if (fileInfo.size) {
        result.size = fileInfo.size
      }
    } catch (lstatError) {
      console.error('Failed to lstat file:', lstatError)
    }
  }
  return result
}

/**
 * 从 EXIF 信息中解析拍摄时间
 */
function getExifDate(exif: any): Date | null {
  if (!exif?.['DateTimeOriginal']?.description) return null

  const dateStr = exif['DateTimeOriginal'].description
  // 格式通常为 "YYYY:MM:DD HH:MM:SS"
  const parts = dateStr.split(' ');
  if (parts.length >= 2) {
    const dateParts = parts[0].split(':');
    if (dateParts.length === 3) {
      const timeStr = parts[1];
      return new Date(`${dateParts.join('-')}T${timeStr}`);
    }
  }
  return null
}

export async function parseNativeImageFileUploadInfo(filePath: string) {
  try {
    // 1. 获取基础文件信息
    const nativeInfo = await getNativeFileInfo(filePath)

    // 2. 读取文件内容
    const _file = await readFile(filePath, { baseDir: BaseDirectory.Resource })
    const buffer = _file.buffer
    const fileType = nativeInfo.fileType || 'image/jpeg'

    // 3. 解析 EXIF
    const exif = await getImageExif(buffer) as any
    const exifDate = getExifDate(exif)

    // 4. 确定最终时间: EXIF > Native/lstat > Current
    const lastModified = +(exifDate || nativeInfo.lastModified || new Date())

    // 5. 构建 File 对象
    const originalName = filePath2Name(filePath) || 'unknown'
    // 使用 File 构造函数代替 Blob + Object.assign
    const file = new File([buffer], originalName, {
      type: fileType,
      lastModified: lastModified,
    })

    // 6. 回填 Native 获取到的宽高到 EXIF (如果 EXIF 缺失)
    if (nativeInfo.width > 0 && !exif['Image Width']) exif['Image Width'] = { value: nativeInfo.width }
    if (nativeInfo.height > 0 && !exif['Image Height']) exif['Image Height'] = { value: nativeInfo.height }
    if (nativeInfo.fileType && !exif['FileType']) exif['FileType'] = { value: nativeInfo.fileType }

    return {
      file,
      name: originalName,
      md5: nativeInfo.md5,
      width: nativeInfo.width,
      height: nativeInfo.height,
      fileType: nativeInfo.fileType,
      lastModified,
      date: new Date(lastModified),
      objectUrl: URL.createObjectURL(file),
      exif,
    }
  } catch (e) {
    console.error('Failed to read file content before upload:', e)
    return undefined
  }
}

export async function parseNativeVideoFileUploadInfo(filePath: string) {
  try {
    // 1. 获取基础文件信息
    const nativeInfo = await getNativeFileInfo(filePath)

    // 2. 避免读取完整文件，使用 convertFileSrc 获取流式 URL
    // const _file = await readFile(filePath, { baseDir: BaseDirectory.Resource })
    // const buffer = _file.buffer
    const assetUrl = convertFileSrc(filePath)
    const fileType = nativeInfo.fileType || 'video/mp4'

    // 3. 确定时间
    const lastModified = nativeInfo.lastModified || new Date().getTime()

    // 4. 构建 File 对象 (内容为空，但修正 size)
    const originalName = filePath2Name(filePath) || 'unknown'
    const file = new File([], originalName, {
      type: fileType,
      lastModified: lastModified,
    })

    // 修正 file.size
    if (nativeInfo.size > 0) {
      Object.defineProperty(file, 'size', { value: nativeInfo.size, writable: false })
    }

    // 5. 获取宽高和封面 (如果 Native 没返回)
    let width = nativeInfo.width
    let height = nativeInfo.height
    let cover = assetUrl

    if (width === 0 || height === 0) {
      const info = await getVideoInfo(assetUrl)
      width = info.width
      height = info.height
      cover = info.cover
    }

    const exif: any = {
      'Image Width': { value: width },
      'Image Height': { value: height },
      'FileType': { value: fileType },
    }

    return {
      file,
      md5: nativeInfo.md5,
      width,
      height,
      fileType,
      lastModified,
      date: new Date(lastModified),
      objectUrl: assetUrl,
      exif,
      cover
    }
  } catch (e) {
    console.error('Failed to read video file:', e)
    return undefined
  }
}

/**
 * 确保文件上传信息完整
 * 1. 确保 EXIF 存在
 * 2. 补全宽/高 (EXIF -> Web Fallback)
 * 3. 补全 MD5
 */
export async function ensureUploadInfo(value: Partial<FileInfoItem> & { file: File }) {
  const { file } = value

  // 1. 确保 EXIF
  value.exif = value.exif || await getImageExif(file) as any

  // 2. 确定宽高: EXIF > Native(已在exif中) > Web Image
  let width = 0
  let height = 0

  if (value.exif?.['Image Width']) width = value.exif['Image Width'].value
  if (value.exif?.['Image Height']) height = value.exif['Image Height'].value

  // Fallback to Web Image if missing
  if (!width || !height) {
    const dim = await getImageDimensions(file)
    width = dim.width
    height = dim.height
  }

  // 回填 EXIF
  if (!value.exif['Image Width']) value.exif['Image Width'] = { value: width }
  else value.exif['Image Width'].value = width

  if (!value.exif['Image Height']) value.exif['Image Height'] = { value: height }
  else value.exif['Image Height'].value = height

  // 3. 确保 MD5
  if (!value.md5) {
    value.md5 = await getFileMd5Hash(file) as string
  }

  return value as FileInfoItem
}

export async function ensureVideoUploadInfo(value: Partial<FileInfoItem> & { file: File }) {
  const { file } = value
  let width = value.width || 0
  let height = value.height || 0
  let cover = (value as any).cover

  // 1. 确保获取视频宽高和封面
  // 如果没有宽高或者没有封面，尝试获取
  if (width === 0 || height === 0 || !cover) {
    const info = await getVideoInfo(file)
    if (width === 0) width = info.width
    if (height === 0) height = info.height
    if (!cover) cover = info.cover
  }

  // 2. 确保 EXIF 有宽高 (为了兼容后端字段)
  value.exif = value.exif || {}
  if (!value.exif['Image Width']) value.exif['Image Width'] = { value: width }
  else value.exif['Image Width'].value = width

  if (!value.exif['Image Height']) value.exif['Image Height'] = { value: height }
  else value.exif['Image Height'].value = height

  // 3. 确保 MD5
  if (!value.md5) {
    value.md5 = (await getFileMd5Hash(file)) as string
  }

  // 4. 更新 value 中的属性
  value.width = width
  value.height = height
  ;(value as any).cover = cover

  return value as FileInfoItem
}
