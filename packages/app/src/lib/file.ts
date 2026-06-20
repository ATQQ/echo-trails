import { isTauri } from "@/constants";
import { showNotify } from "vant";
// import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
// 检查是否为Android平台，因为Android需要特殊处理文件路径权限
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import SparkMD5 from 'spark-md5';
import { livePhotoDebug } from '@/lib/livePhoto'
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

  while ((unit = units.shift()) && size > 1024) {
    size /= 1024
  }
  return (
    (unit === 'B'
      ? size
      : size.toFixed(pointLength === undefined ? 2 : pointLength)) + unit!
  )
}

export function downloadFile(url: string | Blob, name: string, isImage: boolean = true) {
  const { promise, resolve, reject } = PromiseWithResolver()
  if (isTauri) {
    // 添加保存到相册的功能
    // 创建一个函数来处理保存到相册
    const saveToGallery = async () => {
      try {
        let uint8Array: Uint8Array;

        if (url instanceof Blob) {
          const arrayBuffer = await url.arrayBuffer();
          uint8Array = new Uint8Array(arrayBuffer);
        } else {
          // 使用Tauri的API保存到相册
          const response = await tauriFetch(url);
          const arrayBuffer = await response.arrayBuffer();
          uint8Array = new Uint8Array(arrayBuffer);
        }

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
      let src = '';
      if (url instanceof Blob) {
        src = URL.createObjectURL(url);
      } else {
        src = url;
      }

      const img = new Image()
      img.src = src
      img.onload = () => {
        const a = document.createElement('a')
        a.href = img.src
        a.download = name
        a.click()
        if (url instanceof Blob) {
          URL.revokeObjectURL(src);
        }
      }
    } else {
      // 其它类型文件下载
      const a = document.createElement('a')
      if (url instanceof Blob) {
        a.href = URL.createObjectURL(url);
      } else {
        a.href = url;
      }
      a.download = name
      a.click()
      if (url instanceof Blob) {
        URL.revokeObjectURL(a.href);
      }
    }
    resolve(name)
  }
  return promise
}

function getLivePhotoBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/\s+/g, '_')
}

function getImageExtension(photo: Photo) {
  const name = photo.name.toLowerCase()
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'heic'
  if (name.endsWith('.png')) return 'png'
  if (name.endsWith('.webp')) return 'webp'
  return 'jpg'
}

function getVideoExtension(videoUrl: string, liveVideoKey?: string) {
  const key = liveVideoKey || videoUrl
  if (/\.mov/i.test(key)) return 'mov'
  return 'mp4'
}

