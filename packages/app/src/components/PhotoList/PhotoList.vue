<script setup lang="ts">
import { reactive, computed, watch, ref, onDeactivated, onActivated, onUnmounted } from 'vue'
import { addFileInfo, updateFileInfo, checkDuplicateByMd5, deletePhotos, getPhotos, getUploadUrl, restorePhotos, updatePhotosAlbums, uploadFile } from '../../service';
import { filePath2Name, generateFileKey, parseNativeImageFileUploadInfo, ensureUploadInfo } from '../../lib/file';
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
import { showConfirmDialog, showNotify } from 'vant';
import { preventBack } from '@/lib/router'
import { onBeforeRouteLeave } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTTLStorage } from '@/composables/useTTLStorage';

const isActive = ref(true)
let unlistenProgress: UnlistenFn | null = null

onActivated(async () => {
  // 调用时机为首次挂载
  // 以及每次从缓存中被重新插入时
  isActive.value = true
  if (isTauri) {
    unlistenProgress = await listen<{ key: string, progress: number, total: number }>('upload://progress', (event) => {
      const { key, progress, total } = event.payload
      const item = waitUploadList.find(v => v.key === key)
      if (item) {
        item.progress = Math.floor((progress / total) * 100)
      }
    })
  }
})

onDeactivated(() => {
  // 在从 DOM 上移除、进入缓存
  // 以及组件卸载时调用
  isActive.value = false
  if (unlistenProgress) {
    unlistenProgress()
    unlistenProgress = null
  }
})

const { likedMode = false, album, isDelete = false, startDate, endDate } = defineProps<{
  likedMode?: boolean
  album?: Album
  isDelete?: boolean
  startDate?: string
  endDate?: string
}>()


const waitUploadList = reactive<{ key: string, url: string, status: UploadStatus, progress?: number }[]>([])

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

const { data: cacheData, load: loadStorage, save: saveStorage } = useTTLStorage<{
  list: Photo[],
  pageIndex: number
}>({
  key: getCacheKey, // Pass function for dynamic key
  initialValue: { list: [], pageIndex: 1 },
  ttl: 15 * 60 * 1000,
  persistInTauri: true // 开启离线支持，Tauri 环境下即使过期也先加载缓存
})

const saveCache = () => {
  cacheData.value = {
    list: photoList,
    pageIndex: pageInfo.pageIndex
  }
  saveStorage()
}

const loadCache = () => {
  const success = loadStorage()
  if (success && cacheData.value.list.length > 0) {
    const { list, pageIndex } = cacheData.value
    photoList.length = 0
    existPhotoMap.clear()
    repeatPhotoMap.clear()

    list.forEach((p: Photo) => {
      photoList.push(p)
      existPhotoMap.set(p._id, p)
      if (p.isRepeat) {
        // wrapperRepeat logic if needed
      }
    })

    pageInfo.pageIndex = pageIndex || 1
    showEmpty.value = photoList.length === 0
    return true
  }
  return false
}

const photoList = reactive<Photo[]>([])

const existPhotoMap = new Map<string, Photo>()
const repeatPhotoMap = new Map<string, Photo>()
const albumPhotoStore = useAlbumPhotoStore()

