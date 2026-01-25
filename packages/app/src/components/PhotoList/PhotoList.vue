<script setup lang="ts">
import { reactive, computed, watch, ref, onDeactivated, onActivated, onUnmounted } from 'vue'
import { addFileInfo, checkDuplicateByMd5, deletePhotos, getPhotos, getUploadUrl, restorePhotos, updatePhotosAlbums, uploadFile } from '../../service';
import { filePath2Name, generateFileKey, getFileInfo, getFileMd5Hash, getImageDimensions, getImageExif, parseNativeImageFileUploadInfo, ensureUploadInfo } from '../../lib/file';
import { isTauri, UploadStatus } from '../../constants/index'
import { useEventListener } from '@vueuse/core'
import PreviewImage from '@/components/PreviewImage/PreviewImage.vue';
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { providePhotoListStore } from '@/composables/photoList';
import ImageCell from '../ImageCell/ImageCell.vue';
import pLimit from 'p-limit';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, BaseDirectory, lstat } from '@tauri-apps/plugin-fs';
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

const { likedMode = false, album, isDelete = false } = defineProps<{
  likedMode?: boolean
  album?: Album
  isDelete?: boolean
}>()


const waitUploadList = reactive<{ key: string, url: string, status: UploadStatus, progress?: number }[]>([])

const showUploadList = computed(() => waitUploadList.filter(v => v.status !== UploadStatus.SUCCESS))

const pageInfo = reactive({
  pageSize: 20,
  pageIndex: 1,
  lock: false,
})

// 缓存相关逻辑
const getCacheKey = () => {
  return `photo_list_cache_${album?._id || 'all'}_${likedMode}_${isDelete ? 'deleted' : 'normal'}`
}

