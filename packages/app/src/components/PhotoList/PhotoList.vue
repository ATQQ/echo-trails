<script setup lang="ts">
import { onMounted, reactive, computed, watch, ref, onDeactivated, onActivated, onUnmounted } from 'vue'
import { addFileInfo, updateFileInfo, checkDuplicateByMd5, deletePhotos, getPhotos, getUploadUrl, restorePhotos, updatePhotosAlbums, uploadFile } from '../../service';
import { filePath2Name, generateFileKey, parseNativeImageFileUploadInfo, parseNativeVideoFileUploadInfo, ensureUploadInfo, ensureVideoUploadInfo, parseLivePhotoPair, detectLivePhotoPairs, detectMotionPhotoInFile, getFileMd5Hash, pickEssentialExif } from '../../lib/file';
import { isCompleteLivePhoto, livePhotoDebug } from '../../lib/livePhoto';
import { isTauri, UploadStatus } from '../../constants/index'
import { useEventListener, useThrottleFn, useWindowSize, useVirtualList, useElementSize } from '@vueuse/core'
import PreviewImage from '@/components/PreviewImage/PreviewImage.vue';
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { providePhotoListStore } from '@/composables/photoList';
import ImageCell from '../ImageCell/ImageCell.vue';
import pLimit from 'p-limit';
import { open } from '@tauri-apps/plugin-dialog';
import BottomActions from '../BottomActions/BottomActions.vue';
import SelectAlbumModal from '../SelectAlbumModal/SelectAlbumModal.vue';
import { showConfirmDialog, showNotify, showImagePreview } from 'vant';
import { preventBack } from '@/lib/router'
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTTLStorage } from '@/composables/useTTLStorage';
import { useScrollRestore } from '@/composables/useScrollRestore';
import { useResponsive } from '@/composables/useResponsive';
import { isLocalMode } from '@/lib/serviceRouter';
import { notifyAlbumsChanged } from '@/lib/albumEvents';

const isActive = ref(true)
let unlistenProgress: UnlistenFn | null = null

const startListen = async () => {
  if (isTauri && !unlistenProgress) {
    unlistenProgress = await listen<{ key: string, progress: number, total: number }>('upload://progress', (event) => {
      const { key, progress, total } = event.payload
      // 既可能是图片 key，也可能是 Live Photo 的视频 key（.live.mp4/.mov）
      const item = waitUploadList.find(v => v.key === key || v.liveVideoKey === key)
      if (!item) return
      if (total <= 0) return

      const imageSize = item.imageSize || 0
      const videoSize = item.videoSize || 0
      const totalSize = imageSize + videoSize
      const isVideoEvent = item.liveVideoKey === key && key !== item.key
      let overall: number
      if (totalSize > 0 && (imageSize > 0 || videoSize > 0)) {
        const uploaded = isVideoEvent
          ? imageSize + Math.min(videoSize, Math.floor((progress / total) * videoSize))
          : Math.min(imageSize, Math.floor((progress / total) * imageSize))
        overall = Math.min(100, Math.floor((uploaded / totalSize) * 100))
      } else {
        overall = Math.min(100, Math.floor((progress / total) * 100))
      }
      // 单调递增，避免视觉回退
      if ((item.progress ?? 0) < overall) {
        item.progress = overall
      }
    })
  }
}

const stopListen = () => {
  if (unlistenProgress) {
    unlistenProgress()
    unlistenProgress = null
  }
}

onMounted(startListen)
onActivated(async () => {
  // 调用时机为首次挂载
  // 以及每次从缓存中被重新插入时
  isActive.value = true
  startListen()
})

onDeactivated(() => {
  // 在从 DOM 上移除、进入缓存
  // 以及组件卸载时调用
  isActive.value = false
  stopListen()
})

onUnmounted(() => {
  isActive.value = false
  stopListen()
})

const { likedMode = false, album, isDelete = false, startDate, endDate } = defineProps<{
  likedMode?: boolean
  album?: Album
  isDelete?: boolean
  startDate?: string
  endDate?: string
}>()


const waitUploadList = reactive<{ key: string, url: string, status: UploadStatus, progress?: number, liveVideoKey?: string, imageSize?: number, videoSize?: number }[]>([])

const showUploadList = computed(() => waitUploadList.filter(v => v.status !== UploadStatus.SUCCESS))
const hasErrorUploads = computed(() => showUploadList.value.some(v => v.status === UploadStatus.ERROR || v.status === UploadStatus.DUPLICATE))

const pageInfo = reactive({
  pageSize: 36,
  pageIndex: 1,
  lock: false,
})

// 缓存相关逻辑
const getCacheKey = () => {
  return `photo_list_cache_${album?._id || 'all'}_${likedMode}_${isDelete ? 'deleted' : 'normal'}_${startDate || ''}_${endDate || ''}`
}

const { data: cacheData, loadAsync: loadStorageAsync, saveAsync: saveStorageAsync } = useTTLStorage<{
  list: Photo[],
  pageIndex: number
}>({
  key: getCacheKey, // Pass function for dynamic key
  initialValue: { list: [], pageIndex: 1 },
  ttl: 15 * 60 * 1000,
  persistInTauri: true // 开启离线支持，Tauri 环境下即使过期也先加载缓存
})

const saveCache = () => {
  if (isLocalMode()) return
  cacheData.value = {
    list: photoList,
    pageIndex: pageInfo.pageIndex
  }
  saveStorageAsync()
}

const loadCache = async () => {
  if (isLocalMode()) return false
  const success = await loadStorageAsync()
  if (success && cacheData.value.list.length > 0) {
    const { list, pageIndex } = cacheData.value
    photoList.length = 0
    existPhotoMap.clear()

    list.forEach((p: Photo) => {
      photoList.push(p)
      existPhotoMap.set(p._id, p)
    })

    pageInfo.pageIndex = pageIndex || 1
    showEmpty.value = photoList.length === 0
    return true
  }
  return false
}

const photoList = reactive<Photo[]>([])

const existPhotoMap = new Map<string, Photo>()
const albumPhotoStore = useAlbumPhotoStore()

