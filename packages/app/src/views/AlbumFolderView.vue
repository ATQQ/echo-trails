<script lang="ts" setup>
import { getAlbums, getAlbumFolders, setAlbumsFolder } from '@/service';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router';
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import FolderEditModal from '@/components/FolderEditCard/FolderEditModal.vue';
import SelectAlbumModal from '@/components/SelectAlbumModal/SelectAlbumModal.vue';
import AddButton from '@/components/AddButton/AddButton.vue';
import { preventBack } from '@/lib/router'
import ImageCell from '@/components/ImageCell/ImageCell.vue';
import { useTTLStorage } from '@/composables/useTTLStorage';
import { useRecentAlbums } from '@/composables/useRecentAlbums';
import { useScrollRestore } from '@/composables/useScrollRestore';
import { notifyAlbumsChanged, onAlbumsChanged } from '@/lib/albumEvents';
import { showToast, showConfirmDialog } from 'vant';

defineOptions({
  name: 'AlbumFolderView'
})

const route = useRoute()
const router = useRouter()
const folderId = computed(() => String(route.params.folderId || ''))

const scrollContainer = ref<HTMLElement | null>(null)
useScrollRestore(scrollContainer)

// 文件夹信息
const folder = ref<AlbumFolder | null>(null)
const { data: cachedFolder, load: loadFolderCache, save: saveFolderCache } = useTTLStorage<AlbumFolder | null>({
  key: () => `album_folder_${folderId.value}`,
  initialValue: null,
  ttl: 15 * 60 * 1000,
  persistInTauri: true
})

// 文件夹内的相册列表
const { data: albumList, load: loadCache, save: saveCache } = useTTLStorage<{
  large: Album[],
  small: Album[]
}>({
  key: 'albumList',
  initialValue: { large: [], small: [] },
  ttl: 15 * 60 * 1000,
  persistInTauri: true
})

const searchKeyword = ref('')

const folderAlbums = computed<Album[]>(() => {
  const fid = folderId.value
  const all = [
    ...(albumList.value.large || []),
    ...(albumList.value.small || [])
  ]
  return all.filter(a => a.folderId === fid)
})

const uncategorizedAlbums = computed<Album[]>(() => {
  const all = [
    ...(albumList.value.large || []),
    ...(albumList.value.small || [])
  ]
  return all.filter(a => !a.folderId)
})

const displayAlbumList = computed<Album[]>(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const list = folderAlbums.value
  const filtered = keyword
    ? list.filter(album => (album.name || '').toLowerCase().includes(keyword))
    : list
  return [...filtered].sort((a, b) => {
    if (a.count === 0 && b.count !== 0) return 1
    if (a.count !== 0 && b.count === 0) return -1
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  })
})

const showEmpty = ref(false)
const loading = ref(false)

const loadData = async (_loading = false) => {
  loading.value = _loading
  try {
    // 加载相册列表
    const res = await getAlbums()
    albumList.value.large = res.large || []
    albumList.value.small = res.small || []
    saveCache()

    // 加载文件夹信息
    const folders = await getAlbumFolders()
    const matched = folders.find(f => f._id === folderId.value) || null
    folder.value = matched
    if (matched) {
      cachedFolder.value = matched
      saveFolderCache()
    }

    showEmpty.value = folderAlbums.value.length === 0
  } catch (e) {
    console.error('Load folder view failed:', e)
  } finally {
    loading.value = false
  }
}

const folderChangeSource = 'album-folder-view'
const handleFolderChanged = async () => {
  try {
    await loadData(false)
  } finally {
    notifyAlbumsChanged(folderChangeSource)
  }
}

let stopAlbumsChangedListener: (() => void) | undefined
onMounted(() => {
  // 加载缓存
  const loadedFolder = loadFolderCache()
  if (loadedFolder && cachedFolder.value) {
    folder.value = cachedFolder.value
  }
  const loadedAlbums = loadCache()
  if (!loadedAlbums) {
    loadData(true)
  } else {
    showEmpty.value = folderAlbums.value.length === 0
    loadData(false).catch(e => {
      console.warn('Silent refresh failed:', e)
    })
  }

  stopAlbumsChangedListener = onAlbumsChanged((detail) => {
    if (detail.source === folderChangeSource) return
    loadData(false).catch(e => {
      console.warn('Refresh from change event failed:', e)
    })
  })
})

