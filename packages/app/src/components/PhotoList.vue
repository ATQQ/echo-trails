<script setup lang="ts">
import ExifReader from 'exifreader'
import { reactive, computed, watch, toRefs, ref, onDeactivated, onActivated, onUnmounted } from 'vue'
import { addFileInfo, checkDuplicateByMd5, deletePhotos, getPhotos, getUploadUrl, restorePhotos, updatePhotosAlbums, uploadFile } from '../service';
import { generateFileKey, getFileMd5Hash } from '../lib/file';
import { isTauri, UploadStatus } from '../constants/index'
import { useEventListener } from '@vueuse/core'
import PreviewImage from '@/components/PreviewImage.vue';
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { providePhotoListStore } from '@/composables/photoList';
import ImageCell from './ImageCell.vue';
import pLimit from 'p-limit';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, BaseDirectory, lstat } from '@tauri-apps/plugin-fs';
import BottomActions from './BottomActions.vue';
import SelectAlbumModal from './SelectAlbumModal.vue';
import { showConfirmDialog, showNotify } from 'vant';
import { preventBack } from '@/lib/router'
import { onBeforeRouteLeave } from 'vue-router';

const isActive = ref(true)
onActivated(() => {
  // 调用时机为首次挂载
  // 以及每次从缓存中被重新插入时
  isActive.value = true
})