const wrapperRepeat = (photo: Photo) => {
  if (repeatPhotoMap.has(photo.key) || photo.isRepeat) {
    photo.isRepeat = true
    return
  }
  repeatPhotoMap.set(photo.key, photo)
  photo.isRepeat = false
}

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
          const repeatItem = repeatPhotoMap.get(item.key)
          if (repeatItem && repeatItem._id === id) {
            repeatPhotoMap.delete(item.key)
          }
        }
      })
    }
    let addCount = 0
    // 数据去重
    res.forEach(v => {
      wrapperRepeat(v)
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
const gridItemHeight = computed(() => windowWidth.value / 4)
const headerRef = ref<HTMLElement | null>(null)
const { height: headerHeight } = useElementSize(headerRef)
const containerRef = ref<HTMLElement | null>(null)

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
    // 尝试加载缓存
    const restored = loadCache()
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
  const result = {
    key,
    name,
    lastModified,
    exif: {
      'FileType': exif['FileType'],
      'Image Width': exif['Image Width'],
      'Image Height': exif['Image Height'],
    },
    size: file.size,
    type: file.type,
    likedMode,
    md5: value.md5,
    ...(album ? { albumId: [album._id] } : {})
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
      } else {
        // Web 方法
        await uploadFile(file, uploadUrl, (progress) => {
          wrapperItem.progress = progress
        })
      }
    } else {
      wrapperItem.progress = 100
    }

    // 数据落库
    if (sourceKey) {
      uploadInfo.key = sourceKey
    }
    let result
    if (existingId) {
      result = await updateFileInfo({ ...uploadInfo, id: existingId })
    } else {
      result = await addFileInfo(uploadInfo)
    }

    // 空相册首次上传
    if (!photoList.length) {
      albumPhotoStore?.refreshAlbum?.()
    }

    // 正式列表数据更新
    if (addPhoto2List(result)) {
      photoList.sort((a, b) => +new Date(b.lastModified) - +new Date(a.lastModified))
    }
    saveCache()
    wrapperItem.status = UploadStatus.SUCCESS

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
const startUpload = async (values: FileInfoItem[]) => {
  pendingCount.value += values.length
  for (const value of values) {
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
            return
          }
          Object.assign(value, uploadInfo)
        }

        // 通用处理逻辑 (Web & Tauri)：确保信息完整
        await ensureUploadInfo(value)

        // 5. 本地MD5重复检测
        const existingUploadInfo = Array.from(uploadInfoMap.values()).find(info => info.md5 === value.md5)
        if (existingUploadInfo) {
          value.repeat = true
          showNotify({
            type: 'warning',
            message: `检测到重复文件 ${value.name}，已标记`
          })
        }

        // 加入待上传列表，同时支持列表里展示
        addWaitUploadList(value)

        // 生成上传信息
        const info = generateUploadInfo(value)

        // 记录开始上传的文件原始信息，重传使用
        uploadValueMap.set(info.key, value)

        await uloadOneFile(value, info)
      } catch (error) {
        console.error('Error processing file:', value, error)
      } finally {
        pendingCount.value--
      }
    })
  }
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

const afterRead = (files: any) => {
  // 解析获取图片信息
  const fileInfoList = [files].flat().map(value => {
    const { file, objectUrl } = value
    return {
      file,
      objectUrl,
      name: file.name,
      lastModified: file.lastModified,
      date: file.lastModifiedDate,
    } as FileInfoItem
  })

  startUpload(fileInfoList)
}

const showPreview = ref(false)
const editData = reactive({
  currentIdx: 0,
  active: false,
  selectIds: [] as string[]
})