const addPhoto2List = (photo: Photo) => {
  if (!existPhotoMap.has(photo._id)) {
    existPhotoMap.set(photo._id, photo)
    photoList.push(photo)
    return true
  } else {
    // 更新所有属性
    const existPhoto = existPhotoMap.get(photo._id)!
    Object.assign(existPhoto, photo)
  }

  return false
}
const showEmpty = ref(false)
const hasMoreData = ref(true)
const loadNext = async (index = 0, pageSize = 0, isRefresh = false) => {
  if (!isActive.value) return
  if (pageInfo.lock) return
  pageInfo.lock = true
  // 获取数据
  return getPhotos(index || pageInfo.pageIndex, pageSize || pageInfo.pageSize, {
    likedMode,
    albumId: album?._id,
    isDelete,
    startDate,
    endDate
  }).then(res => {
    if (isRefresh) {
      const newIdSet = new Set(res.map(v => v._id))
      const idsToRemove: string[] = []
      photoList.forEach(v => {
        if (!newIdSet.has(v._id)) {
          idsToRemove.push(v._id)
        }
      })
      idsToRemove.forEach(id => {
        const idx = photoList.findIndex(v => v._id === id)
        if (idx !== -1) {
          const item = photoList[idx]
          photoList.splice(idx, 1)
          existPhotoMap.delete(id)
        }
      })
    }
    let addCount = 0
    // 数据去重
    res.forEach(v => {
      if (addPhoto2List(v)) {
        addCount += 1
      }
    })
    showEmpty.value = photoList.length === 0
    // 按时间排个序
    photoList.sort((a, b) => {
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    })

    // 更新缓存
    saveCache()

    // 检查是否已经没有更多数据了
    if (res.length < (pageSize || pageInfo.pageSize)) {
      hasMoreData.value = false
    } else {
      hasMoreData.value = true
    }

    // 根据当前列表长度重新计算页码
    pageInfo.pageIndex = Math.floor(photoList.length / pageInfo.pageSize) + 1
  }).catch(e => {
    console.warn('Load photos failed:', e)
    if (!photoList.length && !showUploadList.value.length) {
      showEmpty.value = true
      hasMoreData.value = false
    }
  }).finally(() => {
    pageInfo.lock = false
  })
}

// 手动加载更多
const handleLoadMore = async () => {
  if (!hasMoreData.value || pageInfo.lock) return
  await loadNext()
}

// 滚动监听已在上面实现
onUnmounted(() => {
  // 组件卸载时清理事件监听器
  unregisterScrollListener()
})
const { width: windowWidth } = useWindowSize()
const { isMobile } = useResponsive()
const headerRef = ref<HTMLElement | null>(null)
const { height: headerHeight } = useElementSize(headerRef)
const containerRef = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(containerRef)
useScrollRestore(containerRef)

const columns = computed(() => {
  if (isMobile.value) return 4
  const w = windowWidth.value
  if (w < 900) return 4
  if (w < 1280) return 5
  if (w < 1600) return 6
  if (w < 1920) return 8
  return 10
})

const gridItemHeight = computed(() => {
  const effectiveWidth = containerWidth.value || Math.min(windowWidth.value, 1200)
  return effectiveWidth / columns.value
})

// 滚动事件监听
const checkScrollBottom = () => {
  if (!isActive.value) return
  // Use container ref for scrolling check
  if (!containerRef.value) return

  const { scrollTop, clientHeight, scrollHeight } = containerRef.value

  // 距离半个屏幕就触发
  if (scrollTop + clientHeight >= scrollHeight - clientHeight / 3) {
    loadNext()
  }
}

watch([() => startDate, () => endDate], () => {
  if (isActive.value) {
    pullRefresh()
  }
})

// 根据页面活动状态注册/取消事件监听
// With virtual list, we don't need window scroll listener, we use @scroll on container
// But we still need to handle active state
const registerScrollListener = () => {
  // No-op for window scroll, handled by container @scroll
}

const unregisterScrollListener = () => {
  // No-op
}

// 监听页面活动状态
watch(isActive, async (active) => {
  if (active) {
    if (isLocalMode()) {
      await loadNext(1, photoList.length || pageInfo.pageSize, true)
      registerScrollListener()
      return
    }

    // 尝试加载缓存
    const restored = await loadCache()
    if (!restored) {
      await loadNext()
    } else {
      // 就算有缓存，也静默拉取一次数据，更新本地列表
      loadNext(1, photoList.length || pageInfo.pageSize, true).catch((e) => {
        // 网络异常时，如果已有缓存，则静默失败，保留当前视图
        console.warn('Silent refresh failed (might be offline):', e)
      })
    }
    registerScrollListener()
  } else {
    unregisterScrollListener()
  }
}, { immediate: true })

import { getLunarDate } from '@/lib/lunar';

// 正式列表展示使用 computed 进行groupBy分组
const showPhotoList = computed(() => {
  // 按时间排个序
  // 按照 category 进行分组
  return photoList.reduce<{ title: string, weekDay: string, lunarDate: string, photos: (Photo & { idx: number })[] }[]>((pre, cur, idx) => {
    const { category } = cur
    const existCategory = pre.find(v => v.title === category)
    const expandValue = {
      idx,
      ...cur
    }
    if (existCategory) {
      existCategory.photos.push(expandValue)
    } else {
      // 解析周几
      const weekDayMap = ['日', '一', '二', '三', '四', '五', '六']
      const date = new Date(cur.lastModified);
      const weekDay = `星期${weekDayMap[date.getDay()]}`
      const lunarDate = getLunarDate(date);
      pre.push({
        title: category,
        weekDay,
        lunarDate,
        photos: [expandValue]
      })
    }
    return pre
  }, [])
})



const uploadInfoMap = new Map<FileInfoItem, UploadInfo>()
const generateUploadInfo = (value: FileInfoItem) => {
  if (uploadInfoMap.has(value)) {
    return uploadInfoMap.get(value)!
  }
  const { exif, lastModified, file } = value
  const key = generateFileKey(value)
  const name = file.name.replace(/\s+/g, '_') // 去除空格
  const result: UploadInfo = {
    key,
    name,
    lastModified,
    exif: pickEssentialExif(exif),
    size: file.size,
    type: file.type,
    likedMode,
    md5: value.md5,
    ...(album ? { albumId: [album._id] } : {}),
  }
  uploadInfoMap.set(value, result)
  return result
}

const addWaitUploadList = (fileInfo: FileInfoItem) => {
  const info = generateUploadInfo(fileInfo)
  const key = info.key

  const temp = {
    key,
    url: fileInfo.objectUrl,
    status: fileInfo.repeat ? UploadStatus.DUPLICATE : UploadStatus.PENDING,
    progress: 0,
  }
  const existItem = waitUploadList.find(v => v.key === key)
  if (!existItem) {
    waitUploadList.push(temp)
  }
}

