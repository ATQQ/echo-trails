<script lang="ts" setup>
import { createAlbum, getAlbums } from '@/service';
import { showToast } from 'vant';
import { ref, reactive, onActivated } from 'vue'
import { useRouter } from 'vue-router';
import PageTitle from '@/components/PageTitle.vue';
import EditAlbumCard from '@/components/EditAlbumCard.vue';
import { preventBack } from '@/lib/router'
import AddButton from '@/components/AddButton.vue';
import ImageCell from '@/components/ImageCell.vue';
import { useLocalStorage } from '@vueuse/core';
import { isTauri } from '@/constants';

// const albumList = reactive<{
//   large: Album[],
//   small: Album[]
// }>({
//   large: [],
//   small: []
// })

// 添加本地存储
const { value: albumList } = useLocalStorage<{
  large: Album[],
  small: Album[]
}>('albumList', {
  large: [],
  small: []
})

const clearAlbumList = () => {
  albumList.large = []
  albumList.small = []
}

const { value: lastUpdateData } = useLocalStorage<{
  lastUpdate: number
}>('lastUpdate', {
  lastUpdate: 0
})
const showEmpty = ref(false)
const loading = ref(false)
const loadAlbum = (_loading = false) => {
  loading.value = _loading
  return getAlbums().then((res) => {
    loading.value = false
    albumList.large = res.large || []
    albumList.small = res.small || []
    showEmpty.value = !albumList.large?.length && !albumList.small?.length
    lastUpdateData.lastUpdate = Date.now()
  })
}

onActivated(() => {
  // 20分钟刷新一次
  if (Date.now() - lastUpdateData.lastUpdate > 1000 * 60 * 20) {
    clearAlbumList()
  }
  loadAlbum()
})

const showAddModal = ref(false)

const addData = reactive({
  name: '',
  description: '',
  isLarge: false,
})

const reset = () => {
  showAddModal.value = false
  addData.name = ''
  addData.description = ''
  addData.isLarge = false
}

const onSubmit = () => {
  createAlbum(addData.name, addData.description, addData.isLarge).then(async () => {
    showToast('创建成功')
    reset()
    loadAlbum()
  })
}

const router = useRouter()
const goToDetail = (albumId: string) => {
  router.push({ name: 'album-photo', params: { albumId } })
}

preventBack(showAddModal)
</script>

<template>
  <van-pull-refresh v-model="loading" @refresh="loadAlbum(true)">
    <PageTitle title="相册" :info="false" />
    <div class="album">
      <van-empty v-if="showEmpty" description="空空如也，快去创建吧" />
      <!-- 大卡片 -->
      <van-grid :column-num="1" :border="false" :gutter="16">
        <van-grid-item v-for="album in albumList.large" :key="album._id">
          <div class="large-card" @click.stop.prevent="goToDetail(album._id)">
            <ImageCell :src="album.cover" />
            <!-- 标题和描述 -->
            <div class="title-desc" :class="{
              noCover: !album.cover
            }">
              <h2>{{ album.name }}</h2>
              <p>{{ album.description }}</p>
            </div>
          </div>
        </van-grid-item>
      </van-grid>
      <!-- 小卡片分类 -->
      <van-grid :gutter="10" :column-num="2" :border="false">
        <van-grid-item v-for="album in albumList.small" :key="album._id">
          <div class="small-card" @click.stop.prevent="goToDetail(album._id)">
            <ImageCell :src="album.cover" />
            <div class="title-desc">
              <h2>{{ album.name }}</h2>
              <p>{{ album.count }}</p>
            </div>
          </div>
        </van-grid-item>
      </van-grid>
    </div>
  </van-pull-refresh>

  <!-- 添加相册 -->
  <AddButton :style="{
    bottom: isTauri ? '90px' : '60px'
  }" @click="showAddModal = true" v-show="!showAddModal" />
  <van-popup @close="showAddModal = false" v-model:show="showAddModal" round position="bottom"
    :style="{ height: '50%' }" @closed="reset">
    <EditAlbumCard @submit="onSubmit" :data="addData" btn-type="primary" />
  </van-popup>
</template>

<style scoped lang="scss">
.album {
  padding-bottom: 60px;
}

.large-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  height: 100vw;
  width: 100%;

  .title-desc {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    color: #fff;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(0, 0, 0, 0.3));
    // -webkit-backdrop-filter: blur(10px);
    // backdrop-filter: blur(10px);
    // box-shadow: 0 0 40px rgba(255, 255, 255, 0.3);

    h2,
    p {
      padding-left: 20px;
    }

    h2 {
      margin-top: 60px;
      margin-bottom: 6px;
    }

    p {
      margin-top: 0;
    }
  }

  .noCover {
    color: #000;
  }
}

.small-card {
  overflow: hidden;

  :deep(.van-image) {
    border-radius: 10px;
    height: 40vw !important;
    width: 40vw !important;
    overflow: hidden;
  }

  .title-desc {
    h2 {
      margin: 2px 0;
      color: #000;
      font-size: 14px;
      font-weight: normal;
    }

    p {
      margin-top: 0;
      font-size: 10px;
      color: #666;
    }
  }
}
</style>