const showAlbumSelect = ref(false)
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
    albumIds.forEach(id => {
      if (!v.albumId?.includes(id)) {
        v.albumId?.push(id)
      }
    })
  })
  saveCache()

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
  const confirmed = await showConfirmDialog({
    title: '删除确认',
    message:
      `确定要删除这${editData.selectIds.length}张照片吗？`,
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

  await deletePhotos(editData.selectIds, album?._id)

  // 更新相册数据
  editData.selectIds.forEach(v => {
    deletePhoto(v)
  })
  showNotify({ type: 'success', message: '删除成功' });
  cancelEditMode()
  saveCache()
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

const previewImage = (idx: number) => {
  if (editData.active) {
    toggleSelectAlbum(idx)
    return
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

const loading = ref(false)
const pullRefresh = () => {
  repeatPhotoMap.clear()
  loading.value = true
  loadNext(1, photoList.length, true) // Add true for isRefresh
    ?.finally(() => {
      loading.value = false
    })
}

// 判断路由从回收站返回
onBeforeRouteLeave((to, from, next) => {
  if (from.name === 'delete') {
    setTimeout(() => {
      pullRefresh()
    }, 1000)
  }
  next()
})

// provide
const deletePhoto = (id: string) => {
  const deleteIndex = photoList.findIndex(v => v._id === id)
  if (deleteIndex !== -1) {
    const item = photoList[deleteIndex]
    photoList.splice(deleteIndex, 1)
    existPhotoMap.delete(id)

    const repeatItem = repeatPhotoMap.get(item.key)
    if (repeatItem && repeatItem._id === id) {
      repeatPhotoMap.delete(item.key)
    }

    // 展示空文案
    if (photoList.length === 0) {
      showEmpty.value = true
    }
  }
  saveCache()
}
const isEmpty = computed(() => !photoList.length)
providePhotoListStore({
  photoList,
  deletePhoto,
  isEmpty,
  restorePhotos: handleRestorePhotos
})

const handleOpenFile = async () => {
  const selected = await open({
    multiple: true,
    filters: [{
      name: 'Image',
      extensions: ['png', 'jpeg', 'webp', 'gif']
    }]
  });

  if (!selected) return

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
    for (let i = 0; i < showUploadList.value.length; i += 4) {
      uploadChunks.push(showUploadList.value.slice(i, i + 4))
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
    showPhotoList.value.forEach((group) => {
      items.push({
        type: 'group-header',
        id: `group-${group.title}`,
        title: group.title,
        weekDay: group.weekDay,
        lunarDate: group.lunarDate
      })

      const photoChunks = []
      for (let i = 0; i < group.photos.length; i += 4) {
        photoChunks.push(group.photos.slice(i, i + 4))
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

const getItemHeight = (item: any) => {
  if (item.type === 'slot-header') return headerHeight.value || 100 // Fallback
  if (item.type === 'upload-header') return 44 // Padding + Font size
  if (item.type === 'group-header') return 36 // Margin + Font size
  if (item.type === 'upload-row' || item.type === 'photo-row') return gridItemHeight.value
  if (item.type === 'empty') return 300
  if (item.type === 'footer') return 80
  return 50
}

const { list, containerProps, wrapperProps } = useVirtualList(virtualListSource, {
  itemHeight: (index) => {
    const item = virtualListSource.value[index]
    return getItemHeight(item)
  },
  overscan: 20
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
               <van-button v-if="hasErrorUploads" size="mini" plain type="primary" @click="handleRetryAll" class="retry-all-btn">全部重试</van-button>
            </div>

            <!-- Upload Row -->
            <div v-else-if="item.data.type === 'upload-row'" class="virtual-row">
               <div v-for="(subItem, subIndex) in item.data.items" :key="subItem.key" class="virtual-col" :style="{ height: gridItemHeight + 'px', width: '25%' }">
                  <div class="img-border" :class="{ 'no-right-border': subIndex === 3 }">
                    <ImageCell :src="subItem.url">
                      <!-- 等待中 -->
                      <div v-if="subItem.status === UploadStatus.PENDING" class="upload-mask">等待上传</div>
                      <!-- 上传中 -->
                      <div v-if="subItem.status === UploadStatus.UPLOADING" class="upload-mask">
                        上传中 {{ subItem.progress || 0 }}%
                      </div>
                      <!-- 重复 -->
                      <div v-else-if="subItem.status === UploadStatus.DUPLICATE" class="duplicate-mask">
                        <div class="duplicate-info">
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
               <div v-for="(subItem, subIndex) in item.data.items" :key="subItem.key" class="virtual-col" :style="{ height: gridItemHeight + 'px', width: '25%' }">
                  <div class="img-border" :class="{ 'no-right-border': subIndex === 3 }">
                    <ImageCell @click="previewImage(subItem.idx)" :src="subItem.cover" :is-repeat="subItem.isRepeat" :cache-key="subItem.key + '_cover'"
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
      <van-uploader v-else class="upload-container" :after-read="afterRead" multiple>
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
  </div>
</template>
<style scoped lang="scss">
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
  mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
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
