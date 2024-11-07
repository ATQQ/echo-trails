<script setup lang="ts">
import ExifReader from 'exifreader'
import { ref } from 'vue'
import { addFileInfo } from './service';
import { generateFileKey } from './lib/file';

const showJSON = ref('')

function getImageExif(file: File) {
  return ExifReader.load(file)
}

const startUpload = async (values: any) => {
  for (const value of values) {
    const { exif, lastModified, file } = value
    let name = file.name
    name = name.replace(/\s+/g, '_') // 去除空格
    const info = {
      key: generateFileKey(value),
      name,
      lastModified,
      exif,
      size: file.size,
      type: file.type,
    }
    // 加入待上传列表，同时预览
    //  待上传展示列表用computed 过滤
    // 触发上传
    //  上传完修改状态，闭包 通过key 遍历修改状态
    //  数据落库
    //  正式列表数据更新
    //  正式列表展示使用 computed 进行groupBy分组
    showJSON.value = JSON.stringify(info, null, 2)
    addFileInfo(info)
  }
  // 加入上传列表
  // 遍历上传
  // key 生成（图片日期），
  // 获取token

  // 上传中状态修改
  // 上传结果状态修改
  // 上传完成记录数据
  // 展示列表更新
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
  // showImagePreview({
  //   images: [
  //     'https://fastly.jsdelivr.net/npm/@vant/assets/apple-1.jpeg',
  //     'https://fastly.jsdelivr.net/npm/@vant/assets/apple-2.jpeg',
  //   ],
  //   startPosition: idx,
  // });
}
</script>

<template>
  <div class="wrapper">
    <!-- 待上传列表 -->
    <!-- 正常列表 -->
    <van-grid square>
      <van-grid-item v-for="value in 100" :key="value">
        <van-image @click="previewImage(value)" fit="cover" position="center" width="100%" height="100%" lazy-load
          src="https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg">
          <template v-slot:loading>
            <van-loading type="spinner" size="20" />
          </template>
        </van-image>
      </van-grid-item>
    </van-grid>
  </div>
  <!-- <van-uploader :after-read="afterRead" multiple>
    <van-button icon="plus" type="primary">上传文件</van-button>
  </van-uploader>
  <pre>
    {{ showJSON }}
  </pre> -->
</template>

<style scoped>
.wrapper :deep(.van-grid-item__content) {
  padding: 0;
}
</style>