const uloadOneFile = async (fileInfo: FileInfoItem, uploadInfo: UploadInfo, forceUpload = false) => {
  const key = uploadInfo.key
  const { file } = fileInfo

  // 获取到上传列表里对应项
  const wrapperItem = waitUploadList.find(v => v.key === key)!

  // 列表里重复的情况
  if (!forceUpload && wrapperItem.status === UploadStatus.DUPLICATE) {
    return
  }
  let sourceKey = ''
  let existingId = ''
  // MD5判断是否重复，重复则先不上传做提示
  if (uploadInfo.md5) {
    try {
      const duplicateResult = await checkDuplicateByMd5(uploadInfo.md5)
      if (duplicateResult.isDuplicate) {
        if (!forceUpload) {
          wrapperItem.status = UploadStatus.DUPLICATE
          showNotify({
            type: 'warning',
            message: `文件 ${uploadInfo.name} 已存在，跳过上传`
          })
          return
        }
        // 强制上传时，如果文件已存在，则复用 key 实现秒传
        if (duplicateResult.existingPhoto) {
          sourceKey = duplicateResult.existingPhoto.key
          existingId = duplicateResult.existingPhoto._id
        }
      }
    } catch (error) {
      showNotify({
        type: 'danger',
        message: `检查MD5重复失败: ${error}`
      })
      // 检查失败时继续上传流程
    }
  }

  // 准备上传
  wrapperItem.status = UploadStatus.UPLOADING
  wrapperItem.progress = 0

  // 进度按字节加权：overall = floor((imageUploaded + videoUploaded) / totalSize * 100)
  const imageSize = Math.max(0, file?.size || uploadInfo.size || 0)
  const liveVideoSize = (fileInfo.isLive && fileInfo.liveVideo) ? Math.max(0, fileInfo.liveVideo.size || 0) : 0
  const hasWeights = imageSize > 0 && (!fileInfo.isLive || !fileInfo.liveVideo || liveVideoSize > 0)
  const totalSize = hasWeights ? imageSize + liveVideoSize : 0
  // 写入 wrapperItem，供 upload://progress 事件回调做按字节加权
  wrapperItem.imageSize = imageSize
  wrapperItem.videoSize = liveVideoSize
  let imageUploaded = 0
  let videoUploaded = 0
  const applyProgress = () => {
    if (totalSize <= 0) return
    const overall = Math.min(100, Math.floor(((imageUploaded + videoUploaded) / totalSize) * 100))
    // 单调递增：仅当新值不小于当前值时更新，避免视觉回退
    if ((wrapperItem.progress ?? 0) < overall) {
      wrapperItem.progress = overall
    }
  }

  // 触发上传
  try {
    if (!sourceKey) {
      // 获取上传链接
      const uploadUrl = await getUploadUrl(key)

      if (fileInfo.filePath && isTauri) {
        await invoke('upload_file', {
          key: uploadInfo.key,
          path: fileInfo.filePath,
          url: uploadUrl
        })
        // Tauri 无中间进度，图片完成后按比例跳到对应百分比
        imageUploaded = imageSize
        if (totalSize > 0) {
          applyProgress()
        } else {
          wrapperItem.progress = fileInfo.isLive && fileInfo.liveVideo ? 50 : 100
        }
      } else {
        // Web 方法：progress 是 0~100，按 size 折算成已传字节
        await uploadFile(file, uploadUrl, (progress) => {
          if (imageSize > 0) {
            imageUploaded = Math.min(imageSize, Math.floor((progress / 100) * imageSize))
            applyProgress()
          } else if ((wrapperItem.progress ?? 0) < progress) {
            wrapperItem.progress = progress
          }
        })
        imageUploaded = imageSize
        applyProgress()
      }
    } else {
      // 秒传：图片视为已上传
      imageUploaded = imageSize
      if (totalSize > 0) {
        applyProgress()
      } else {
        wrapperItem.progress = fileInfo.isLive && fileInfo.liveVideo ? 50 : 100
      }
    }

    // 数据落库
    if (sourceKey) {
      uploadInfo.key = sourceKey
    }

    // Live Photo: 同步上传动态视频部分，成功后才写入 isLive / liveVideoKey
    if (fileInfo.isLive && fileInfo.liveVideo) {
      const videoSize = fileInfo.liveVideo.size || 0
      livePhotoDebug('upload.liveVideo.start', {
        imageName: fileInfo.name,
        videoPath: fileInfo.liveVideo.filePath,
        videoName: fileInfo.liveVideo.name,
        videoSize,
        contentId: fileInfo.liveContentId,
      })
      if (videoSize <= 0 && isTauri && fileInfo.liveVideo.filePath) {
        livePhotoDebug('upload.liveVideo.skipEmpty', {
          imageName: fileInfo.name,
          videoPath: fileInfo.liveVideo.filePath,
        })
        showNotify({
          type: 'warning',
          message: `Live Photo 动态视频无效，已保存为普通照片`,
        })
      } else {
        try {
        const liveType = fileInfo.liveVideo.type || ''
        const livePath = fileInfo.liveVideo.filePath || ''
        const isMp4 = liveType.includes('mp4') || /\.mp4$/i.test(fileInfo.liveVideo.name || '') || /\.mp4$/i.test(livePath)
        const videoKey = `${uploadInfo.key}.live.${isMp4 ? 'mp4' : 'mov'}`
        wrapperItem.liveVideoKey = videoKey
        const videoUploadUrl = await getUploadUrl(videoKey)
        if (fileInfo.liveVideo.filePath && isTauri) {
          await invoke('upload_file', {
            key: videoKey,
            path: fileInfo.liveVideo.filePath,
            url: videoUploadUrl
          })
          videoUploaded = liveVideoSize
          if (totalSize > 0) {
            applyProgress()
          } else if ((wrapperItem.progress ?? 0) < 100) {
            wrapperItem.progress = 100
          }
        } else if (fileInfo.liveVideo.file) {
          const vSize = fileInfo.liveVideo.file.size || liveVideoSize
          await uploadFile(fileInfo.liveVideo.file, videoUploadUrl, (progress) => {
            if (vSize > 0) {
              videoUploaded = Math.min(vSize, Math.floor((progress / 100) * vSize))
              applyProgress()
            }
          })
          videoUploaded = vSize
          applyProgress()
        }
        // 保底：视频阶段结束确保不低于 100
        if (totalSize <= 0 && (wrapperItem.progress ?? 0) < 100) {
          wrapperItem.progress = 100
        }
        uploadInfo.isLive = true
        uploadInfo.liveVideoKey = videoKey
        uploadInfo.liveContentId = fileInfo.liveContentId || ''
        uploadInfo.liveDuration = fileInfo.liveDuration || 0
        livePhotoDebug('upload.liveVideo.success', {
          imageKey: uploadInfo.key,
          liveVideoKey: videoKey,
        })
        } catch (e) {
          livePhotoDebug('upload.liveVideo.failed', { imageName: fileInfo.name, error: String(e) })
          console.warn('[LivePhoto] 动态视频上传失败，将仅保留静态图：', e)
          showNotify({
            type: 'warning',
            message: `Live Photo 动态视频上传失败，已保存为普通照片`,
          })
        }
      }
    }

    let result
    if (existingId) {
      result = await updateFileInfo({ ...uploadInfo, id: existingId })
    } else {
      result = await addFileInfo(uploadInfo)
    }
    livePhotoDebug('upload.persisted', {
      name: uploadInfo.name,
      isLive: result?.isLive,
      liveVideoKey: result?.liveVideoKey,
      liveVideoUrl: result?.liveVideoUrl,
    })

    // 空相册首次上传
    if (!photoList.length) {
      albumPhotoStore?.refreshAlbum?.()
    }

    // 正式列表数据更新
    if (addPhoto2List(result)) {
      photoList.sort((a, b) => +new Date(b.lastModified) - +new Date(a.lastModified))
    }
    saveCache()

    // 上传成功后从待上传列表移除，避免残留影响后续同 key 上传
    const successIndex = waitUploadList.findIndex(v => v.key === key)
    if (successIndex !== -1) {
      const [removed] = waitUploadList.splice(successIndex, 1)
      if (removed?.url) {
        URL.revokeObjectURL(removed.url)
      }
    }

    // 移除map中的数据
    uploadInfoMap.delete(fileInfo)
    uploadValueMap.delete(key)
  } catch (err) {
    wrapperItem.status = UploadStatus.ERROR
    showNotify({
      type: 'danger',
      message: `上传文件 ${uploadInfo.name} 失败: ${err}`,
      duration: 10000,
    })
    console.error(err)
  }
}

