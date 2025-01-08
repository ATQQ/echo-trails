<script setup lang="ts">
import ExifReader from 'exifreader'
import { reactive, computed, watch, toRefs, ref, onDeactivated, onActivated } from 'vue'
import { addFileInfo, getPhotos, getUploadUrl, uploadFile } from '../service';
import { generateFileKey } from '../lib/file';
import { isTauri, UploadStatus } from '../constants/index'
import { useScroll } from '@vueuse/core'
import PreviewImage from '@/components/PreviewImage.vue';
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { providePhotoListStore } from '@/composables/photoList';
import ImageCell from './ImageCell.vue';
import pLimit from 'p-limit';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, BaseDirectory, lstat } from '@tauri-apps/plugin-fs';

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

const { likedMode = false, album } = defineProps<{
  likedMode?: boolean
  album?: Album
}>()

const { arrivedState } = useScroll(window, {
  offset: { bottom: 200 },
})
const { bottom } = toRefs(arrivedState)

const waitUploadList = reactive<{ key: string, url: string, status: UploadStatus }[]>([])

const showUploadList = computed(() => waitUploadList.filter(v => v.status !== UploadStatus.SUCCESS))

const pageInfo = reactive({
  pageSize: 20,
  pageIndex: 1,
  lock: false,
})

const photoList = reactive<Photo[]>([])

const existPhotoMap = new Map<string, Photo>()

const albumPhotoStore = useAlbumPhotoStore()

const addPhoto2List = (photo: Photo) => {
  if (!existPhotoMap.has(photo.key)) {
    existPhotoMap.set(photo.key, photo)
    photoList.push(photo)
    return true
  }
  return false
}
const showEmpty = ref(false)
const loadNext = async (index = 0, pageSize = 0) => {
  if (!isActive.value) return
  if (pageInfo.lock) return
  pageInfo.lock = true
  // 获取数据
  return getPhotos(index || pageInfo.pageIndex, pageSize || pageInfo.pageSize, {
    likedMode,
    albumId: album?._id
  }).then(res => {
    let addCount = 0
    // 数据去重
    res.forEach(v => {
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
    }
  }).finally(() => {
    pageInfo.lock = false
  })
}

watch(bottom, () => {
  if (bottom.value) {
    loadNext()
  }
})

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
    status: UploadStatus.PENDING,
  }
  const existItem = waitUploadList.find(v => v.key === key)
  if (!existItem) {
    waitUploadList.push(temp)
  }
}

const uloadOneFile = async (fileInfo: FileInfoItem, uploadInfo: UploadInfo) => {
  const key = uploadInfo.key
  const { file } = fileInfo

  // 获取上传链接
  const uploadUrl = await getUploadUrl(key)

  // 获取到上传列表里对应项
  const wrapperItem = waitUploadList.find(v => v.key === key)!
  wrapperItem.status = UploadStatus.UPLOADING

  // 触发上传
  await uploadFile(file, uploadUrl)
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
const limit = pLimit(10);
const startUpload = async (values: FileInfoItem[]) => {
  for (const value of values) {
    // 加入待上传列表，同时支持列表里展示
    addWaitUploadList(value)

    // 生成上传信息
    const info = generateUploadInfo(value)

    // 记录开始上传的文件原始信息，重传使用
    uploadValueMap.set(info.key, value)

    // TODO: 并发控制
    limit(() => uloadOneFile(value, info))
  }
}

const reUpload = (item: { key: string, url: string, status: UploadStatus }) => {
  item.status = UploadStatus.PENDING
  const fileInfo = uploadValueMap.get(item.key)
  if (fileInfo) {
    uloadOneFile(fileInfo, generateUploadInfo(fileInfo))
  }
}

const afterRead = async (files: any) => {
  // 解析获取图片信息
  const fileInfoList = await Promise.all(
    [files].flat().map(async value => {
      const { file, objectUrl } = value
      const exif = value?.exif || await getImageExif(file)

      return {
        file,
        objectUrl,
        name: file.name,
        lastModified: file.lastModified,
        date: file.lastModifiedDate,
        exif,
      } as FileInfoItem
    }),
  )
  startUpload(fileInfoList)
}

const showPreview = ref(false)

const startPosition = ref(0)

const previewImage = (idx: number) => {
  showPreview.value = true
  startPosition.value = idx
}

const loading = ref(false)
const pullRefresh = () => {
  loading.value = true
  loadNext(1, photoList.length)
    ?.finally(() => {
      loading.value = false
    })
}


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
  isEmpty
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
          <van-grid-item v-for="item in showUploadList" :key="item.key">
            <ImageCell :src="item.url">
              <!-- 等待中 -->
              <div v-if="item.status === UploadStatus.PENDING" class="upload-mask">等待上传</div>
              <!-- 上传中 -->
              <div v-if="item.status === UploadStatus.UPLOADING" class="upload-mask">上传中</div>
              <!-- 失败 -->
              <div @click="reUpload(item)" v-else-if="item.status === UploadStatus.ERROR" class="error-mask">上传失败
                <van-icon name="replay" />
              </div>
            </ImageCell>
          </van-grid-item>
        </van-grid>
        <!-- 正常列表 -->
        <template v-for="{ title, photos, weekDay } in showPhotoList" :key="title">
          <h2>{{ title }}<span class="week-day"> - {{ weekDay }}</span></h2>
          <van-grid :border="false" square>
            <van-grid-item v-for="item in photos" :key="item.key">
              <ImageCell @click="previewImage(item.idx)" :src="item.cover" />
            </van-grid-item>
          </van-grid>
        </template>
        <!-- 空白块，用于触发列表滚动加载 -->
        <div class="block"></div>
      </main>
    </van-pull-refresh>
    <van-button v-if="isTauri" @click="handleOpenFile" class="upload-container">
      <van-icon name="plus" size="16" />
    </van-button>
    <!-- 上传 -->
    <van-uploader v-else class="upload-container" :after-read="afterRead" multiple>
      <van-icon name="plus" size="16" />
    </van-uploader>
    <!-- 图片预览 -->
    <PreviewImage :album="album" v-model:show="showPreview" :images="photoList" :start="startPosition" />
    <!-- 回到顶部 -->
    <van-back-top :bottom="110" :right="20" :style="{
      '--van-back-top-icon-size': '16px',
      '--van-back-top-size': '36px',
    }" />
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
</style>
