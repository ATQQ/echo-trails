<script lang="ts" setup>
import { getAlbums } from '@/service';
import { ref, reactive, onActivated, computed } from 'vue'
import { useRouter } from 'vue-router';
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import AlbumEditModal from '@/components/EditAlbumCard/AlbumEditModal.vue';
import { preventBack } from '@/lib/router'
import AddButton from '@/components/AddButton/AddButton.vue';
import ImageCell from '@/components/ImageCell/ImageCell.vue';
import { useTTLStorage } from '@/composables/useTTLStorage';
import { useRecentAlbums } from '@/composables/useRecentAlbums';
import { useTagStyles, type TagStyle } from '@/composables/useTagStyles';
import { useScrollRestore } from '@/composables/useScrollRestore';

const scrollContainer = ref<any>(null)
useScrollRestore(scrollContainer)

const { addRecent, getRecentIndex } = useRecentAlbums()
const { tagStyles, setStyle, getStyle } = useTagStyles()

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
  ttl: 15 * 60 * 1000,
  persistInTauri: true // 开启离线支持，Tauri 环境下即使过期也先加载缓存
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
  const sortedSmall = sortAlbums(albumList.value.small)

  // 分组标签
  const tagMap = new Map<string, Album[]>()
  sortedSmall.forEach(album => {
    if (album.tags && album.tags.length > 0) {
      album.tags.forEach(tag => {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, [])
        }
        tagMap.get(tag)!.push(album)
      })
    }
  })

  const tagGroups = Array.from(tagMap.entries()).map(([tag, albums]) => {
    return {
      tag,
      albums,
      style: getStyle(tag)
    }
  })

  return {
    large: sortAlbums(albumList.value.large),
    allSmall: sortedSmall.slice(0, 6),
    tagGroups
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

      // 异步更新一下数据，不设置全局 loading，避免闪烁
      loadAlbum(false).catch(e => {
        console.warn('Silent refresh failed (might be offline):', e)
      })
    }
  }
})

const showAddModal = ref(false)
const currentEditId = ref('')
const currentEditData = ref<Album | undefined>(undefined)

const isScrolled = ref(false)
const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  if (target) {
    isScrolled.value = target.scrollTop > 20
  }
}

const handleLongPress = (album: Album) => {
  currentEditId.value = album._id
  currentEditData.value = album
  showAddModal.value = true
}

const handleContextMenu = (e: Event, album: Album) => {
  e.preventDefault()
  handleLongPress(album)
}

const handleAddClick = () => {
  currentEditId.value = ''
  currentEditData.value = undefined
  showAddModal.value = true
}

const router = useRouter()
const goToDetail = (albumId: string) => {
  if (isLongPressTriggered) {
    isLongPressTriggered = false
    return
  }
  addRecent(albumId)
  router.push({ name: 'album-photo', params: { albumId } })
}

let touchTimer: any = null
let isLongPressTriggered = false

const handleTouchStart = (album: Album) => {
  isLongPressTriggered = false
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = setTimeout(() => {
    isLongPressTriggered = true
    handleLongPress(album)
  }, 500)
}
const handleTouchEnd = () => {
  if (touchTimer) {
    clearTimeout(touchTimer)
    touchTimer = null
  }
}

const goToAllAlbums = () => {
  router.push('/album/all')
}

const changeTagStyle = (tag: string) => {
  const currentStyle = getStyle(tag)
  const newStyle = currentStyle === 'square' ? 'portrait' : 'square'
  setStyle(tag, newStyle)
}

preventBack(showAddModal)
</script>