async function fetchAsUint8Array(url: string): Promise<Uint8Array> {
  const response = isTauri ? await tauriFetch(url) : await fetch(url)
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

export async function downloadLivePhoto(photo: Photo, imageUrl?: string) {
  const videoUrl = photo.liveVideoUrl
  if (!videoUrl) {
    showNotify?.({ type: 'warning', message: '未找到 Live Photo 动态视频' })
    return
  }

  const baseName = getLivePhotoBaseName(photo.name)
  const imageExt = getImageExtension(photo)
  const videoExt = getVideoExtension(videoUrl, photo.liveVideoKey)
  const stillUrl = imageUrl || photo.url || photo.preview

  try {
    if (isTauri) {
      const [imageData, videoData] = await Promise.all([
        fetchAsUint8Array(stillUrl),
        fetchAsUint8Array(videoUrl),
      ])
      await invoke('save_to_pictures', {
        fileName: `${baseName}.${imageExt}`,
        data: Array.from(imageData),
      })
      await invoke('save_to_pictures', {
        fileName: `${baseName}.${videoExt}`,
        data: Array.from(videoData),
      })
      showNotify?.({ type: 'success', message: 'Live Photo 已保存到相册' })
      return
    }

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const [imageData, videoData] = await Promise.all([
      fetchAsUint8Array(stillUrl),
      fetchAsUint8Array(videoUrl),
    ])
    zip.file(`${baseName}.${imageExt}`, imageData)
    zip.file(`${baseName}.${videoExt}`, videoData)
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${baseName}-live-photo.zip`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (error) {
    console.error('downloadLivePhoto failed:', error)
    showNotify?.({ type: 'danger', message: 'Live Photo 下载失败' })
    throw error
  }
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

export function getImageExif(file: any): any {
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
    size: 0,
    creationTime: 0
  }

  try {
    const info = await getFileInfo(filePath)
    if (info) {
      if (info.last_modified > 0) result.lastModified = info.last_modified
      if (info.creation_time > 0) result.creationTime = info.creation_time
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
  const candidates = [
    exif?.['DateTimeOriginal'],
    exif?.['DateTimeDigitized'],
    exif?.['DateTime'],
    exif?.['CreateDate'],
    exif?.['SubSecDateTimeOriginal'],
  ]

  for (const tag of candidates) {
    const rawValue = tag?.description || tag?.value
    if (!rawValue) continue

    const dateStr = String(rawValue).trim()
    // 格式通常为 "YYYY:MM:DD HH:MM:SS"
    const parts = dateStr.split(' ')
    if (parts.length >= 2) {
      const dateParts = parts[0].split(':')
      if (dateParts.length === 3) {
        const timeStr = parts[1]
        const parsed = new Date(`${dateParts.join('-')}T${timeStr}`)
        if (!Number.isNaN(parsed.getTime())) {
          return parsed
        }
      }
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
    const exif: any = await getImageExif(buffer) as any
    const exifDate: Date | null = getExifDate(exif)

    // 4. 确定最终时间: JS EXIF > Native/MediaStore 时间 > Native creationTime > Current
    const lastModified = +(exifDate || nativeInfo.lastModified || nativeInfo.creationTime || new Date())

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
 * 4. 从 EXIF 补全拍摄时间
 */
export async function ensureUploadInfo(value: Partial<FileInfoItem> & { file: File }) {
  const { file } = value

  // 1. 确保 EXIF
  value.exif = value.exif || await getImageExif(file) as any

  // 从 EXIF 解析时间，与原生模式和远程保持一致
  const exifDate = getExifDate(value.exif)
  if (exifDate) {
    value.lastModified = +exifDate
    value.date = exifDate
  } else if (!value.lastModified) {
    value.lastModified = file.lastModified || Date.now()
    value.date = new Date(value.lastModified)
  }

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

  if (!value.lastModified) {
    value.lastModified = file.lastModified || Date.now()
    value.date = new Date(value.lastModified)
  }

  return value as FileInfoItem
}

/**
 * Tauri / Desktop 端：调用 Rust 命令查找同名的 MOV/MP4 配对（Apple Live Photo）
 */
export function parseLivePhotoPair(filePath: string) {
  livePhotoDebug('native.parse_live_photo.invoke', { filePath })
  return invoke<{ video_path: string, content_id: string, duration: number, video_size?: number } | null>(
    'parse_live_photo',
    { filePath }
  ).then((result) => {
    livePhotoDebug('native.parse_live_photo.response', {
      filePath,
      hit: !!(result?.video_path),
      video_path: result?.video_path,
      content_id: result?.content_id,
      duration: result?.duration,
      video_size: result?.video_size,
    })
    return result
  }).catch((e) => {
    livePhotoDebug('native.parse_live_photo.error', { filePath, error: String(e) })
    console.warn('parse_live_photo failed', e)
    return null
  })
}

/**
 * Web 端：按「同名 + 时间临近」对一组用户选择的文件做 Live Photo 配对启发式匹配。
 * 输入: 用户多选的原始 File 列表
 * 输出: { images, pairs: Map<imageName, videoFile>, remainingVideos }
 *
 * 配对规则：
 *  1. 图片（image 类型或 .heic）与视频（video 类型）的 baseName（去扩展名）一致
 *  2. 或 lastModified 差值 < 3000ms 且同前缀 "IMG_xxxx"
 *  3. 视频文件被识别为配对后，从主图片列表中排除
 */
export function detectLivePhotoPairs(files: File[]) {
  const isImage = (f: File) => {
    const n = f.name.toLowerCase()
    return f.type.startsWith('image/') || n.endsWith('.heic') || n.endsWith('.heif')
  }
  const isVideo = (f: File) => {
    const n = f.name.toLowerCase()
    return f.type.startsWith('video/') || n.endsWith('.mov') || n.endsWith('.mp4')
  }
  const baseName = (f: File) => f.name.replace(/\.[^.]+$/, '')

  const images = files.filter(isImage)
  const videos = files.filter(isVideo)
  const pairs = new Map<File, File>()
  const usedVideos = new Set<File>()

  for (const img of images) {
    const imgBase = baseName(img).toLowerCase()
    let matched: File | undefined
    for (const v of videos) {
      if (usedVideos.has(v)) continue
      const vBase = baseName(v).toLowerCase()
      if (vBase === imgBase) {
        matched = v
        break
      }
    }
    // 启发式：同前缀 IMG_xxxx 且时间相近
    if (!matched) {
      for (const v of videos) {
        if (usedVideos.has(v)) continue
        const vBase = baseName(v).toLowerCase()
        if (
          imgBase.startsWith('img_') &&
          vBase.startsWith('img_') &&
          Math.abs(v.lastModified - img.lastModified) < 3000
        ) {
          matched = v
          break
        }
      }
    }
    if (matched) {
      pairs.set(img, matched)
      usedVideos.add(matched)
    }
  }

  // 未配对的视频按普通视频文件返回
  const remainingVideos = videos.filter((v) => !usedVideos.has(v))

  return { images, pairs, remainingVideos }
}

/**
 * 从 XMP 头部文本解析 Motion Photo 候选切片。
 *
 * - 小米 / 旧版 Pixel MicroVideo：MicroVideoOffset = 尾部视频字节数，起点 = fileSize - value
 * - Google Motion Photo v1+：MicroVideoOffset = 从文件头到视频起点的偏移
 * - Container:Item Length = 尾部嵌入 MP4 的字节长度
 */
function parseMotionPhotoSlice(headerText: string, fileSize: number): Array<{ offset: number; length: number }> {
  const candidates: Array<{ offset: number; length: number }> = []

  const microOffsetMatch =
    headerText.match(/(?:GCamera:)?(?:MicroVideoOffset|VideoOffset)\s*=\s*"(\d+)"/)
  if (microOffsetMatch) {
    const microValue = parseInt(microOffsetMatch[1], 10) || 0
    if (microValue > 0 && microValue < fileSize) {
      candidates.push({ offset: fileSize - microValue, length: microValue })

      const microLenMatch = headerText.match(/(?:GCamera:)?MicroVideoLength\s*=\s*"(\d+)"/)
      const lenFromStart = microLenMatch
        ? parseInt(microLenMatch[1], 10) || 0
        : fileSize - microValue
      if (lenFromStart > 0 && microValue + lenFromStart <= fileSize) {
        candidates.push({ offset: microValue, length: lenFromStart })
      }
    }
  }

  const itemMatch =
    headerText.match(/Item[^>]*Mime\s*=\s*"video\/mp4"[^>]*Length\s*=\s*"(\d+)"/s) ||
    headerText.match(/Item[^>]*Length\s*=\s*"(\d+)"[^>]*Mime\s*=\s*"video\/mp4"/s)
  if (itemMatch) {
    const length = parseInt(itemMatch[1], 10) || 0
    if (length > 0 && length < fileSize) {
      candidates.push({ offset: fileSize - length, length })
    }
  }

  return candidates
}

/**
 * Web 端：检测 JPEG 中是否嵌入 Motion Photo（Google / 小米 / 华为）
 */
export async function detectMotionPhotoInFile(file: File): Promise<{
  videoBlob: Blob
  videoLength: number
  duration: number
} | null> {
  try {
    const name = file.name.toLowerCase()
    if (!/\.(jpe?g)$/i.test(name)) {
      livePhotoDebug('motion.detect.skip', { name: file.name, reason: 'not-jpeg' })
      return null
    }
    if (file.size < 64 * 1024) {
      livePhotoDebug('motion.detect.skip', { name: file.name, size: file.size, reason: 'too-small' })
      return null
    }

    const headerSize = Math.min(file.size, 512 * 1024)
    const header = new Uint8Array(await file.slice(0, headerSize).arrayBuffer())
    const headerText = new TextDecoder('latin1').decode(header)
    const hasMotionPhotoFlag = /MotionPhoto\s*=\s*"1"/.test(headerText)
    const hasMicroVideo = /MicroVideo/.test(headerText)
    const hasContainerItem = /Item[^>]*Mime\s*=\s*"video\/mp4"/.test(headerText)

    const slices = parseMotionPhotoSlice(headerText, file.size)
    let videoOffset = 0
    let videoLen = 0
    let detectMethod = 'xmp'

    for (const slice of slices) {
      if (await hasFtypAtOffsetInFile(file, slice.offset)) {
        videoOffset = slice.offset
        videoLen = slice.length
        break
      }
    }

    if (videoOffset <= 0) {
      detectMethod = 'ftyp-scan'
      videoOffset = await scanFtypOffsetInFile(file)
      if (videoOffset <= 0) {
        livePhotoDebug('motion.detect.miss', {
          name: file.name,
          size: file.size,
          hasMotionPhotoFlag,
          hasMicroVideo,
          hasContainerItem,
          detectMethod,
        })
        return null
      }
      videoLen = file.size - videoOffset
    }

    if (videoLen <= 0 || videoOffset <= 0) {
      livePhotoDebug('motion.detect.invalidSlice', {
        name: file.name,
        videoOffset,
        videoLen,
        fileSize: file.size,
      })
      return null
    }

    const videoBlob = file.slice(videoOffset, videoOffset + videoLen, 'video/mp4')
    const duration = await probeVideoDuration(videoBlob)
    livePhotoDebug('motion.detect.hit', {
      name: file.name,
      detectMethod,
      videoOffset,
      videoLen,
      duration,
      hasMotionPhotoFlag,
      hasMicroVideo,
      hasContainerItem,
    })
    return { videoBlob, videoLength: videoLen, duration }
  } catch (e) {
    livePhotoDebug('motion.detect.error', { name: file.name, error: String(e) })
    console.warn('detectMotionPhotoInFile failed', e)
    return null
  }
}

/**
 * 检查文件指定偏移处是否为 MP4 ftyp box
 */
async function hasFtypAtOffsetInFile(file: File, offset: number): Promise<boolean> {
  if (offset < 0 || offset + 8 > file.size) return false
  const buf = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer())
  const isFtyp = (start: number) =>
    buf[start] === 0x66 && buf[start + 1] === 0x74 && buf[start + 2] === 0x79 && buf[start + 3] === 0x70
  return isFtyp(0) || isFtyp(4)
}

/**
 * 从 512KB 处开始扫描 'ftyp' magic，返回 mp4 box 起始偏移（含 size 字段）
 */
async function scanFtypOffsetInFile(file: File): Promise<number> {
  const start = 512 * 1024
  const chunkSize = 256 * 1024
  let offset = start
  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size)
    const buf = new Uint8Array(await file.slice(offset, end).arrayBuffer())
    for (let i = 0; i < buf.length - 4; i++) {
      if (
        buf[i] === 0x66 /* f */ &&
        buf[i + 1] === 0x74 /* t */ &&
        buf[i + 2] === 0x79 /* y */ &&
        buf[i + 3] === 0x70 /* p */
      ) {
        const boxStart = offset + i - 4
        if (boxStart > 0 && await hasFtypAtOffsetInFile(file, boxStart)) return boxStart
      }
    }
    offset = end - 4
    if (end >= file.size) break
  }
  return 0
}

/**
 * 借助 HTMLVideoElement 探测视频时长（ms）。失败返回 0。
 */
function probeVideoDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'metadata'
    v.src = url
    const cleanup = () => {
      URL.revokeObjectURL(url)
      v.src = ''
      v.removeAttribute('src')
    }
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0
      cleanup()
      resolve(d)
    }
    v.onerror = () => {
      cleanup()
      resolve(0)
    }
    // 5s 兜底
    setTimeout(() => {
      cleanup()
      resolve(0)
    }, 5000)
  })
}