const uploadValueMap = new Map<string, FileInfoItem>()
const limit = pLimit(3);
const pendingCount = ref(0)

let placeholderSeq = 0
const makePlaceholderKey = (value: FileInfoItem) => {
  placeholderSeq += 1
  const base = value.filePath || value.name || value.file?.name || 'file'
  return `__pending__:${placeholderSeq}:${base}`
}

const startUpload = async (values: FileInfoItem[]) => {
  pendingCount.value += values.length
  for (const value of values) {
    // 选中即入列：先以「解析中」占位项呈现，避免长时间空白
    const placeholderKey = makePlaceholderKey(value)
    const placeholder: { key: string, url: string, status: UploadStatus, progress?: number } = {
      key: placeholderKey,
      url: value.objectUrl || '',
      status: UploadStatus.PARSING,
      progress: 0,
    }
    waitUploadList.push(placeholder)

    limit(async () => {
      try {
        // Tauri 环境下，如果有 filePath 且没有实际文件内容
        if (isTauri && value.filePath) {
          const uploadInfo = await parseNativeImageFileUploadInfo(value.filePath)
          if (!uploadInfo) {
            showNotify({
              type: 'danger',
              message: `解析文件 ${value.filePath} 失败`
            })
            // 解析失败：占位项标记 ERROR，便于用户重试或删除
            placeholder.status = UploadStatus.ERROR
            return
          }
          Object.assign(value, uploadInfo)
          // 解析得到的 objectUrl 立刻回填占位项缩略图
          if (value.objectUrl && !placeholder.url) {
            placeholder.url = value.objectUrl
          }

          // 探测 Live Photo 配对（仅 Tauri 端从文件系统选择时使用）
          if (!value.liveVideo) {
            livePhotoDebug('detect.tauri.start', { filePath: value.filePath, name: value.name })
            const liveInfo = await parseLivePhotoPair(value.filePath)
            livePhotoDebug('detect.tauri.result', {
              filePath: value.filePath,
              hit: !!(liveInfo?.video_path),
              video_path: liveInfo?.video_path,
              content_id: liveInfo?.content_id,
              duration: liveInfo?.duration,
              video_size: liveInfo?.video_size,
            })
            if (liveInfo && liveInfo.video_path) {
              const isMotion = (liveInfo.content_id || '').startsWith('motion-photo:')
              const inferMp4 = isMotion || /\.mp4$/i.test(liveInfo.video_path)
              const videoSize = liveInfo.video_size || 0
              if (isTauri && videoSize <= 0) {
                livePhotoDebug('detect.invalidVideoSize', {
                  name: value.name,
                  videoPath: liveInfo.video_path,
                })
              } else {
                value.isLive = true
                value.liveContentId = liveInfo.content_id
                value.liveDuration = liveInfo.duration
                value.liveVideo = {
                  filePath: liveInfo.video_path,
                  name: filePath2Name(liveInfo.video_path) || (inferMp4 ? 'live.mp4' : 'live.mov'),
                  size: videoSize,
                  type: inferMp4 ? 'video/mp4' : 'video/quicktime',
                  duration: liveInfo.duration,
                }
              }
            }
          }
        }

        livePhotoDebug('detect.enqueue', {
          name: value.name,
          filePath: value.filePath,
          isLive: !!value.isLive,
          liveContentId: value.liveContentId,
          liveVideoPath: value.liveVideo?.filePath,
          liveVideoName: value.liveVideo?.name,
        })

        // 通用处理逻辑 (Web & Tauri)：确保信息完整
        await ensureUploadInfo(value)
        if (value.objectUrl && !placeholder.url) {
          placeholder.url = value.objectUrl
        }

        // 5. 本地MD5重复检测
        const existingUploadInfo = Array.from(uploadInfoMap.values()).find(info => info.md5 === value.md5)
        if (existingUploadInfo) {
          value.repeat = true
          showNotify({
            type: 'warning',
            message: `检测到重复文件 ${value.name}，已标记`
          })
        }

        // 生成上传信息（含真实 S3 key）
        const info = generateUploadInfo(value)

        // 把占位项的 key 替换为真实 S3 key，并初始化为 PENDING / DUPLICATE
        // 若已存在同 key（极少数并发场景），移除占位项避免重复并跳过本次上传
        const dupIndex = waitUploadList.findIndex(v => v.key === info.key)
        if (dupIndex !== -1) {
          const phIndex = waitUploadList.indexOf(placeholder)
          if (phIndex !== -1) waitUploadList.splice(phIndex, 1)
          return
        }
        placeholder.key = info.key
        placeholder.status = value.repeat ? UploadStatus.DUPLICATE : UploadStatus.PENDING
        placeholder.progress = 0

        // 记录开始上传的文件原始信息，重传使用
        uploadValueMap.set(info.key, value)

        await uloadOneFile(value, info)
      } catch (error) {
        console.error('Error processing file:', value, error)
        placeholder.status = UploadStatus.ERROR
      } finally {
        pendingCount.value--
      }
    })
  }
}

