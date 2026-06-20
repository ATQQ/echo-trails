<script lang="ts" setup>
import { getAlbums, getAlbumFolders, deleteAlbumFolder } from '@/service';
import { ref, computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router';
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import AlbumEditModal from '@/components/EditAlbumCard/AlbumEditModal.vue';
import FolderEditModal from '@/components/FolderEditCard/FolderEditModal.vue';
import { preventBack } from '@/lib/router'
import AddButton from '@/components/AddButton/AddButton.vue';
import ImageCell from '@/components/ImageCell/ImageCell.vue';
import { useTTLStorage } from '@/composables/useTTLStorage';
import { useRecentAlbums } from '@/composables/useRecentAlbums';
import { useScrollRestore } from '@/composables/useScrollRestore';
import { notifyAlbumsChanged, onAlbumsChanged } from '@/lib/albumEvents';
import { sortAlbums as sortAlbumList, type AlbumSortType } from '@/lib/albumSort';
import { showToast, showConfirmDialog } from 'vant';

defineOptions({
  name: 'AllAlbumView'
})

const scrollContainer = ref<HTMLElement | null>(null)
useScrollRestore(scrollContainer)

const { addRecent } = useRecentAlbums()

// Tab 状态
const activeTab = ref<'all' | 'folders'>('all')
const showStickySafeArea = ref(false)

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

// 文件夹数据
const { data: folderList, load: loadFolderCache, save: saveFolderCache } = useTTLStorage<AlbumFolder[]>({
  key: 'albumFolders',
  initialValue: [],
  ttl: 15 * 60 * 1000,
  persistInTauri: true
})

// 全部相册 tab 的数据和逻辑
type SortType = AlbumSortType
const sortType = ref<SortType>((localStorage.getItem('all_album_sort_type') as SortType) || 'tag')
const showSortPopover = ref(false)
const searchKeyword = ref('')
const activeTag = ref('')
const sortActions = computed(() => [
  { text: '按时间排序', value: 'time', color: sortType.value === 'time' ? '#1989fa' : '' },
  { text: '按时间逆序', value: 'time_asc', color: sortType.value === 'time_asc' ? '#1989fa' : '' },
  { text: '按标签排序', value: 'tag', color: sortType.value === 'tag' ? '#1989fa' : '' },
])

const onSelectSort = (action: { value: SortType }) => {
  sortType.value = action.value
  localStorage.setItem('all_album_sort_type', action.value)
}

const displayAlbumList = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const selectedTag = activeTag.value
  const albums = [
    ...(albumList.value.large || []),
    ...(albumList.value.small || [])
  ]
  const filtered = albums.filter(album => {
    const matchKeyword = keyword
      ? (album.name || '').toLowerCase().includes(keyword)
      : true
    const matchTag = selectedTag
      ? album.tags?.includes(selectedTag)
      : true

    return matchKeyword && matchTag
  })

  return sortAlbumList(filtered, sortType.value)
})

const albumTags = computed(() => {
  const tagMap = new Map<string, number>()
  const albums = [
    ...(albumList.value.large || []),
    ...(albumList.value.small || [])
  ]

  albums.forEach(album => {
    album.tags?.forEach(tag => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1)
    })
  })

  return Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name, 'zh-CN')
    })
})

const toggleTag = (tag: string) => {
  activeTag.value = activeTag.value === tag ? '' : tag
}

const displayFolderList = computed(() => {
  return [...(folderList.value || [])].sort((a, b) => {
    const aHasAlbums = (a.albumCount || 0) > 0
    const bHasAlbums = (b.albumCount || 0) > 0
    if (aHasAlbums !== bHasAlbums) return aHasAlbums ? -1 : 1

    const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime()
    const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime()
    return timeB - timeA
  })
})

const router = useRouter()

// 公共逻辑
const showEmpty = ref(false)
const loading = ref(false)

const loadAlbum = async (_loading = false) => {
  loading.value = _loading
  try {
    const res = await getAlbums()
    albumList.value.large = res.large || []
    albumList.value.small = res.small || []
    showEmpty.value = !albumList.value.large?.length && !albumList.value.small?.length
    saveCache()
  } finally {
    loading.value = false
  }
}

