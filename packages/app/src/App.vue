<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import HelloWorld from './components/HelloWorld.vue'
import EXIF from 'exif-js'

function getImageExif(img) {
  return new Promise((resolve) => {
    img.onload = () => {
      EXIF.getData(img, function () {
        const tags = EXIF.getAllTags(this);
        resolve(tags)
        const pretty = EXIF.pretty(this);
        console.log(pretty);
      });
    }
  })
}

const startUpload = () => {
  console.log('开始上传');
}

const afterRead = async (files) => {
  // TODO: 校验格式，过滤出图片
  // 解析获取图片信息
  const fileInfoList = [files].flat().map((value) => {
    const { file, objectUrl } = value
    const image = new Image()
    image.src = objectUrl
    const exifData = getImageExif(image)
    return {
      file,
      objectUrl,
      name: file.name,
      lastModified: file.lastModified,
      date: file.lastModifiedDate.toLocaleString(),
      exifData
    }
  })
  fileInfoList.forEach(async (fileInfo) => {
    const { exifData, ...rest } = fileInfo
    console.log(await exifData);
    console.log(rest);
  })
  // 加入上传预览列表
  // console.log(fileInfoList);
  startUpload();
}

</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />
    <div class="wrapper">
      <van-uploader :after-read="afterRead" multiple>
        <van-button icon="plus" type="primary">上传文件</van-button>
      </van-uploader>
      <HelloWorld msg="You did it!" />
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
    </div>
  </header>

  <RouterView />
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
