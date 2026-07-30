<script setup lang="ts">
import { reactive, computed, watch, ref, onDeactivated, onActivated, onUnmounted, onMounted } from 'vue'
import { addFileInfo, checkDuplicateByMd5, deletePhotos, getPhotos, getUploadUrl, restorePhotos, updatePhotosAlbums, uploadFile } from '../../service';
import { generateFileKey, ensureAudioUploadInfo, parseNativeAudioFileUploadInfo, filePath2Name, pickEssentialExif } from '../../lib/file';
import { isTauri, UploadStatus } from '../../constants/index'
import { useEventListener } from '@vueuse/core'
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { providePhotoListStore } from '@/composables/photoList';
import pLimit from 'p-limit';
import { open } from '@tauri-apps/plugin-dialog';
import BottomActions from '../BottomActions/BottomActions.vue';
import SelectAlbumModal from '../SelectAlbumModal/SelectAlbumModal.vue';
import { showConfirmDialog, showNotify } from 'vant';
import { preventBack } from '@/lib/router'
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import AudioCell from '../AudioCell/AudioCell.vue';
import { useTTLStorage } from '@/composables/useTTLStorage';
import { useScrollRestore } from '@/composables/useScrollRestore';

const containerRef = ref<HTMLElement | null>(null)
useScrollRestore(containerRef)

const isActive = ref(true)
let unlistenProgress: UnlistenFn | null = null

const setupProgressListener = async () => {
  if (isTauri && !unlistenProgress) {
    unlistenProgress = await listen<{ key: string, progress: number, total: number }>('upload://progress', (event) => {
      const { key, progress, total } = event.payload
      const item = waitUploadList.find(v => v.key === key)
      if (item) {
        item.progress = Math.floor((progress / total) * 100)
      }
    })
  }
}

const cleanupProgressListener = () => {
  if (unlistenProgress) {
    unlistenProgress()
    unlistenProgress = null
  }
}

onMounted(() => {
  setupProgressListener()
})

onActivated(async () => {
  isActive.value = true
  setupProgressListener()
})

onDeactivated(() => {
  isActive.value = false
  cleanupProgressListener()
})

onUnmounted(() => {
  isActive.value = false
  cleanupProgressListener()
})

const { likedMode = false, album, isDelete = false } = defineProps<{
  likedMode?: boolean
  album?: Album
  isDelete?: boolean
}>()


const waitUploadList = reactive<{ key: string, url: string, name?: string, status: UploadStatus, progress?: number }[]>([])

const showUploadList = computed(() => waitUploadList.filter(v => v.status !== UploadStatus.SUCCESS))
const hasErrorUploads = computed(() => showUploadList.value.some(v => v.status === UploadStatus.ERROR || v.status === UploadStatus.DUPLICATE))

const pageInfo = reactive({
  pageSize: 20,
  pageIndex: 1,
  lock: false,
})

const getCacheKey = () => {
  return `audio_list_cache_${album?._id || 'all'}_${likedMode}_${isDelete ? 'deleted' : 'normal'}`
}

const { data: cacheData, loadAsync: loadStorageAsync, saveAsync: saveStorageAsync } = useTTLStorage<{
  list: Photo[],
  pageIndex: number
}>({
  key: getCacheKey,
  initialValue: { list: [], pageIndex: 1 },
  ttl: 15 * 60 * 1000
})

const saveCache = () => {
  cacheData.value = {
    list: photoList,
    pageIndex: pageInfo.pageIndex
  }
  saveStorageAsync()
}

const loadCache = async () => {
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
  return getPhotos(index || pageInfo.pageIndex, pageSize || pageInfo.pageSize, {
    likedMode,
    albumId: album?._id,
    isDelete,
    type: 'audio'
  }).then(res => {
    if (isRefresh) {
      photoList.length = 0
      existPhotoMap.clear()
      pageInfo.pageIndex = 1
    }

    let addCount = 0
    res.forEach(v => {
      if (addPhoto2List(v)) {
        addCount += 1
      }
    })
    showEmpty.value = photoList.length === 0
    photoList.sort((a, b) => {
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    })

    saveCache()
    if (index || pageSize) {
      if (res.length < (pageSize || pageInfo.pageSize)) {
        hasMoreData.value = false
      } else {
        hasMoreData.value = true
        if (index === 1 || isRefresh) {
          pageInfo.pageIndex = 2
        }
      }
      return
    }

    if (res.length < pageInfo.pageSize) {
      hasMoreData.value = false
      pageInfo.pageIndex += 1
    } else {
      pageInfo.pageIndex += 1
      hasMoreData.value = true
    }
  }).finally(() => {
    pageInfo.lock = false
  })
}

const handleLoadMore = async () => {
  if (!hasMoreData.value || pageInfo.lock) return
  await loadNext()
}