const loadFolders = async (_loading = false) => {
  try {
    const folders = await getAlbumFolders()
    folderList.value = folders || []
    saveFolderCache()
  } catch (e) {
    console.warn('Load folders failed:', e)
  }
}

const loadAll = async (_loading = false) => {
  loading.value = _loading
  try {
    await Promise.all([loadAlbum(false), loadFolders(false)])
  } finally {
    loading.value = false
  }
}

const albumChangeSource = 'all-album-view'
const handleAlbumSaved = async () => {
  try {
    await loadAlbum(false)
  } finally {
    notifyAlbumsChanged(albumChangeSource)
  }
}

const handleFolderChanged = async () => {
  await loadFolders(false)
}

onActivated(() => {
  nextTick(() => {
    startScrollStateWatcher()
    updateScrollState(getScrollElement())
  })
  // 在这里如果有预请求数据直接回填，不用再发起请求
  if ((window as any).__PREFETCHED_ALBUMS__) {
    const data = (window as any).__PREFETCHED_ALBUMS__
    albumList.value.large = data.large || []
    albumList.value.small = data.small || []
    showEmpty.value = !albumList.value.large?.length && !albumList.value.small?.length
    saveCache()
    delete (window as any).__PREFETCHED_ALBUMS__
    loadFolders(false)
  } else {
    // 尝试加载缓存
    const loaded = loadCache()
    loadFolderCache()
    if (!loaded) {
      // 缓存失效或不存在
      const isEmpty = !albumList.value.large?.length && !albumList.value.small?.length
      loadAll(isEmpty)
    } else {
      // 缓存加载成功，更新empty状态
      showEmpty.value = !albumList.value.large?.length && !albumList.value.small?.length

      // 异步更新一下数据，不设置全局 loading，避免闪烁
      loadAll(false).catch(e => {
        console.warn('Silent refresh failed (may be offline):', e)
      })
    }
  }
})

let stopAlbumsChangedListener: (() => void) | undefined
onMounted(() => {
  startScrollStateWatcher()
  nextTick(() => updateScrollState(getScrollElement()))
  stopAlbumsChangedListener = onAlbumsChanged((detail) => {
    if (detail.source === albumChangeSource) return
    loadAll(false).catch(e => {
      console.warn('Refresh all albums from change event failed:', e)
    })
  })
})

onDeactivated(() => {
  stopScrollStateWatcher()
})

onUnmounted(() => {
  stopScrollStateWatcher()
  stopAlbumsChangedListener?.()
})

// 弹窗和按钮逻辑
const showAddModal = ref(false)
const currentEditId = ref('')
const currentEditData = ref<Album | undefined>(undefined)
const showFolderModal = ref(false)
const currentFolderEditId = ref('')
const currentFolderEditData = ref<AlbumFolder | undefined>(undefined)
const folderSelectMode = ref(false)
const selectedFolderIds = ref<string[]>([])

const isFolderSelected = (folderId: string) => selectedFolderIds.value.includes(folderId)

const toggleFolderSelection = (folderId: string) => {
  const index = selectedFolderIds.value.indexOf(folderId)
  if (index === -1) {
    selectedFolderIds.value = [...selectedFolderIds.value, folderId]
  } else {
    selectedFolderIds.value = selectedFolderIds.value.filter(id => id !== folderId)
  }
}

const exitFolderSelectMode = () => {
  folderSelectMode.value = false
  selectedFolderIds.value = []
}

const enterFolderSelectMode = (folderId: string) => {
  folderSelectMode.value = true
  selectedFolderIds.value = [folderId]
}

watch(activeTab, (tab) => {
  if (tab !== 'folders') {
    exitFolderSelectMode()
  }
})

watch(folderSelectMode, (val) => {
  if (!val) {
    selectedFolderIds.value = []
  }
})

const isScrolled = ref(false)

const getSafeAreaTop = () => {
  const value = getComputedStyle(document.body).getPropertyValue('--safe-area-top')
    || getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top')
  return Number.parseFloat(value) || 0
}

const updateScrollState = (target: HTMLElement | null) => {
  if (!target) return
  isScrolled.value = target.scrollTop > 20
  showStickySafeArea.value = target.scrollTop > getSafeAreaTop()
}