onUnmounted(() => {
  stopAlbumsChangedListener?.()
})

const showEditModal = ref(false)
const currentEditId = ref('')
const currentEditData = ref<AlbumFolder | undefined>(undefined)
const showAlbumSelect = ref(false)
const albumSelectMode = ref(false)
const selectedAlbumIds = ref<string[]>([])

const isAlbumSelected = (albumId: string) => selectedAlbumIds.value.includes(albumId)

const toggleAlbumSelection = (albumId: string) => {
  const index = selectedAlbumIds.value.indexOf(albumId)
  if (index === -1) {
    selectedAlbumIds.value = [...selectedAlbumIds.value, albumId]
  } else {
    selectedAlbumIds.value = selectedAlbumIds.value.filter(id => id !== albumId)
  }
}

const exitAlbumSelectMode = () => {
  albumSelectMode.value = false
  selectedAlbumIds.value = []
}

const enterAlbumSelectMode = (albumId: string) => {
  albumSelectMode.value = true
  selectedAlbumIds.value = [albumId]
}

watch(albumSelectMode, (val) => {
  if (!val) {
    selectedAlbumIds.value = []
  }
})

const handleEditClick = () => {
  if (!folder.value) return
  currentEditId.value = folder.value._id
  currentEditData.value = folder.value
  showEditModal.value = true
}

const handleAddAlbumsClick = () => {
  if (albumSelectMode.value) {
    handleBatchRemoveFromFolder()
    return
  }
  showAlbumSelect.value = true
}

const handleBatchRemoveFromFolder = async () => {
  if (!selectedAlbumIds.value.length) {
    showToast('请先选择相册')
    return
  }

  try {
    await showConfirmDialog({
      title: '移出分类',
      message: `确定将选中的 ${selectedAlbumIds.value.length} 个相册移出当前分类吗？相册本身不会被删除。`,
    })
  } catch {
    return
  }

  try {
    await setAlbumsFolder(selectedAlbumIds.value, null)
    showToast('已移出分类')
    exitAlbumSelectMode()
    await loadData(false)
    notifyAlbumsChanged(folderChangeSource)
  } catch (e: any) {
    showToast(e?.message || '操作失败')
  }
}

const handleSaveAlbumSelect = async (albumIds: string[]) => {
  if (!albumIds.length) return

  try {
    await setAlbumsFolder(albumIds, folderId.value)
    showToast('添加成功')
    showAlbumSelect.value = false
    await loadData(false)
    notifyAlbumsChanged(folderChangeSource)
  } catch (e: any) {
    showToast(e?.message || '添加失败')
  }
}

let touchTimer: ReturnType<typeof setTimeout> | null = null
let isLongPressTriggered = false

const handleAlbumLongPress = (album: Album) => {
  enterAlbumSelectMode(album._id)
}

const handleAlbumTouchStart = (album: Album) => {
  isLongPressTriggered = false
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = setTimeout(() => {
    isLongPressTriggered = true
    handleAlbumLongPress(album)
  }, 500)
}

const handleAlbumTouchEnd = () => {
  if (touchTimer) {
    clearTimeout(touchTimer)
    touchTimer = null
  }
}

const handleAlbumClick = (album: Album) => {
  if (isLongPressTriggered) {
    isLongPressTriggered = false
    return
  }
  if (albumSelectMode.value) {
    toggleAlbumSelection(album._id)
    return
  }
  goToDetail(album._id)
}

const { addRecent } = useRecentAlbums()
const goToDetail = (albumId: string) => {
  addRecent(albumId)
  router.push({ name: 'album-photo', params: { albumId } })
}

const isScrolled = ref(false)
const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  if (target) {
    isScrolled.value = target.scrollTop > 20
  }
}

preventBack(showEditModal)
preventBack(showAlbumSelect)
preventBack(albumSelectMode)
</script>