onUnmounted(() => {
  unregisterScrollListener()
  cleanupProgressListener()
})
const checkScrollBottom = () => {
  if (!isActive.value) return
  if (!containerRef.value) return

  const { scrollTop, clientHeight, scrollHeight } = containerRef.value

  if (scrollTop + clientHeight >= scrollHeight - clientHeight / 3) {
    loadNext()
  }
}

let scrollListener: (() => void) | null = null

const registerScrollListener = () => {
  if (scrollListener) return
  if (containerRef.value) {
    scrollListener = useEventListener(containerRef.value, 'scroll', checkScrollBottom, { passive: true })
  }
}

watch(containerRef, (el) => {
  if (el && isActive.value) {
    registerScrollListener()
  }
})

const unregisterScrollListener = () => {
  if (scrollListener) {
    scrollListener()
    scrollListener = null
  }
}

watch(isActive, async (active) => {
  if (active) {
    if (photoList.length === 0) {
      const restored = await loadCache()
      if (!restored) {
        loadNext()
      }
    }

    if (photoList.length === 0) {
      loadNext()
    }

    registerScrollListener()
  } else {
    unregisterScrollListener()
  }
}, { immediate: true })

import { getLunarDate } from '@/lib/lunar';

const showPhotoList = computed(() => {
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
  const name = file.name.replace(/\s+/g, '_')
  const result = {
    key,
    name,
    lastModified,
    exif: pickEssentialExif(exif),
    size: file.size,
    type: file.type || 'audio/mpeg',
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
    name: (fileInfo.file as any)?.name,
    status: fileInfo.repeat ? UploadStatus.DUPLICATE : UploadStatus.PENDING,
    progress: 0,
  }

  const existItem = waitUploadList.find(v => v.key === key)
  if (!existItem) {
    waitUploadList.push(temp)
  }
}

const uploadOneFile = async (fileInfo: FileInfoItem, uploadInfo: UploadInfo, forceUpload = false) => {
  const key = uploadInfo.key
  const { file } = fileInfo

  const wrapperItem = waitUploadList.find(v => v.key === key)!

  if (!forceUpload && wrapperItem.status === UploadStatus.DUPLICATE) {
    return
  }
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
    }
  }

  wrapperItem.status = UploadStatus.UPLOADING

  const uploadUrl = await getUploadUrl(key)

  try {
    if ((fileInfo as any).filePath && isTauri) {
      await invoke('upload_file', {
        key: uploadInfo.key,
        path: (fileInfo as any).filePath,
        url: uploadUrl
      })
    } else {
      await uploadFile(file, uploadUrl, (progress) => {
        wrapperItem.progress = progress
      })
    }

    const result = await addFileInfo(uploadInfo)

    if (!photoList.length) {
      albumPhotoStore?.refreshAlbum?.()
    }

    if (addPhoto2List(result)) {
      photoList.sort((a, b) => +new Date(b.lastModified) - +new Date(a.lastModified))
    }
    saveCache()
    wrapperItem.status = UploadStatus.SUCCESS

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
const limit = pLimit(1);
const pendingCount = ref(0)
const startUpload = async (values: FileInfoItem[]) => {
  pendingCount.value += values.length
  for (const value of values) {
    limit(async () => {
      try {
        if (isTauri && value.filePath) {
          const uploadInfo = await parseNativeAudioFileUploadInfo(value.filePath)
          if (!uploadInfo) {
            showNotify({
              type: 'danger',
              message: `解析文件 ${value.filePath} 失败`
            })
            return
          }
          Object.assign(value, uploadInfo)
        }

        await ensureAudioUploadInfo(value)

        const existingUploadInfo = Array.from(uploadInfoMap.values()).find(info => info.md5 === value.md5)
        if (existingUploadInfo) {
          value.repeat = true
          showNotify({
            type: 'warning',
            message: `检测到重复文件 ${value.name}，已标记`
          })
        }

        addWaitUploadList(value)

        const info = generateUploadInfo(value)

        uploadValueMap.set(info.key, value)

        await uploadOneFile(value, info)
      } catch (error) {
        console.error('Error processing file:', value, error)
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
    const isDuplicate = item.status === UploadStatus.DUPLICATE
    item.status = UploadStatus.PENDING
    item.progress = 0

    limit(async () => {
      try {
        const fileInfo = uploadValueMap.get(item.key)
        if (fileInfo) {
          await uploadOneFile(fileInfo, generateUploadInfo(fileInfo), isDuplicate)
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
    uploadOneFile(fileInfo, generateUploadInfo(fileInfo))
  }
}

const removeDuplicateFile = (item: { key: string, url: string, status: UploadStatus, progress?: number }) => {
  const index = waitUploadList.findIndex(upload => upload.key === item.key)
  if (index !== -1) {
    waitUploadList.splice(index, 1)
  }

  uploadInfoMap.delete(uploadValueMap.get(item.key)!)
  uploadValueMap.delete(item.key)

  if (item.url) {
    URL.revokeObjectURL(item.url)
  }

  showNotify({ type: 'success', message: '已删除重复文件' })
}

const forceUpload = (item: { key: string, url: string, status: UploadStatus, progress?: number }) => {
  item.status = UploadStatus.PENDING
  item.progress = 0

  const fileInfo = uploadValueMap.get(item.key)
  if (fileInfo) {
    const info = generateUploadInfo(fileInfo)
    limit(() => uploadOneFile(fileInfo, info, true))
  }
}

const afterRead = (files: any) => {
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

import { useFooterStore } from '@/stores/footer'

const showPreview = ref(false)
const footerStore = useFooterStore()

watch(() => showPreview.value, (newVal) => {
  footerStore.isVisible = !newVal
})
const editData = reactive({
  currentIdx: 0,
  active: false,
  selectIds: [] as string[]
})

const showAlbumSelect = ref(false)
const selectedAlbums = ref<string[]>([])

const handleSaveAlbumSelect = async (albumIds: string[]) => {
  await updatePhotosAlbums(editData.selectIds, albumIds)
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
    showNotify({ type: 'warning', message: '请选择要删除的音频' });
    return
  }
  const confirmed = await showConfirmDialog({
    title: '删除确认',
    message:
      `确定要删除这${editData.selectIds.length}个音频吗？`,
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
    showNotify({ type: 'warning', message: '请选择要恢复的音频' });
    return
  }

  const confirmed = await showConfirmDialog({
    title: '恢复确认',
    message:
      `确定要恢复这${editData.selectIds.length}个音频吗？`,
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
  loadNext(1, photoList.length)
    ?.finally(() => {
      loading.value = false
    })
}

const deletePhoto = (id: string) => {
  const deleteIndex = photoList.findIndex(v => v._id === id)
  if (deleteIndex !== -1) {
    existPhotoMap.delete(photoList[deleteIndex].key)
    photoList.splice(deleteIndex, 1)

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
      name: 'Audio',
      extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'oga']
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
  <div class="photo-list" ref="containerRef">
    <van-pull-refresh v-model="loading" @refresh="pullRefresh">
      <main>
        <slot name="header"></slot>
        <van-empty v-if="!photoList.length && showEmpty && !showUploadList.length" description="空空如也，快去添加吧" />
        <div v-if="showUploadList.length > 0" class="upload-list-header">
           <span class="upload-title">正在上传 ({{ showUploadList.length }})</span>
           <div class="upload-actions" v-if="hasErrorUploads">
             <van-button size="mini" plain type="danger" @click="handleCancelAll" class="cancel-all-btn" style="margin-right: 8px;">全部取消</van-button>
             <van-button size="mini" plain type="primary" @click="handleRetryAll" class="retry-all-btn">全部重试</van-button>
           </div>
        </div>
        <van-grid v-if="showUploadList.length > 0" :border="false" square>
          <van-grid-item v-for="item in showUploadList" :key="item.key" class="img-border">
            <AudioCell :src="item.url" :name="item.name">
              <div v-if="item.status === UploadStatus.PENDING" class="upload-mask">等待上传</div>
              <div v-if="item.status === UploadStatus.UPLOADING" class="upload-mask">
                上传中 {{ item.progress || 0 }}%
              </div>
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
              <div @click="reUpload(item)" v-else-if="item.status === UploadStatus.ERROR" class="error-mask">上传失败
                <van-icon name="replay" />
              </div>
            </AudioCell>
          </van-grid-item>
        </van-grid>
        <van-checkbox-group v-model="editData.selectIds">
          <template v-for="{ title, photos, weekDay, lunarDate } in showPhotoList" :key="title">
            <h2 class="photo-group-header">
              <span class="date">{{ title }}</span>
              <div class="sub-info">
                <span class="week-day">{{ weekDay }}</span>
                <span class="divider">/</span>
                <span class="lunar-date">{{ lunarDate }}</span>
              </div>
            </h2>
            <van-grid :border="false" square>
              <van-grid-item v-for="item in photos" :key="item.key" class="img-border">
                <AudioCell @click="previewImage(item.idx)" :src="item.url" :name="item.name"
                  @longpress="handleLongPress(item.idx)" />
                <van-checkbox v-if="editData.active" :ref="el => checkboxRefs[item.idx] = el" :name="item._id"
                  class="editSelected" />
              </van-grid-item>
            </van-grid>
          </template>
        </van-checkbox-group>
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
      <van-uploader v-else class="upload-container" :after-read="afterRead" multiple accept="audio/*">
        <van-icon name="plus" size="16" />
        <div v-if="pendingCount > 0" class="upload-count-badge">
          {{ pendingCount }}
        </div>
      </van-uploader>
    </template>
    <PreviewAudio :is-delete="isDelete" :album="album" v-model:show="showPreview" :images="photoList"
      :start="startPosition" />
    <transition name="van-slide-up">
      <BottomActions style="z-index: 11" :menus="menus" v-show="editData.active" />
    </transition>
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

  .upload-actions {
    display: flex;
    align-items: center;
  }
}
</style>