const { data: cacheData, load: loadStorage, save: saveStorage } = useTTLStorage<{
  list: Photo[],
  pageIndex: number
}>({
  key: getCacheKey, // Pass function for dynamic key
  initialValue: { list: [], pageIndex: 1 },
  ttl: 15 * 60 * 1000
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
    // 更新其中链接
    const existPhoto = existPhotoMap.get(photo._id)!
    existPhoto.url = photo.url
    existPhoto.cover = photo.cover
    existPhoto.preview = photo.preview
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
    isDelete
  }).then(res => {
    // 如果是刷新操作，清空现有列表
    if (isRefresh) {
      photoList.length = 0
      existPhotoMap.clear()
      repeatPhotoMap.clear()
      pageInfo.pageIndex = 1
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
    // 指定页码时不做额外操作
    if (index || pageSize) {
      // 检查是否已经没有更多数据了（当前页数据不满pageSize）
      if (res.length < (pageSize || pageInfo.pageSize)) {
        hasMoreData.value = false
      } else {
        // 如果重新加载了第一页，且数据满了，说明可能还有更多数据
        hasMoreData.value = true
        // 修正页码：如果是重置加载（如下拉刷新），重置为下一页
        if (index === 1 || isRefresh) {
          pageInfo.pageIndex = 2
        }
      }
      return
    }

    if (res.length < pageInfo.pageSize) {
      // 返回数据少于 pageSize，说明没有更多数据了
      hasMoreData.value = false
      // 仍然增加页码，避免重复请求当前页（虽然没有更多了，但逻辑上当前页已加载）
      pageInfo.pageIndex += 1
    } else {
      // 数据够了，增加页码以便下次加载下一页
      pageInfo.pageIndex += 1
      hasMoreData.value = true
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
// 滚动事件监听
const checkScrollBottom = () => {
  if (!isActive.value) return
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  const windowHeight = window.innerHeight
  const documentHeight = document.documentElement.scrollHeight

  // 距离半个屏幕就触发
  if (scrollTop + windowHeight >= documentHeight - windowHeight / 3) {
    loadNext()
  }
}

// 根据页面活动状态注册/取消事件监听
let scrollListener: (() => void) | null = null

const registerScrollListener = () => {
  if (scrollListener) return
  scrollListener = useEventListener(window, 'scroll', checkScrollBottom, { passive: true })
}

const unregisterScrollListener = () => {
  if (scrollListener) {
    scrollListener()
    scrollListener = null
  }
}

// 监听页面活动状态
watch(isActive, (active) => {
  if (active) {
    // 尝试加载缓存
    const restored = loadCache()
    if (!restored) {
      loadNext()
    }
    registerScrollListener()
  } else {
    unregisterScrollListener()
  }
}, { immediate: true })

// 正式列表展示使用 computed 进行groupBy分组
const showPhotoList = computed(() => {
  // 按时间排个序
  // 按照 category 进行分组
  return photoList.reduce<{ title: string, weekDay: string, photos: (Photo & { idx: number })[] }[]>((pre, cur, idx) => {
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
      const weekDay = `星期${weekDayMap[new Date(cur.lastModified).getDay()]}`
      pre.push({
        title: category,
        weekDay,
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
  // MD5判断是否重复，重复则先不上传做提示
  if (!forceUpload && uploadInfo.md5) {
    try {
      const duplicateResult = await checkDuplicateByMd5(uploadInfo.md5)
      if (duplicateResult.isDuplicate) {
        wrapperItem.status = UploadStatus.DUPLICATE
        showNotify({
          type: 'warning',
          message: `文件 ${uploadInfo.name} 已存在，跳过上传`
        })
        return
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

  // 获取上传链接
  const uploadUrl = await getUploadUrl(key)

  // 触发上传
  try {
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

    // 数据落库
    const result = await addFileInfo(uploadInfo)

    // 空相册首次上传
    if (!photoList.length) {
      albumPhotoStore?.refreshAlbum?.()
    }

    // 优先展示临时资源链接，避免闪烁（会导致缓存数据异常）
    // result.cover = wrapperItem.url
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
const limit = pLimit(2);
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

  await deletePhotos(editData.selectIds)

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
  loading.value = true
  // 刷新时重置页码为1，并清空列表（可选，如果需要平滑过渡可以不清空，但需要处理数据替换逻辑）
  // 这里选择不清空，依靠 loadNext 的 index=1 逻辑来处理
  // 但为了彻底替换旧数据，我们需要在 loadNext 中识别出这是一个刷新操作

  // 修正：loadNext 目前是追加逻辑。如果想替换，需要在 loadNext 里处理，或者在外面处理。
  // 我们修改 loadNext，当 index=1 时，清空 photoList？
  // 或者在这里清空？如果在这里清空，界面会闪烁。

  // 更好的方式：传递一个 refresh 标记给 loadNext？
  // 或者利用 loadNext 的 index 参数。

  // 目前 loadNext 的逻辑是：
  // getPhotos -> res -> addPhoto2List (去重/更新) -> sort -> saveCache

  // 如果是刷新，我们希望：
  // 1. 获取第一页数据
  // 2. 如果成功，用新数据 *替换* 旧列表的前N项？不，应该是替换整个列表？
  //    不，下拉刷新通常只刷新第一页。如果用户已经加载了10页，下拉刷新后应该只保留第一页吗？
  //    通常是的，下拉刷新意味着“重新开始”。

  // 所以：
  loadNext(1, pageInfo.pageSize, true) // Add true for isRefresh
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
    existPhotoMap.delete(photoList[deleteIndex].key)
    photoList.splice(deleteIndex, 1)

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
</script>

<template>
  <div class="photo-list">
    <van-pull-refresh v-model="loading" @refresh="pullRefresh">
      <main>
        <slot name="header"></slot>
        <van-empty v-if="!photoList.length && showEmpty && !showUploadList.length" description="空空如也，快去添加吧" />
        <!-- 待上传列表 -->
        <van-grid :border="false" square>
          <van-grid-item v-for="item in showUploadList" :key="item.key" class="img-border">
            <ImageCell :src="item.url">
              <!-- 等待中 -->
              <div v-if="item.status === UploadStatus.PENDING" class="upload-mask">等待上传</div>
              <!-- 上传中 -->
              <div v-if="item.status === UploadStatus.UPLOADING" class="upload-mask">
                上传中 {{ item.progress || 0 }}%
              </div>
              <!-- TODO：添加删除逻辑 -->
              <!-- 重复 -->
              <div v-else-if="item.status === UploadStatus.DUPLICATE" class="duplicate-mask">
                <div class="duplicate-info">
                  <van-icon name="warning" />
                  <span>文件重复</span>
                </div>
                <div class="duplicate-actions">
                  <van-button size="mini" type="danger" @click="removeDuplicateFile(item)">删除</van-button>
                  <van-button size="mini" type="primary" @click="forceUpload(item)">上传</van-button>
                </div>
              </div>
              <!-- 失败 -->
              <div @click="reUpload(item)" v-else-if="item.status === UploadStatus.ERROR" class="error-mask">上传失败
                <van-icon name="replay" />
              </div>
            </ImageCell>
          </van-grid-item>
        </van-grid>
        <!-- 正常列表 -->
        <van-checkbox-group v-model="editData.selectIds">
          <template v-for="{ title, photos, weekDay } in showPhotoList" :key="title">
            <h2>{{ title }}<span class="week-day"> - {{ weekDay }}</span></h2>
            <van-grid :border="false" square>
              <van-grid-item v-for="item in photos" :key="item.key" class="img-border">
                <ImageCell @click="previewImage(item.idx)" :src="item.cover" :is-repeat="item.isRepeat"
                  @longpress="handleLongPress(item.idx)" />
                <van-checkbox v-if="editData.active" :ref="el => checkboxRefs[item.idx] = el" :name="item._id"
                  class="editSelected" />
              </van-grid-item>
            </van-grid>
          </template>
        </van-checkbox-group>
        <!-- 空白块，用于触发列表滚动加载 -->
        <!-- 加载更多按钮 -->
        <div class="load-more-container" v-if="!showEmpty && photoList.length > 0">
          <van-button v-if="hasMoreData" @click="handleLoadMore" :loading="pageInfo.lock" type="default" size="small"
            class="load-more-btn">
            {{ pageInfo.lock ? '加载中...' : '加载更多' }}
          </van-button>
          <div v-else class="no-more-text">没有更多了</div>
        </div>
        <div class="block"></div>
      </main>
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
</style>
