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
  // TODO：加入上传预览列表
  startUpload(fileInfoList)
}
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />
    <div class="wrapper">
      <van-uploader :after-read="afterRead" multiple>
        <van-button icon="plus" type="primary">上传文件</van-button>
      </van-uploader>
    </div>
  </header>

  <pre>
    {{ showJSON }}
  </pre>
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

nav {
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-top: 2rem;
}

nav a.router-link-exact-active {
  color: var(--color-text);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 1rem;
  }
}
</style>