const handleCancelAll = () => {
  const errorItems = waitUploadList.filter(v => v.status === UploadStatus.ERROR || v.status === UploadStatus.DUPLICATE)
  if (!errorItems.length) return

  errorItems.forEach(item => {
    const index = waitUploadList.findIndex(upload => upload.key === item.key)
    if (index !== -1) {
      waitUploadList.splice(index, 1)
    }

    if (uploadValueMap.has(item.key)) {
      uploadInfoMap.delete(uploadValueMap.get(item.key)!)
      uploadValueMap.delete(item.key)
    }

    if (item.url) {
      URL.revokeObjectURL(item.url)
    }
  })

  showNotify({ type: 'success', message: '已取消所有失败/重复项' })
}

const handleRetryAll = () => {
  const errorItems = waitUploadList.filter(v => v.status === UploadStatus.ERROR || v.status === UploadStatus.DUPLICATE)
  if (!errorItems.length) return

  pendingCount.value += errorItems.length

  errorItems.forEach(item => {
    // 如果是重复状态，需要强制上传
    const isDuplicate = item.status === UploadStatus.DUPLICATE
    item.status = UploadStatus.PENDING
    item.progress = 0

    limit(async () => {
      try {
        const fileInfo = uploadValueMap.get(item.key)
        if (fileInfo) {
          // 对于重复文件，传入 forceUpload=true
          await uloadOneFile(fileInfo, generateUploadInfo(fileInfo), isDuplicate)
        }
      } catch (e) {
        console.error(e)
      } finally {
        pendingCount.value--
      }
    })
  })
}

const reUpload = (item: { key: string, url: string, status: UploadStatus, progress?: number }) => {
  item.status = UploadStatus.PENDING
  item.progress = 0
  const fileInfo = uploadValueMap.get(item.key)
  if (fileInfo) {
    uloadOneFile(fileInfo, generateUploadInfo(fileInfo))
  }
}

// 删除重复文件
const removeDuplicateFile = (item: { key: string, url: string, status: UploadStatus, progress?: number }) => {
  // 从待上传列表中移除
  const index = waitUploadList.findIndex(upload => upload.key === item.key)
  if (index !== -1) {
    waitUploadList.splice(index, 1)
  }

  // 清理相关数据
  uploadInfoMap.delete(uploadValueMap.get(item.key)!)
  uploadValueMap.delete(item.key)

  // 释放对象URL
  if (item.url) {
    URL.revokeObjectURL(item.url)
  }

  showNotify({ type: 'success', message: '已删除重复文件' })
}

// 强制上传重复文件
const forceUpload = (item: { key: string, url: string, status: UploadStatus, progress?: number }) => {
  item.status = UploadStatus.PENDING
  item.progress = 0

  const fileInfo = uploadValueMap.get(item.key)
  if (fileInfo) {
    // 重新生成上传信息，跳过重复检测
    const info = generateUploadInfo(fileInfo)
    limit(() => uloadOneFile(fileInfo, info, true)) // 添加强制上传标志
  }
}

const previewDuplicate = (item: { url: string }) => {
  showImagePreview([item.url])
}

const afterRead = async (files: any) => {
  const wrapped = [files].flat() as Array<{ file: File, objectUrl: string }>
  const rawFiles = wrapped.map(v => v.file)

  livePhotoDebug('detect.web.files', {
    count: rawFiles.length,
    files: rawFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
  })

  const { pairs } = detectLivePhotoPairs(rawFiles)
  const pairedVideos = new Set(Array.from(pairs.values()))
  livePhotoDebug('detect.web.applePairs', {
    pairCount: pairs.size,
    pairs: Array.from(pairs.entries()).map(([img, vid]) => ({
      image: img.name,
      video: vid.name,
    })),
  })

  const fileInfoList: FileInfoItem[] = []
  for (const value of wrapped) {
    const { file, objectUrl } = value
    if (pairedVideos.has(file)) {
      livePhotoDebug('detect.web.skipPairedVideo', { name: file.name })
      continue
    }
    const matchedVideo = pairs.get(file)
    let liveExtra: Partial<FileInfoItem> | null = null
    if (matchedVideo) {
      livePhotoDebug('detect.web.appleHit', { image: file.name, video: matchedVideo.name })
      liveExtra = {
        isLive: true,
        liveVideo: {
          file: matchedVideo,
          name: matchedVideo.name,
          size: matchedVideo.size,
          type: matchedVideo.type || 'video/quicktime',
        }
      }
    } else if (/\.jpe?g$/i.test(file.name)) {
      try {
        livePhotoDebug('detect.web.motionStart', { name: file.name, size: file.size })
        const motion = await detectMotionPhotoInFile(file)
        if (motion) {
          livePhotoDebug('detect.web.motionHit', {
            name: file.name,
            videoLength: motion.videoLength,
            duration: motion.duration,
          })
          const baseName = file.name.replace(/\.[^.]+$/, '')
          const videoFile = new File([motion.videoBlob], `${baseName}.live.mp4`, { type: 'video/mp4' })
          liveExtra = {
            isLive: true,
            liveDuration: motion.duration,
            liveContentId: `motion-photo:${baseName}`,
            liveVideo: {
              file: videoFile,
              name: videoFile.name,
              size: videoFile.size,
              type: 'video/mp4',
              duration: motion.duration,
            }
          }
        } else {
          livePhotoDebug('detect.web.motionMiss', { name: file.name })
        }
      } catch (e) {
        livePhotoDebug('detect.web.motionError', { name: file.name, error: String(e) })
        console.warn('[MotionPhoto] 检测异常', file.name, e)
      }
    } else {
      livePhotoDebug('detect.web.skipMotion', {
        name: file.name,
        type: file.type,
        reason: 'not-jpeg',
      })
    }

    const item = {
      file,
      objectUrl,
      name: file.name,
      lastModified: file.lastModified,
      date: (file as any).lastModifiedDate || new Date(file.lastModified),
      exif: undefined as any,
      ...(liveExtra || {})
    } as FileInfoItem

    fileInfoList.push(item)
  }

  livePhotoDebug('detect.web.enqueue', {
    total: fileInfoList.length,
    liveCount: fileInfoList.filter(v => v.isLive).length,
  })

  startUpload(fileInfoList)
}