const getScrollElement = () => {
  return document.querySelector<HTMLElement>('.pull-refresh-container')
}

const handleScroll = (e: Event) => {
  updateScrollState(e.target as HTMLElement)
}

let scrollStateTimer: number | undefined
const startScrollStateWatcher = () => {
  stopScrollStateWatcher()
  scrollStateTimer = window.setInterval(() => {
    updateScrollState(getScrollElement())
  }, 100)
}

const stopScrollStateWatcher = () => {
  if (scrollStateTimer === undefined) return
  window.clearInterval(scrollStateTimer)
  scrollStateTimer = undefined
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
  if (activeTab.value === 'folders') {
    if (folderSelectMode.value) {
      handleBatchDeleteFolders()
      return
    }
    handleAddFolderClick()
    return
  }

  currentEditId.value = ''
  currentEditData.value = undefined
  showAddModal.value = true
}

const handleBatchDeleteFolders = async () => {
  if (!selectedFolderIds.value.length) {
    showToast('请先选择分类')
    return
  }

  try {
    await showConfirmDialog({
      title: '删除分类',
      message: `确定删除选中的 ${selectedFolderIds.value.length} 个分类吗？分类内的相册将变为未归类。`,
    })
  } catch {
    return
  }

  try {
    for (const id of selectedFolderIds.value) {
      await deleteAlbumFolder(id)
    }
    showToast('删除成功')
    exitFolderSelectMode()
    await handleFolderChanged()
    notifyAlbumsChanged('all-album-view')
  } catch (e: any) {
    showToast(e?.message || '删除失败')
  }
}

const handleAddFolderClick = () => {
  currentFolderEditId.value = ''
  currentFolderEditData.value = undefined
  showFolderModal.value = true
}

const goToFolderDetail = (folderId: string) => {
  if (folderLongPressTriggered) {
    folderLongPressTriggered = false
    return
  }
  if (folderSelectMode.value) {
    toggleFolderSelection(folderId)
    return
  }
  router.push({ name: 'album-folder', params: { folderId } })
}

let folderTouchTimer: ReturnType<typeof setTimeout> | null = null
let folderLongPressTriggered = false

const handleFolderTouchStart = (folder: AlbumFolder) => {
  folderLongPressTriggered = false
  if (folderTouchTimer) clearTimeout(folderTouchTimer)
  folderTouchTimer = setTimeout(() => {
    folderLongPressTriggered = true
    enterFolderSelectMode(folder._id)
  }, 500)
}

const handleFolderTouchEnd = () => {
  if (folderTouchTimer) {
    clearTimeout(folderTouchTimer)
    folderTouchTimer = null
  }
}

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

preventBack(showAddModal)
preventBack(showFolderModal)
preventBack(folderSelectMode)
</script>