<template>
  <div class="app-wrapper">
    <div class="top-blur-mask" :class="{ 'is-visible': isScrolled }"></div>
    <van-pull-refresh v-model="loading" @refresh="loadData(true)" class="pull-refresh-container" ref="scrollContainer" @scroll="handleScroll">
      <PageTitle :title="folder?.name || '分类'" :info="false" back>
        <template #action>
          <van-icon v-if="folder" style="margin-right: 16px;" name="edit" size="18" color="#333" @click="handleEditClick" />
        </template>
      </PageTitle>
      <div class="folder-content">
        <p v-if="folder?.description" class="folder-desc">{{ folder.description }}</p>
        <div v-if="albumSelectMode" class="album-select-tip">
          已选 {{ selectedAlbumIds.length }} 项，点击右下角确认移出
        </div>
        <van-search
          v-model="searchKeyword"
          class="album-search"
          shape="round"
          clearable
          placeholder="搜索相册名"
        />
        <div v-if="loading && !displayAlbumList.length" class="skeleton-container">
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
            :description="searchKeyword ? '没有匹配的相册' : '分类内还没有相册，点击右下角添加'"
          />
          <van-grid v-else :gutter="10" :column-num="3" :border="false" class="small-card-grid">
            <van-grid-item v-for="album in displayAlbumList" :key="album._id">
              <div
                class="small-card"
                :class="{
                  'is-select-mode': albumSelectMode,
                  'is-selected': isAlbumSelected(album._id),
                }"
                @click.stop.prevent="handleAlbumClick(album)"
                @touchstart="handleAlbumTouchStart(album)"
                @touchend="handleAlbumTouchEnd"
                @touchcancel="handleAlbumTouchEnd"
                @touchmove="handleAlbumTouchEnd"
              >
                <div class="cover-wrap">
                  <ImageCell :src="album.cover" :cache-key="album.coverKey ? album.coverKey + '_cover' : undefined" />
                  <div v-if="albumSelectMode" class="album-select-indicator" :class="{ checked: isAlbumSelected(album._id) }">
                    <van-icon v-if="isAlbumSelected(album._id)" name="success" size="12" />
                  </div>
                  <div v-if="albumSelectMode && isAlbumSelected(album._id)" class="selected-mask"></div>
                </div>
                <div class="title-desc">
                  <h2>{{ album.name }}</h2>
                  <p>{{ album.count }}</p>
                </div>
              </div>
            </van-grid-item>
          </van-grid>
        </template>
        <div v-if="folder" class="folder-footer">
          共 {{ folderAlbums.length }} 个相册
        </div>
      </div>
    </van-pull-refresh>
    <van-back-top :bottom="'calc(var(--footer-area-height) + 48px)'" :right="20" :style="{
      '--van-back-top-icon-size': '16px',
      '--van-back-top-size': '36px',
    }" />
    <AddButton
      class="add-position"
      :icon="albumSelectMode ? 'success' : 'plus'"
      :variant="albumSelectMode ? 'success' : 'primary'"
      v-show="!showEditModal && !showAlbumSelect"
      @click="handleAddAlbumsClick"
    />
    <FolderEditModal
      v-model:visible="showEditModal"
      :edit-id="currentEditId"
      :initial-data="currentEditData"
      @success="handleFolderChanged"
    />
    <SelectAlbumModal
      v-model:show="showAlbumSelect"
      :albums="uncategorizedAlbums"
      title="添加相册"
      empty-description="没有未归类的相册"
      confirm-label="添加相册"
      search-placeholder="搜索未归类相册"
      @save="handleSaveAlbumSelect"
    />
  </div>
</template>

<style scoped lang="scss">
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
.folder-content {
  padding-bottom: calc(var(--footer-area-height) + 56px);
}
.folder-desc {
  margin: 0;
  padding: 8px 28px 4px;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 15px;
  font-weight: 400;
  color: #666;
  line-height: 1.65;
  text-align: center;
  letter-spacing: 0.02em;
}
.folder-footer {
  margin-top: 24px;
  padding: 20px 16px 8px;
  text-align: center;
  font-size: 12px;
  color: #b0b4ba;
}
.album-select-tip {
  margin: 0 12px 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #ecf9f1;
  color: #07c160;
  font-size: 13px;
  text-align: center;
}
.add-position {
  z-index: 2;
}
.album-search {
  padding: 12px 12px 8px;
  background: transparent;
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
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;

  &.is-select-mode.is-selected .cover-wrap {
    box-shadow: 0 0 0 2px #1989fa inset;
    border-radius: 12px;
  }

  .cover-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 12px;
    overflow: hidden;
  }

  :deep(.van-image) {
    border-radius: 12px;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden;
  }

  .album-select-indicator {
    position: absolute;
    right: 6px;
    top: 6px;
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

  .selected-mask {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: 12px;
    background: rgba(25, 137, 250, 0.12);
    pointer-events: none;
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
</style>