import { useFooterStore } from '@/stores/footer'

const showPreview = ref(false)
const footerStore = useFooterStore()

const syncFooterVisibility = () => {
  footerStore.isVisible = !showPreview.value && !editData.active
}

const editData = reactive({
  currentIdx: 0,
  active: false,
  selectIds: [] as string[]
})

watch([showPreview, () => editData.active], syncFooterVisibility, { immediate: true })

onUnmounted(() => {
  footerStore.isVisible = true
})

const showAlbumSelect = ref(false)
const showDeleteModeSheet = ref(false)
const selectedAlbums = ref<string[]>([])
const handleAddAlbum = async () => {
  if (!editData.selectIds.length) {
    showNotify({ type: 'warning', message: '请选择要添加的照片' });
    return
  }
  showAlbumSelect.value = true
  selectedAlbums.value = []
}

// TODO：相册中的照片删除逻辑？
const handleSaveAlbumSelect = async (albumIds: string[]) => {
  await updatePhotosAlbums(editData.selectIds, albumIds)
  // 更新相册数据
  const selectPhotos = photoList.filter(v => editData.selectIds.includes(v._id))
  selectPhotos.forEach(v => {
    if (!v.albumId) {
      v.albumId = []
    }
    albumIds.forEach(id => {
      if (!v.albumId!.includes(id)) {
        v.albumId!.push(id)
      }
    })
  })
  saveCache()
  albumPhotoStore?.refreshAlbum?.()
  notifyAlbumsChanged('photo-list')

  showAlbumSelect.value = false
  showNotify({ type: 'success', message: '更改成功' });
  cancelEditMode()
}
const cancelEditMode = () => {
  editData.active = false
  editData.selectIds = []
}

const handleDeletePhotos = async () => {
  if (!editData.selectIds.length) {
    showNotify({ type: 'warning', message: '请选择要删除的照片' });
    return
  }
  if (album?._id && !isDelete) {
    showDeleteModeSheet.value = true
    return
  }

  await executeDeletePhotos('delete-all')
}

type DeleteMode = 'remove-current' | 'delete-all'

const deleteModeActions: {
  name: string
  subname: string
  color?: string
  mode: DeleteMode
}[] = [
  {
    name: '从当前相册移除',
    subname: '照片仍保留在全部照片和其他相册',
    mode: 'remove-current'
  },
  {
    name: '从所有相册删除',
    subname: '照片会进入删除列表',
    color: '#ee0a24',
    mode: 'delete-all'
  }
]

const handleSelectDeleteMode = (action: { mode: DeleteMode }) => {
  showDeleteModeSheet.value = false
  executeDeletePhotos(action.mode)
}

const executeDeletePhotos = async (mode: DeleteMode) => {
  const confirmed = await showConfirmDialog({
    title: mode === 'remove-current' ? '移除确认' : '删除确认',
    message: mode === 'remove-current'
      ? `确定要将这${editData.selectIds.length}张照片从当前相册移除吗？`
      : `确定要从所有相册删除这${editData.selectIds.length}张照片吗？`,
    confirmButtonText: mode === 'remove-current' ? '移除' : '删除',
    confirmButtonColor: mode === 'remove-current' ? '#1989fa' : '#ee0a24'
  })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
  if (!confirmed) {
    return;
  }

  await deletePhotos(editData.selectIds, mode === 'remove-current' ? album?._id : undefined)

  // 更新相册数据
  editData.selectIds.forEach(v => {
    deletePhoto(v)
  })
  showNotify({ type: 'success', message: mode === 'remove-current' ? '已从当前相册移除' : '删除成功' });
  cancelEditMode()
  saveCache()
  albumPhotoStore?.refreshAlbum?.()
  notifyAlbumsChanged('photo-list')
}

const handleRestorePhotos = async (ids: string[] = []) => {
  if (ids?.length) {
    editData.selectIds = ids
  }
  if (!editData.selectIds.length) {
    showNotify({ type: 'warning', message: '请选择要恢复的照片' });
    return
  }

  const confirmed = await showConfirmDialog({
    title: '恢复确认',
    message:
      `确定要恢复这${editData.selectIds.length}张照片吗？`,
  })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
  if (!confirmed) {
    return;
  }

  await restorePhotos(editData.selectIds)
  showNotify({ type: 'success', message: '恢复成功' });
  // 更新本地相册数据
  editData.selectIds.forEach(v => {
    deletePhoto(v)
  })
  cancelEditMode()
}

const menus = computed(() => {
  if (isDelete) {
    return [
      {
        icon: 'replay',
        text: '恢复',
        handleClick: handleRestorePhotos
      },
      {
        icon: 'cross',
        text: '取消',
        handleClick: cancelEditMode
      }
    ]
  }

  return [
    {
      icon: 'star-o',
      text: '添加相册',
      handleClick: handleAddAlbum
    },
    {
      icon: 'delete-o',
      text: '删除',
      handleClick: handleDeletePhotos
    },
    {
      icon: 'cross',
      text: '取消',
      handleClick: cancelEditMode
    }
  ]
})
const checkboxRefs = ref<any[]>([])
const startPosition = ref(0)

const toggleSelectAlbum = (idx: number) => {
  checkboxRefs.value[idx].toggle()
}

const previewImage = (idx: number, event?: Event) => {
  if (editData.active) {
    toggleSelectAlbum(idx)
    return
  }

  if (event) {
    const target = (event.currentTarget as HTMLElement).closest('.virtual-col') as HTMLElement;
    if (target) {
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      document.documentElement.style.setProperty('--preview-origin-x', `${x}px`);
      document.documentElement.style.setProperty('--preview-origin-y', `${y}px`);
    }
  }

  showPreview.value = true
  startPosition.value = idx
}

