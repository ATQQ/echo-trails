<script lang="ts" setup>
import { createAlbum, getAlbums } from '@/service';
import { showToast } from 'vant';
import { ref, reactive, onActivated, computed } from 'vue'
import { useRouter } from 'vue-router';
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import EditAlbumCard from '@/components/EditAlbumCard/EditAlbumCard.vue';
import { preventBack } from '@/lib/router'
import AddButton from '@/components/AddButton/AddButton.vue';
import ImageCell from '@/components/ImageCell/ImageCell.vue';
import { useTTLStorage } from '@/composables/useTTLStorage';

// 添加本地存储
const { data: albumList, load: loadCache, save: saveCache } = useTTLStorage<{
  large: Album[],
  small: Album[]
}>({
  key: 'albumList',
  initialValue: {
    large: [],
    small: []
  },
  ttl: 15 * 60 * 1000
})

type SortType = 'time' | 'time_asc' | 'tag'
const sortType = ref<SortType>((localStorage.getItem('album_sort_type') as SortType) || 'time')
const showSortPopover = ref(false)
const sortActions = computed(() => [
  { text: '按时间排序', value: 'time', color: sortType.value === 'time' ? '#1989fa' : '' },
  { text: '按时间逆序', value: 'time_asc', color: sortType.value === 'time_asc' ? '#1989fa' : '' },
  { text: '按标签排序', value: 'tag', color: sortType.value === 'tag' ? '#1989fa' : '' },
])

const onSelectSort = (action: { value: SortType }) => {
  sortType.value = action.value
  localStorage.setItem('album_sort_type', action.value)
}

const sortAlbums = (albums: Album[]) => {
  if (!albums) return []
  // 1. 空相册置底
  // 2. 标签排序：有相同标签的排在一起 (按第一个标签聚类)，组内按时间倒序
  // 3. 时间排序：按 createdAt 倒序

  const list = [...albums]

  return list.sort((a, b) => {
    // 规则1: 空相册置底
    if (a.count === 0 && b.count !== 0) return 1
    if (a.count !== 0 && b.count === 0) return -1
    // 如果都是空相册，按时间排序
    if (a.count === 0 && b.count === 0) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    }

    // 规则2: 标签排序
    if (sortType.value === 'tag') {
      const tagA = a.tags?.[0] || ''
      const tagB = b.tags?.[0] || ''

      // 有标签的排前面
      if (tagA && !tagB) return -1
      if (!tagA && tagB) return 1

      // 按标签名聚类 (相同标签名在一起)
      const tagCompare = tagA.localeCompare(tagB, 'zh-CN')
      if (tagCompare !== 0) return tagCompare
    }

    const timeA = new Date(a.createdAt || 0).getTime()
    const timeB = new Date(b.createdAt || 0).getTime()

    // 规则4: 时间正序 (逆序)
    if (sortType.value === 'time_asc') {
      return timeA - timeB
    }

    // 规则3 (默认): 时间倒序
    return timeB - timeA
  })
}

const displayAlbumList = computed(() => {
  return {
    large: sortAlbums(albumList.value.large),
    small: sortAlbums(albumList.value.small)
  }
})

const showEmpty = ref(false)
const loading = ref(false)
const loadAlbum = (_loading = false) => {
  loading.value = _loading
  return getAlbums().then((res) => {
    loading.value = false
    albumList.value.large = res.large || []
    albumList.value.small = res.small || []
    showEmpty.value = !albumList.value.large?.length && !albumList.value.small?.length
    saveCache()
  })
}

onActivated(() => {
  // 在这里如果有预请求数据直接回填，不用再发起请求
  if ((window as any).__PREFETCHED_ALBUMS__) {
    const data = (window as any).__PREFETCHED_ALBUMS__
    albumList.value.large = data.large || []
    albumList.value.small = data.small || []
    showEmpty.value = !albumList.value.large?.length && !albumList.value.small?.length
    saveCache()
    delete (window as any).__PREFETCHED_ALBUMS__
  } else {
    // 尝试加载缓存
    const loaded = loadCache()
    if (!loaded) {
      // 缓存失效或不存在
      const isEmpty = !albumList.value.large?.length && !albumList.value.small?.length
      loadAlbum(isEmpty)
    } else {
      // 缓存加载成功，更新empty状态
      showEmpty.value = !albumList.value.large?.length && !albumList.value.small?.length

      // 异步更新一下数据
      loadAlbum(false)
    }
  }
})

const showAddModal = ref(false)

const addData = reactive({
  name: '',
  description: '',
  isLarge: false,
  tags: [] as string[]
})