<template>
  <div class="app-wrapper">
    <!-- <div class="top-blur-mask" :class="{ 'is-visible': isScrolled }"></div> -->
    <van-pull-refresh v-model="loading" @refresh="loadAll(true)" class="pull-refresh-container" ref="scrollContainer" @scroll="handleScroll">
      <PageTitle title="全部相册" :info="false" back>
        <template #action>
          <van-popover v-if="activeTab === 'all'" v-model:show="showSortPopover" :actions="sortActions" @select="onSelectSort"
            placement="bottom-end">
            <template #reference>
              <van-icon style="margin-right: 16px;" name="sort" size="18" color="#333" />
            </template>
          </van-popover>
        </template>
      </PageTitle>
      <!-- Tab 导航 -->
      <van-tabs v-model:active="activeTab" class="album-tabs" :class="{ 'show-sticky-safe-area': showStickySafeArea }" line-width="32px">
        <van-tab title="全部相册" name="all">
          <!-- 全部相册内容 -->
          <div class="album">
            <van-search
              v-model="searchKeyword"
              class="album-search"
              shape="round"
              clearable
              placeholder="搜索相册名"
            />
            <div v-if="albumTags.length" class="tag-filter" aria-label="按标签筛选相册">
              <button
                class="tag-chip"
                :class="{ active: !activeTag }"
                type="button"
                @click="activeTag = ''"
              >
                全部
              </button>
              <button
                v-for="tag in albumTags"
                :key="tag.name"
                class="tag-chip"
                :class="{ active: activeTag === tag.name }"
                type="button"
                @click="toggleTag(tag.name)"
              >
                <span>{{ tag.name }}</span>
                <span class="tag-count">{{ tag.count }}</span>
              </button>
            </div>
            <div v-if="loading && !displayAlbumList.length"
              class="skeleton-container">
              <div class="skeleton-grid">
                <div class="skeleton-card" v-for="i in 6" :key="i">
                  <div class="skeleton-small skeleton-bg"></div>
                  <div class="skeleton-title skeleton-bg"></div>
                  <div class="skeleton-count skeleton-bg"></div>
                </div>
              </div>
            </div>
            <template v-else>
              <van-empty
                v-if="showEmpty || !displayAlbumList.length"
                :description="searchKeyword || activeTag ? '没有匹配的相册' : '空空如也，快去创建吧'"
              />
              <van-grid v-else :gutter="10" :column-num="3" :border="false" class="small-card-grid">
                <van-grid-item v-for="album in displayAlbumList" :key="album._id">
                  <div class="small-card"
                       @click.stop.prevent="goToDetail(album._id)"
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
            </template>
          </div>
        </van-tab>
        <van-tab title="相册分类" name="folders">
          <!-- 相册分类内容 -->
          <div class="album-folders">
            <div v-if="folderSelectMode" class="folder-select-tip">
              已选 {{ selectedFolderIds.length }} 项，点击右下角确认删除
            </div>
            <!-- 文件夹列表 -->
            <div class="folders-section">
              <div v-if="displayFolderList.length === 0" class="empty-folders">
                <van-empty description="暂无文件夹，点击右下角按钮新建" />
              </div>
              <div v-else class="folders-list">
                <div
                  v-for="folder in displayFolderList"
                  :key="folder._id"
                  class="folder-item"
                  :class="{
                    'is-select-mode': folderSelectMode,
                    'is-selected': isFolderSelected(folder._id),
                    'has-desc': !!folder.description,
                  }"
                  @click="goToFolderDetail(folder._id)"
                  @touchstart="handleFolderTouchStart(folder)"
                  @touchend="handleFolderTouchEnd"
                  @touchcancel="handleFolderTouchEnd"
                  @touchmove="handleFolderTouchEnd"
                >
                  <div class="folder-left">
                    <div class="folder-cover">
                      <ImageCell v-if="folder.cover" :src="folder.cover" />
                      <div v-else class="folder-cover-empty">
                        <van-icon name="folder-o" size="32" color="#ccc" />
                      </div>
                      <div v-if="folderSelectMode" class="folder-select-indicator" :class="{ checked: isFolderSelected(folder._id) }">
                        <van-icon v-if="isFolderSelected(folder._id)" name="success" size="12" />
                      </div>
                    </div>
                    <div class="folder-main">
                      <div class="folder-name">{{ folder.name }}</div>
                      <div class="folder-count">{{ folder.albumCount || 0 }} 个相册</div>
                    </div>
                  </div>
                  <div v-if="folder.description" class="folder-right">
                    <p class="folder-description">{{ folder.description }}</p>
                  </div>
                  <van-icon v-if="!folderSelectMode" class="folder-arrow" name="arrow" size="16" color="#ccc" />
                </div>
              </div>
            </div>

          </div>
        </van-tab>
      </van-tabs>
    </van-pull-refresh>
    <!-- 回到顶部 -->
    <van-back-top :bottom="'calc(var(--footer-area-height) + 48px)'" :right="20" :style="{
      '--van-back-top-icon-size': '16px',
      '--van-back-top-size': '36px',
    }" />
    <!-- 添加相册 -->
    <AddButton
      class="add-position"
      :icon="activeTab === 'folders' && folderSelectMode ? 'success' : 'plus'"
      :variant="activeTab === 'folders' && folderSelectMode ? 'success' : 'primary'"
      @click="handleAddClick"
      v-show="!showAddModal && !showFolderModal"
    />
    <AlbumEditModal v-model:visible="showAddModal" :edit-id="currentEditId" :initial-data="currentEditData" @success="handleAlbumSaved" />
    <FolderEditModal v-model:visible="showFolderModal" :edit-id="currentFolderEditId" :initial-data="currentFolderEditData" @success="handleFolderChanged" />
  </div>