const handleLongPress = (idx: number) => {
  editData.currentIdx = idx
  editData.active = true
  editData.selectIds = [photoList[idx]._id]
}
preventBack(editData, 'active')
preventBack(showDeleteModeSheet)

const loading = ref(false)
const pullRefresh = () => {
  loading.value = true
  loadNext(1, photoList.length, true) // Add true for isRefresh
    ?.finally(() => {
      loading.value = false
    })
}

// provide
const deletePhoto = (id: string) => {
  const deleteIndex = photoList.findIndex(v => v._id === id)
  if (deleteIndex !== -1) {
    const item = photoList[deleteIndex]
    photoList.splice(deleteIndex, 1)
    existPhotoMap.delete(id)

    // 展示空文案
    if (photoList.length === 0) {
      showEmpty.value = true
    }
  }
  saveCache()
}
const updateLiked = (id: string, isLiked: boolean) => {
  const item = photoList.find(v => v._id === id)
  if (!item) return

  if (likedMode && !isLiked) {
    deletePhoto(id)
    return
  }

  item.isLiked = isLiked
  saveCache()
}
const isEmpty = computed(() => !photoList.length)
providePhotoListStore({
  photoList,
  deletePhoto,
  updateLiked,
  isEmpty,
  restorePhotos: handleRestorePhotos
})

const handleOpenFile = async () => {
  const selected = await open({
    multiple: true,
    filters: [{
      name: 'Image',
      extensions: ['png', 'jpeg', 'jpg', 'webp', 'gif', 'heic', 'heif']
    }]
  });

  if (!selected) return

  livePhotoDebug('detect.tauri.picker', { paths: selected })

  const files = selected.map(filePath => {
    const name = filePath2Name(filePath)
    return {
      file: {
        name
      },
      name,
      filePath
    }
  })

  startUpload(files as any)
}

// Flatten the list
const virtualListSource = computed(() => {
  const items: any[] = []

  // 1. Slot Header
  items.push({ type: 'slot-header', id: 'slot-header' })

  // 2. Upload List
  if (showUploadList.value.length > 0) {
    items.push({ type: 'upload-header', id: 'upload-header', count: showUploadList.value.length })
    // Chunk upload list
    const uploadChunks = []
    const cols = columns.value
    for (let i = 0; i < showUploadList.value.length; i += cols) {
      uploadChunks.push(showUploadList.value.slice(i, i + cols))
    }
    uploadChunks.forEach((chunk, index) => {
      items.push({
        type: 'upload-row',
        id: `upload-row-${index}`,
        items: chunk
      })
    })
  }

  // 3. Photo List
  if (photoList.length === 0 && showEmpty.value && showUploadList.value.length === 0) {
    items.push({ type: 'empty', id: 'empty' })
  } else {
    const cols = columns.value
    showPhotoList.value.forEach((group) => {
      items.push({
        type: 'group-header',
        id: `group-${group.title}`,
        title: group.title,
        weekDay: group.weekDay,
        lunarDate: group.lunarDate
      })

      const photoChunks = []
      for (let i = 0; i < group.photos.length; i += cols) {
        photoChunks.push(group.photos.slice(i, i + cols))
      }
      photoChunks.forEach((chunk, index) => {
        items.push({
          type: 'photo-row',
          id: `photo-row-${group.title}-${index}`,
          items: chunk
        })
      })
    })
  }

  // 4. Footer (Load More)
  items.push({ type: 'footer', id: 'footer' })

  return items
})

const virtualItems = ref<any[]>([])
watch(virtualListSource, (items) => {
  virtualItems.value = items
}, { immediate: true })

const getItemHeight = (item: any) => {
  if (item.type === 'slot-header') return headerHeight.value || 100 // Fallback
  if (item.type === 'upload-header') return 44 // Padding + Font size
  if (item.type === 'group-header') return 36 // Margin + Font size
  if (item.type === 'upload-row' || item.type === 'photo-row') return gridItemHeight.value
  if (item.type === 'empty') return 300
  if (item.type === 'footer') return 80
  return 50
}

const { list, containerProps, wrapperProps } = useVirtualList(virtualItems, {
  itemHeight: (index) => {
    const item = virtualItems.value[index]
    return getItemHeight(item)
  },
  overscan: 10
})

const isPullRefreshDisabled = ref(false)
const isScrolled = ref(false)
const onScroll = useThrottleFn(checkScrollBottom, 200)

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  if (target) {
    isPullRefreshDisabled.value = target.scrollTop > 0
    // 控制顶部毛玻璃遮罩的显示
    isScrolled.value = target.scrollTop > 20
  }
  onScroll()
}

// Sync container ref with useVirtualList
watch(containerRef, (el) => {
  if (el) {
    containerProps.ref.value = el
  }
})
</script>