onDeactivated(() => {
  // 在从 DOM 上移除、进入缓存
  // 以及组件卸载时调用
  isActive.value = false
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
const loadNext = async (index = 0, pageSize = 0) => {
  if (!isActive.value) return
  if (pageInfo.lock) return
  pageInfo.lock = true
  // 获取数据
  return getPhotos(index || pageInfo.pageIndex, pageSize || pageInfo.pageSize, {
    likedMode,
    albumId: album?._id,
    isDelete
  }).then(res => {
    let addCount = 0
    // 数据去重
    res.forEach(v => {
      wrapperRepeat(v)
      if (addPhoto2List(v)) {
        addCount += 1
      }
    })
    showEmpty.value = photoList.length === 0

    // 指定页码时不做额外操作
    if (index || pageSize) {
      return
    }

    if (addCount === pageInfo.pageSize) {
      // 数据不够时，不新增页码
      pageInfo.pageIndex += 1
    } else {
      // 没有更多数据了
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
  loadNext()
  if (active) {
    registerScrollListener()
  } else {
    unregisterScrollListener()
  }
}, { immediate: true })

// 正式列表展示使用 computed 进行groupBy分组
const showPhotoList = computed(() => {
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

function getImageExif(file: any) {
  try {
    return ExifReader.load(file)
  } catch {
    return {}
  }
}
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
    exif,
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
  await uploadFile(file, uploadUrl, (progress) => {
    wrapperItem.progress = progress
  })
    .then(async () => {
      // 数据落库
      const result = await addFileInfo(uploadInfo)

      // 空相册首次上传
      if (!photoList.length) {
        albumPhotoStore?.refreshAlbum?.()
      }

      // 优先展示临时资源链接，避免闪烁
      result.cover = wrapperItem.url
      // 正式列表数据更新
      if (addPhoto2List(result)) {
        photoList.sort((a, b) => +new Date(b.lastModified) - +new Date(a.lastModified))
      }
      wrapperItem.status = UploadStatus.SUCCESS

      // 移除map中的数据
      uploadInfoMap.delete(fileInfo)
      uploadValueMap.delete(key)
    })
    .catch(() => {
      wrapperItem.status = UploadStatus.ERROR
    })
}

const uploadValueMap = new Map<string, FileInfoItem>()
const limit = pLimit(5);
const startUpload = async (values: FileInfoItem[]) => {
  for (const value of values) {
    // 加入待上传列表，同时支持列表里展示
    addWaitUploadList(value)

    // 生成上传信息
    const info = generateUploadInfo(value)

    // 记录开始上传的文件原始信息，重传使用
    uploadValueMap.set(info.key, value)

    limit(() => uloadOneFile(value, info))
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

const afterRead = async (files: any) => {
  // 解析获取图片信息
  const fileInfoList = await Promise.all(
    [files].flat().map(async value => {
      const { file, objectUrl } = value
      const exif = value?.exif || await getImageExif(file)
      const md5 = await getFileMd5Hash(file)
      return {
        file,
        objectUrl,
        name: file.name,
        lastModified: file.lastModified,
        date: file.lastModifiedDate,
        exif,
        md5,
      } as FileInfoItem
    }),
  )

  // 本地MD5重复检测
  const duplicateFiles: string[] = []

  for (const fileInfo of fileInfoList) {
    // 检查是否与已有的待上传列表中的文件MD5重复
    const existingUploadInfo = Array.from(uploadInfoMap.values()).find(info => info.md5 === fileInfo.md5)
    if (existingUploadInfo) {
      fileInfo.repeat = true
      duplicateFiles.push(fileInfo.name)
    }
  }

  // 提示重复文件
  if (duplicateFiles.length > 0) {
    showNotify({
      type: 'warning',
      message: `检测到重复文件${duplicateFiles.length}个，已跳过上传`
    })
  }

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
  loadNext(1, photoList.length)
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

  const files = await Promise.all(selected.map(async v => {
    const _file = await readFile(v, { baseDir: BaseDirectory.Resource })
    const fileInfo = await lstat(v, { baseDir: BaseDirectory.Resource })

    // Uint8Array 转 blob
    const file = new Blob([_file.buffer], { type: 'image/jpeg' })
    const exif = await getImageExif(_file.buffer)
    const name = decodeURIComponent(v).split('/').pop()
    Object.assign(file, {
      name,
      lastModified: +(fileInfo.mtime || new Date()),
      lastModifiedDate: fileInfo.mtime || new Date(),
    })
    return new Promise((resolve) => {
      resolve({
        file,
        objectUrl: URL.createObjectURL(file),
        exif
      })
    })
  }))

  afterRead(files)
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
          <van-button 
            v-if="hasMoreData" 
            @click="handleLoadMore" 
            :loading="pageInfo.lock"
            type="default"
            size="small"
            class="load-more-btn"
          >
            {{ pageInfo.lock ? '加载中...' : '加载更多' }}
          </van-button>
          <div v-else class="no-more-text">没有更多了</div>
        </div>
        <div class="block"></div>
      </main>
    </van-pull-refresh>
    <template v-if="!isDelete">
      <van-button v-if="isTauri" @click="handleOpenFile" class="upload-container tauri-mode">
        <van-icon name="plus" size="16" />
      </van-button>
      <!-- 上传 -->
      <van-uploader v-else class="upload-container" :after-read="afterRead" multiple>
        <van-icon name="plus" size="16" />
      </van-uploader>
    </template>
    <!-- 图片预览 -->
    <PreviewImage :is-delete="isDelete" :album="album" v-model:show="showPreview" :images="photoList"
      :start="startPosition" />
    <!-- 回到顶部 -->
    <van-back-top :bottom="isTauri ? 140 : 110" :right="20" :style="{
      '--van-back-top-icon-size': '16px',
      '--van-back-top-size': '36px',
    }" />
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
h2 {
  padding-left: 10px;
  font-weight: normal;
  font-size: 18px;
  margin: 10px 0;

  .week-day {
    color: #999;
    font-size: 12px;
  }
}

main :deep(.van-grid-item__content) {
  padding: 0;
}

main {
  background-color: #fff;
}

.img-border {
  box-sizing: border-box;
  border-bottom: 1px solid #fff;
  border-right: 1px solid #fff;
  position: relative;
}

.editSelected {
  position: absolute;
  right: 10px;
  bottom: 10px;
}

// 4的倍数
.img-border:nth-child(4n) {
  border-right: none;
}

.block {
  width: 100%;
  height: 40vh;
}

.upload-container {
  position: fixed;
  right: 20px;
  bottom: 60px;
  --van-button-icon-size: 1em;
  z-index: 1;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  background-color: var(--van-primary-color);
  color: #fff;
  border-radius: 50%;
  border: none;

  &.tauri-mode {
    bottom: 90px;
  }

  :deep(.van-uploader__input-wrapper) {
    width: 100%;
    height: 100%;
    position: relative;

    .van-icon {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }
  }

  :deep(.van-uploader__wrapper) {
    width: 100%;
    height: 100%;
  }
}

.upload-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  color: #fff;
  font-size: 12px;
}

.error-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  color: #f53f3f;
  font-size: 12px;
}

.duplicate-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 165, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  color: #fff;
  font-size: 12px;
  flex-direction: column;
  gap: 8px;

  .duplicate-info {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }

  .duplicate-actions {
    display: flex;
    justify-content: center;
    width: 100%;

    :deep(.van-button) {
      --van-button-mini-height: 24px;
      --van-button-mini-font-size: 10px;
      --van-button-mini-padding: 0 8px;
    }
  }
}

.load-more-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px 0;
  background-color: #fff;

  .load-more-btn {
    --van-button-default-background: #f7f8fa;
    --van-button-default-border-color: #ebedf0;
    --van-button-default-color: #646566;
    --van-button-small-height: 32px;
    --van-button-small-padding: 0 16px;
    --van-button-small-font-size: 14px;
    border-radius: 16px;
    min-width: 100px;
  }

  .no-more-text {
    color: #969799;
    font-size: 14px;
    text-align: center;
  }
}
</style>
