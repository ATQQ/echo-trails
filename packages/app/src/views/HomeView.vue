<script setup lang="ts">
import ExifReader from 'exifreader'
import { reactive, computed, onMounted, ref, watch } from 'vue'
import { addFileInfo, getPhotos, getUploadUrl, uploadFile } from './../service';
import { generateFileKey } from '../lib/file';
import { UploadStatus } from '../constants/index'
import { showImagePreview } from 'vant';
import { useScroll } from '@vueuse/core'

const el = ref<HTMLElement | null>(null)
const { arrivedState } = useScroll(el, {
  offset: {
    bottom: 0
  }
})


const waitUploadList = reactive<{ key: string, url: string, status: UploadStatus }[]>([])

const showUploadList = computed(() => waitUploadList.filter(v => v.status !== UploadStatus.SUCCESS))

const pageInfo = reactive({
  pageSize: 20,
  pageIndex: 1,
  lock: false,
})

const photoList = reactive<Photo[]>([])

const loadNext = () => {
  if (pageInfo.lock) return
  pageInfo.lock = true
  // 获取数据
  getPhotos(pageInfo.pageIndex, pageInfo.pageSize).then(res => {
    // TODO：数据去重
    // TODO：数据有更新，不够时，页码重新计算
    pageInfo.pageIndex += 1
    photoList.push(...res)
  }).finally(() => {
    pageInfo.lock = false
  })
}

watch(() => arrivedState.bottom, () => {
  if (arrivedState.bottom) {
    // TODO: bug
    console.log('到底了');
    loadNext()
  }
})

// 正式列表展示使用 computed 进行groupBy分组
const showPhotoList = computed(() => {
  // 按照 category 进行分组
  return photoList.reduce<{ title: string, photos: (Photo & { idx: number })[] }[]>((pre, cur, idx) => {
    const { category } = cur
    const existCategory = pre.find(v => v.title === category)
    const expandValue = {
      idx,
      ...cur
    }
    if (existCategory) {
      existCategory.photos.push(expandValue)
    } else {
      pre.push({
        title: category,
        photos: [expandValue]
      })
    }
    return pre
  }, [])
})

function getImageExif(file: File) {
  try {
    return ExifReader.load(file)
  } catch {
    return {}
  }
}

const startUpload = async (values: any) => {
  for (const value of values) {
    const { exif, lastModified, file } = value
    let name = file.name
    name = name.replace(/\s+/g, '_') // 去除空格
    const key = generateFileKey(value)
    const info = {
      key,
      name,
      lastModified,
      exif,
      size: file.size,
      type: file.type,
    }
    // 加入待上传列表，同时预览
    const temp = {
      key,
      url: value.objectUrl,
      status: UploadStatus.PENDING,
    }
    waitUploadList.push(temp)
    getUploadUrl(key).then(value => {
      const wrapperItem = waitUploadList.find(v => v.key === key)!
      // 触发上传
      wrapperItem.status = UploadStatus.UPLOADING
      uploadFile(file, value)
        .then(async () => {
          wrapperItem.status = UploadStatus.SUCCESS
          //  数据落库
          const result = await addFileInfo(info)
          //  正式列表数据更新
          photoList.push(result)
        })
        .catch(() => {
          wrapperItem.status = UploadStatus.ERROR
        })
      // setTimeout(async () => {
      //   //  上传完修改状态
      //   wrapperItem.status = UploadStatus.SUCCESS
      //   //  数据落库
      //   const result = await addFileInfo(info)
      //   //  正式列表数据更新
      //   photoList.push(result)
      // }, 1000)

    })

  }
}

const afterRead = async (files: any) => {
  // TODO: 校验格式，过滤出图片
  // 解析获取图片信息
  const fileInfoList = await Promise.all(
    [files].flat().map(async value => {
      const { file, objectUrl } = value
      const exif = await getImageExif(file)

      return {
        file,
        objectUrl,
        name: file.name,
        lastModified: file.lastModified,
        date: file.lastModifiedDate,
        exif,
      }
    }),
  )
  startUpload(fileInfoList)
}

const previewImage = (idx: number) => {
  // TODO: 图片预览
  showImagePreview({
    images: photoList.map(v => v.preview),
    startPosition: idx,
  });
}
</script>

<template>
  <main ref="el">
    <h1>照片</h1>
    <!-- 待上传列表 -->
    <van-grid square>
      <van-grid-item v-for="item in showUploadList" :key="item.key">
        <van-image fit="cover" position="center" width="100%" height="100%" lazy-load :src="item.url">
          <template v-slot:loading>
            <van-loading type="spinner" size="20" />
          </template>
        </van-image>
      </van-grid-item>
    </van-grid>
    <!-- 正常列表 -->
    <template v-for="{ title, photos } in showPhotoList" :key="title">
      <h2>{{ title }}</h2>
      <van-grid square>
        <van-grid-item v-for="item in photos" :key="item.key">
          <van-image @click="previewImage(item.idx)" fit="cover" position="center" width="100%" height="100%" lazy-load
            :src="item.cover">
            <template v-slot:loading>
              <van-loading type="spinner" size="20" />
            </template>
          </van-image>
        </van-grid-item>
      </van-grid>
    </template>
    <!-- <van-grid square>
      <van-grid-item v-for="(item, idx) in showPhotoList" :key="item.key">
        <van-image @click="previewImage(idx)" fit="cover" position="center" width="100%" height="100%" lazy-load
          :src="item.cover">
          <template v-slot:loading>
            <van-loading type="spinner" size="20" />
          </template>
        </van-image>
      </van-grid-item>
    </van-grid> -->
    <div class="upload-container">
      <van-uploader :after-read="afterRead" multiple>
        <van-button icon="plus" type="primary" round></van-button>
      </van-uploader>
    </div>
  </main>
</template>
<style scoped lang="scss">
h1 {
  font-weight: lighter;
  margin-bottom: 0;
}

h2 {
  font-weight: normal;
}

main :deep(.van-grid-item__content) {
  padding: 0;
}

main {
  margin-bottom: 60px;
  background-color: #fff;
}

.upload-container {
  position: fixed;
  right: 10px;
  bottom: 60px;
  --van-button-icon-size: 1em;
  z-index: 1;

  :deep(.van-uploader__input) {}
}
</style>