</template>

<style scoped lang="scss">
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

.app-wrapper {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.pull-refresh-container {
  flex: 1;
  overflow-y: auto;
}

// .top-blur-mask {
//   position: absolute;
//   top: 0;
//   left: 0;
//   right: 0;
//   height: 120px;
//   pointer-events: none;
//   z-index: 10;
//   background: linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 100%);
//   backdrop-filter: blur(12px);
//   -webkit-backdrop-filter: blur(12px);
//   -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
//   mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
//   opacity: 0;
//   transition: opacity 0.3s ease;
// }
//
// .top-blur-mask.is-visible {
//   opacity: 1;
// }

.album {
  padding-bottom: var(--footer-area-height);
}

.album-tabs {
  :deep(.van-tabs__wrap) {
    position: sticky;
    top: 0;
    z-index: 20;
    background: #fff;
  }

  &.show-sticky-safe-area {
    :deep(.van-tabs__wrap) {
      top: var(--safe-area-top, 0px);
      box-shadow: 0 calc(-1 * var(--safe-area-top, 0px)) 0 var(--safe-area-top, 0px) #fff;
    }
  }

  :deep(.van-tabs__nav) {
    background: #fff;
  }

  :deep(.van-tabs__content) {
    overflow: visible;
  }
}

.album-folders {
  padding-bottom: var(--footer-area-height);
}

.add-position {
  bottom: var(--footer-area-height);
}

.album-search {
  padding: 0 12px 8px;
  background: transparent;
}

.tag-filter {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 12px 14px;
  scroll-padding: 12px;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tag-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  max-width: 148px;
  padding: 0 10px;
  border: 1px solid #e5e6eb;
  border-radius: 999px;
  background: #fff;
  color: #606266;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;

  span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &.active {
    border-color: #1989fa;
    background: #ecf7ff;
    color: #1989fa;
    font-weight: 500;
  }
}

.tag-count {
  color: #969799;
  font-size: 11px;
}

.tag-chip.active .tag-count {
  color: #1989fa;
}

.small-card-grid {
  padding: 0 10px 16px;

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
  position: relative;

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
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  &.selected {
    :deep(.van-image) {
      opacity: 0.7;
    }
    .album-checkbox {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 1;
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

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 10px;
}

.skeleton-card {
  min-width: 0;
}

.skeleton-small {
  width: 100%;
  aspect-ratio: 1 / 1;
}

.skeleton-title {
  width: 80%;
  height: 14px;
  margin-top: 8px;
}

.skeleton-count {
  width: 36px;
  height: 12px;
  margin-top: 6px;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}

/* 相册分类样式 */
.folders-section {
  padding: 12px;
}

.empty-folders {
  padding: 40px 0;
}

.folders-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f8f8f8;
  border-radius: 12px;
  cursor: pointer;
  transition: box-shadow 0.2s ease;

  &.is-select-mode.is-selected {
    box-shadow: 0 0 0 2px #1989fa inset;
  }
}

.folder-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.folder-item.has-desc .folder-left {
  flex: 0 0 46%;
}

.folder-right {
  flex: 1;
  min-width: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 2px 0 10px;
  border-left: 1px solid #ececec;
}

.folder-cover {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-select-indicator {
  position: absolute;
  right: 4px;
  top: 4px;
  z-index: 2;
  width: 18px;
  height: 18px;
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 1px 4px rgba(31, 41, 51, 0.18);

  &.checked {
    border-color: #07c160;
    background: #07c160;
  }
}

.folder-cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-main {
  flex: 1;
  min-width: 0;
}

.folder-name {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-description {
  margin: 0;
  width: 100%;
  color: #888;
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  word-break: break-word;
}

.folder-count {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}

.folder-arrow {
  flex-shrink: 0;
  margin-left: 2px;
}

.folder-select-tip {
  margin: 0 12px 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #ecf9f1;
  color: #07c160;
  font-size: 13px;
  text-align: center;
}

</style>