<template>
  <div class="photo-list">
    <div class="top-blur-mask" :class="{ 'is-visible': isScrolled }"></div>
    <van-pull-refresh v-model="loading" @refresh="pullRefresh" class="pull-refresh-container" :disabled="isPullRefreshDisabled">
      <div v-bind="containerProps" ref="containerRef" class="virtual-list-container" @scroll="handleScroll">
        <div v-bind="wrapperProps">
          <van-checkbox-group v-model="editData.selectIds">
            <div v-for="item in list" :key="item.data.id" :style="{ height: getItemHeight(item.data) + 'px' }">

            <!-- Slot Header -->
            <div v-if="item.data.type === 'slot-header'" ref="headerRef">
              <slot name="header"></slot>
            </div>

            <!-- Upload Header -->
            <div v-else-if="item.data.type === 'upload-header'" class="upload-list-header">
               <span class="upload-title">正在上传 ({{ item.data.count }})</span>
               <div class="upload-actions" v-if="hasErrorUploads">
                 <van-button size="mini" plain type="danger" @click="handleCancelAll" class="cancel-all-btn" style="margin-right: 8px;">全部取消</van-button>
                 <van-button size="mini" plain type="primary" @click="handleRetryAll" class="retry-all-btn">全部重试</van-button>
               </div>
            </div>

            <!-- Upload Row -->
            <div v-else-if="item.data.type === 'upload-row'" class="virtual-row">
               <div v-for="(subItem, subIndex) in item.data.items" :key="subItem.key" class="virtual-col" :style="{ height: gridItemHeight + 'px', width: (100 / columns) + '%' }">
                  <div class="img-border" :class="{ 'no-right-border': subIndex === columns - 1 }">
                    <ImageCell :src="subItem.url">
                      <!-- 解析中 -->
                      <div v-if="subItem.status === UploadStatus.PARSING" class="upload-mask">解析中…</div>
                      <!-- 等待中 -->
                      <div v-else-if="subItem.status === UploadStatus.PENDING" class="upload-mask">等待上传</div>
                      <!-- 上传中 -->
                      <div v-else-if="subItem.status === UploadStatus.UPLOADING" class="upload-mask">
                        上传中 {{ subItem.progress || 0 }}%
                      </div>
                      <!-- 重复 -->
                      <div v-else-if="subItem.status === UploadStatus.DUPLICATE" class="duplicate-mask">
                        <div class="duplicate-info" @click.stop="previewDuplicate(subItem)">
                          <van-icon name="warning" />
                          <span>照片存在</span>
                        </div>
                        <div class="duplicate-actions">
                          <van-button size="mini" type="danger" @click="removeDuplicateFile(subItem)">取消</van-button>
                          <van-button size="mini" type="success" @click="forceUpload(subItem)">上传</van-button>
                        </div>
                      </div>
                      <!-- 失败 -->
                      <div @click="reUpload(subItem)" v-else-if="subItem.status === UploadStatus.ERROR" class="error-mask">上传失败
                        <van-icon name="replay" />
                      </div>
                    </ImageCell>
                  </div>
               </div>
            </div>

            <!-- Empty State -->
             <van-empty v-else-if="item.data.type === 'empty'" description="空空如也，快去添加吧" />

            <!-- Group Header -->
            <h2 v-else-if="item.data.type === 'group-header'" class="photo-group-header">
              <span class="date">{{ item.data.title }}</span>
              <div class="sub-info">
                <span class="week-day">{{ item.data.weekDay }}</span>
                <span class="divider">/</span>
                <span class="lunar-date">{{ item.data.lunarDate }}</span>
              </div>
            </h2>

            <!-- Photo Row -->
            <div v-else-if="item.data.type === 'photo-row'" class="virtual-row">
               <div v-for="(subItem, subIndex) in item.data.items" :key="subItem.key" class="virtual-col" :style="{ height: gridItemHeight + 'px', width: (100 / columns) + '%' }" :data-index="subItem.idx">
                  <div class="img-border" :class="{ 'no-right-border': subIndex === columns - 1 }">
                    <ImageCell @click="(e: Event) => previewImage(subItem.idx, e)" :src="subItem.cover" :cache-key="subItem.key + '_cover'"
                      :is-live="isCompleteLivePhoto(subItem)"
                      @longpress="handleLongPress(subItem.idx)" />
                    <van-checkbox v-if="editData.active" :ref="el => checkboxRefs[subItem.idx] = el" :name="subItem._id"
                      class="editSelected" />
                  </div>
               </div>
            </div>

            <!-- Footer -->
            <div v-else-if="item.data.type === 'footer'" class="load-more-container">
              <template v-if="!showEmpty && photoList.length > 0">
                <van-button v-if="hasMoreData" @click="handleLoadMore" :loading="pageInfo.lock" type="default" size="small"
                  class="load-more-btn">
                  {{ pageInfo.lock ? '加载中...' : '加载更多' }}
                </van-button>
                <div v-else class="no-more-text">没有更多了</div>
              </template>
              <div class="block"></div>
            </div>
           </div>
          </van-checkbox-group>
        </div>
      </div>
    </van-pull-refresh>
    <!-- 回到顶部 -->
    <van-back-top :bottom="'calc(var(--footer-area-height) + 48px)'" :right="20" :style="{
      '--van-back-top-icon-size': '16px',
      '--van-back-top-size': '36px',
    }" />
    <template v-if="!isDelete">
      <van-button v-if="isTauri" @click="handleOpenFile" class="upload-container tauri-mode">
        <van-icon name="plus" size="16" />
        <div v-if="pendingCount > 0" class="upload-count-badge">
          {{ pendingCount }}
        </div>
      </van-button>
      <!-- 上传 -->
      <van-uploader v-else class="upload-container" :after-read="afterRead" multiple
        accept="image/*,video/quicktime,video/mp4,.heic,.heif,.mov">
        <van-icon name="plus" size="16" />
        <div v-if="pendingCount > 0" class="upload-count-badge">
          {{ pendingCount }}
        </div>
      </van-uploader>
    </template>
    <!-- 图片预览 -->
    <PreviewImage :is-delete="isDelete" :album="album" v-model:show="showPreview" :images="photoList"
      :start="startPosition" />
    <!-- 底部操作栏 -->
    <transition name="van-slide-up">
      <BottomActions style="z-index: 11" :menus="menus" v-show="editData.active" />
    </transition>
    <!-- 选择相册 -->
    <SelectAlbumModal v-model:show="showAlbumSelect" @save="handleSaveAlbumSelect" :current-album-id="album?._id"
      :selected="selectedAlbums" />
    <van-action-sheet
      v-model:show="showDeleteModeSheet"
      :actions="deleteModeActions"
      cancel-text="取消"
      close-on-click-action
      :close-on-popstate="false"
      description="请选择这次删除操作的范围"
      @select="handleSelectDeleteMode"
    />
  </div>
</template>
<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;
@import url(./style.scss);

.upload-list-header {
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #333;

  .upload-title {
    font-weight: 500;
  }
  
  .upload-actions {
    display: flex;
    align-items: center;
  }
}

.photo-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Ensure virtual list container handles scroll */
  position: relative;
}

.top-blur-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 120px;
  pointer-events: none;
  z-index: 10;
  /* 更柔和的渐变毛玻璃效果 */
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.top-blur-mask.is-visible {
  opacity: 1;
}

.pull-refresh-container {
  height: 100%;
  overflow: hidden;
}

.virtual-list-container {
  height: 100%;
  overflow-y: auto;
  /* 增加 GPU 加速 */
  transform: translateZ(0);
  -webkit-overflow-scrolling: touch;

  @include desktop {
    padding: 0 24px;
  }

  @include large-desktop {
    padding: 0 32px;
  }
}

.virtual-row {
  display: flex;
  flex-wrap: wrap;
}

.virtual-col {
  box-sizing: border-box;
  padding: 0;
}

.img-border {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-bottom: 1px solid #fff;
  border-right: 1px solid #fff;
  position: relative;
}

.no-right-border {
  border-right: none;
}
</style>