<template>
  <div class="app-wrapper">
    <div class="top-blur-mask" :class="{ 'is-visible': isScrolled }"></div>
    <van-pull-refresh v-model="loading" @refresh="loadAlbum(true)" ref="scrollContainer" class="pull-refresh-container" @scroll="handleScroll">
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
      <div v-if="loading && !displayAlbumList.large?.length && !displayAlbumList.allSmall?.length"
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
            <div class="large-card" @click.stop.prevent="goToDetail(album._id)"
                 @contextmenu="handleContextMenu($event, album)"
                 @touchstart="handleTouchStart(album)"
                 @touchend="handleTouchEnd"
                 @touchcancel="handleTouchEnd"
                 @touchmove="handleTouchEnd">
              <ImageCell :src="album.cover" :cache-key="album.coverKey ? album.coverKey + '_cover' : undefined" />
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
        <!-- 全部相册区块 -->
        <div class="section" v-if="displayAlbumList.allSmall?.length">
          <div class="section-header" @click="goToAllAlbums">
            <h2>全部相册</h2>
            <van-icon name="arrow" />
          </div>
          <van-grid :gutter="10" :column-num="3" :border="false" class="small-card-grid">
            <van-grid-item v-for="album in displayAlbumList.allSmall" :key="album._id">
              <div class="small-card" @click.stop.prevent="goToDetail(album._id)"
                   @contextmenu="handleContextMenu($event, album)"
                   @touchstart="handleTouchStart(album)"
                   @touchend="handleTouchEnd"
                   @touchcancel="handleTouchEnd"
                   @touchmove="handleTouchEnd">
                <ImageCell :src="album.cover" :cache-key="album.coverKey ? album.coverKey + '_cover' : undefined" />
                <div class="title-desc">
                  <h2>{{ album.name }}</h2>
                  <p>{{ album.count }}</p>
                </div>
              </div>
            </van-grid-item>
          </van-grid>
        </div>

        <!-- 标签分组区块 -->
        <div class="section tag-section" v-for="group in displayAlbumList.tagGroups" :key="group.tag">
          <div class="section-header">
            <h2>{{ group.tag }}</h2>
            <van-icon name="exchange" @click.stop="changeTagStyle(group.tag)" />
          </div>
          <div class="horizontal-scroll">
            <div class="scroll-item" :class="group.style" v-for="album in group.albums" :key="album._id" @click.stop.prevent="goToDetail(album._id)"
                 @contextmenu="handleContextMenu($event, album)"
                 @touchstart="handleTouchStart(album)"
                 @touchend="handleTouchEnd"
                 @touchcancel="handleTouchEnd"
                 @touchmove="handleTouchEnd">
              <ImageCell :src="album.cover" :cache-key="album.coverKey ? album.coverKey + '_cover' : undefined" />
              <div class="title-desc">
                <h2>{{ album.name }}</h2>
                <p>{{ album.count }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
    </van-pull-refresh>
  <!-- 回到顶部 -->
  <van-back-top :bottom="'calc(var(--footer-area-height) + 48px)'" :right="20" :style="{
    '--van-back-top-icon-size': '16px',
    '--van-back-top-size': '36px',
  }" />
  <!-- 添加相册 -->
  <AddButton class="add-position" @click="handleAddClick" v-show="!showAddModal" />
    <AlbumEditModal v-model:visible="showAddModal" :edit-id="currentEditId" :initial-data="currentEditData" @success="loadAlbum()" />
  </div>
</template>

<style scoped lang="scss">
.app-wrapper {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.pull-refresh-container {
  flex: 1;
  overflow-y: auto;
}

.top-blur-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 120px;
  pointer-events: none;
  z-index: 10;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.top-blur-mask.is-visible {
  opacity: 1;
}

.popup-content {
  padding: 16px;
  padding-bottom: env(safe-area-inset-bottom);
}

.popup-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: #333;
}

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

.section {
  margin-top: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.horizontal-scroll {
  display: flex;
  overflow-x: auto;
  gap: 12px;
  padding: 0 16px;
  scroll-padding-left: 16px;
  scroll-padding-right: 16px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar {
    display: none;
  }

  .scroll-item {
    flex-shrink: 0;
    scroll-snap-align: start;
    border-radius: 12px;
    overflow: hidden;
    position: relative;

    :deep(.van-image) {
      border-radius: 12px;
      overflow: hidden;
      width: 100% !important;
      height: 100% !important;
    }

    &.square {
      width: 32vw;
      aspect-ratio: 1 / 1.15;

      .title-desc {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 24px 10px 10px;
        background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.5));

        h2 {
          margin: 0;
          color: #fff;
          font-size: 15px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        p {
          display: none;
        }
      }
    }

    &.portrait {
      width: 62vw;
      aspect-ratio: 3 / 4;

      .title-desc {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 24px 12px 12px;
        background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.7));
        color: #fff;

        h2 {
          margin: 0;
          color: #fff;
          font-size: 15px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        p {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.8);
        }
      }
    }
  }
}

.small-card-grid {
  :deep(.van-grid-item) {
    flex-basis: 33.333333% !important;
    max-width: 33.333333% !important;
  }
  :deep(.van-grid-item__content) {
    padding: 0;
    background-color: transparent;
  }
}

.small-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  :deep(.van-image) {
    border-radius: 12px;
    width: 100% !important;
    aspect-ratio: 1 / 1;
    height: auto !important;
    overflow: hidden;
  }

  .title-desc {
    margin-top: 6px;
    width: 100%;
    overflow: hidden;
    h2 {
      margin: 0;
      color: #333;
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    p {
      margin: 2px 0 0 0;
      font-size: 12px;
      color: #999;
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