const reset = () => {
  showAddModal.value = false
  addData.name = ''
  addData.description = ''
  addData.isLarge = false
  addData.tags = []
}

const onSubmit = () => {
  createAlbum(addData.name, addData.description, addData.isLarge, addData.tags).then(async () => {
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
    <PageTitle title="相册" :info="false">
      <template #action>
        <!-- 我喜欢入口 -->
        <van-icon name="like-o" size="18" color="#333" style="margin-right: 16px;" @click="router.push('/like')" />
        <van-popover v-model:show="showSortPopover" :actions="sortActions" @select="onSelectSort"
          placement="bottom-end">
          <template #reference>
            <van-icon style="margin-right: 16px;" name="sort" size="18" color="#333" />
          </template>
        </van-popover>
      </template>
    </PageTitle>
    <div class="album">
      <div v-if="loading && !displayAlbumList.large?.length && !displayAlbumList.small?.length"
        class="skeleton-container">
        <div class="skeleton-large skeleton-bg"></div>
        <div class="skeleton-grid">
          <div class="skeleton-small skeleton-bg" v-for="i in 4" :key="i"></div>
        </div>
      </div>
      <template v-else>
        <van-empty v-if="showEmpty" description="空空如也，快去创建吧" />
        <!-- 大卡片 -->
        <van-grid :column-num="1" :border="false" :gutter="16">
          <van-grid-item v-for="album in displayAlbumList.large" :key="album._id">
            <div class="large-card" @click.stop.prevent="goToDetail(album._id)">
              <ImageCell :src="album.cover" />
              <!-- 标题和描述 -->
              <div class="title-desc" :class="{
                noCover: !album.cover
              }">
                <h2>{{ album.name }}
                  <span v-if="album.tags?.length" class="tags">
                    <span v-for="tag in album.tags" :key="tag" class="tag">{{ tag }}</span>
                  </span>
                </h2>
                <p>{{ album.description }}</p>
              </div>
            </div>
          </van-grid-item>
        </van-grid>
        <!-- 小卡片分类 -->
        <van-grid :gutter="10" :column-num="2" :border="false">
          <van-grid-item v-for="album in displayAlbumList.small" :key="album._id">
            <div class="small-card" @click.stop.prevent="goToDetail(album._id)">
              <ImageCell :src="album.cover" />
              <div class="title-desc">
                <h2>{{ album.name }}
                  <span v-if="album.tags?.length" class="tags">
                    <span v-for="tag in album.tags" :key="tag" class="tag">{{ tag }}</span>
                  </span>
                </h2>
                <p>{{ album.count }}</p>
              </div>
            </div>
          </van-grid-item>
        </van-grid>
      </template>
    </div>
  </van-pull-refresh>
  <!-- 回到顶部 -->
  <van-back-top :bottom="'calc(var(--footer-area-height) + 48px)'" :right="20" :style="{
    '--van-back-top-icon-size': '16px',
    '--van-back-top-size': '36px',
  }" />
  <!-- 添加相册 -->
  <AddButton class="add-position" @click="showAddModal = true" v-show="!showAddModal" />
  <van-popup @close="showAddModal = false" v-model:show="showAddModal" round position="bottom"
    :style="{ height: '50%' }" @closed="reset">
    <EditAlbumCard @submit="onSubmit" :data="addData" btn-type="primary" />
  </van-popup>
</template>

<style scoped lang="scss">
.album {
  padding-bottom: var(--footer-area-height);
}

.add-position {
  bottom: var(--footer-area-height);
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
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tags {
      display: inline-flex;
      gap: 4px;
    }

    .tag {
      font-size: 10px;
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 4px;
      border-radius: 4px;
      font-weight: normal;
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
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }

    .tags {
      display: inline-flex;
      gap: 4px;
    }

    .tag {
      font-size: 10px;
      background: rgba(0, 0, 0, 0.05);
      padding: 1px 3px;
      border-radius: 4px;
      color: #666;
    }

    p {
      margin-top: 0;
      font-size: 10px;
      color: #666;
    }
  }
}

.skeleton-container {
  padding: 10px;
}

.skeleton-bg {
  background: linear-gradient(90deg, #f2f3f5 25%, #e6e8eb 37%, #f2f3f5 63%);
  background-size: 400% 100%;
  border-radius: 10px;
  animation: skeleton-loading 1.4s ease infinite;
}

.skeleton-large {
  width: 100%;
  height: 100vw;
  margin-bottom: 16px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.skeleton-small {
  width: 100%;
  height: 40vw;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}
</style>
