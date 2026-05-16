<template>
  <!-- 选择相册 -->
  <van-action-sheet
    v-model:show="show"
    :close-on-popstate="false"
    :closeable="false"
    class="album-picker-sheet"
  >
    <div class="sheet-header">
      <button type="button" class="header-action" @click="closeSheet">取消</button>
      <div class="header-title">
        <h2>选择相册</h2>
        <span>{{ selectedAlbums.length ? `已选 ${selectedAlbums.length} 个` : `${albumList.length} 个相册` }}</span>
      </div>
      <button type="button" class="header-action clear-action" :disabled="!selectedAlbums.length" @click="clearSelection">清空</button>
    </div>

    <van-search
      v-model="searchKeyword"
      class="album-search"
      shape="round"
      clearable
      placeholder="搜索相册"
    />

    <div v-if="!albumList.length" class="album-state">
      <van-empty description="空空如也，快去创建吧" />
    </div>
    <div v-else-if="!filteredAlbumList.length" class="album-state">
      <van-empty description="没有匹配的相册" />
    </div>
    <div v-else class="album-list">
      <van-grid :gutter="10" :column-num="3" :border="false" class="small-card-grid">
        <van-grid-item v-for="_album in filteredAlbumList" :key="_album._id">
          <div
            role="button"
            tabindex="0"
            class="small-card"
            :class="{ selected: isSelected(_album._id) }"
            @click="toggleSelectAlbum(_album._id)"
            @keydown.enter.prevent="toggleSelectAlbum(_album._id)"
            @keydown.space.prevent="toggleSelectAlbum(_album._id)"
          >
            <div class="cover">
              <ImageCell
                :src="_album.cover"
                :cache-key="_album.coverKey ? _album.coverKey + '_cover' : undefined"
              />
              <van-tag v-if="_album?._id === currentAlbumId" plain type="primary" class="current-album">当前</van-tag>
              <div class="select-indicator" :class="{ checked: isSelected(_album._id) }">
                <van-icon v-if="isSelected(_album._id)" name="success" size="12" />
              </div>
              <div v-if="isSelected(_album._id)" class="selected-mask"></div>
            </div>
            <div class="title-desc">
              <h3>{{ _album.name }}</h3>
              <p>{{ _album.count || 0 }}</p>
            </div>
          </div>
        </van-grid-item>
      </van-grid>
    </div>

    <div class="sheet-footer safe-padding-bottom">
      <van-button
        block
        round
        type="primary"
        size="large"
        :disabled="!selectedAlbums.length"
        @click="handleSaveAlbumSelect"
      >
        {{ selectedAlbums.length ? `完成 (${selectedAlbums.length})` : '选择相册' }}
      </van-button>
    </div>
  </van-action-sheet>
</template>
<script setup lang="ts">
import ImageCell from '../ImageCell/ImageCell.vue';
import { getAlbums } from '@/service';
import { computed, ref, watch } from 'vue';
import { preventBack } from '@/lib/router';

const { currentAlbumId, selected } = defineProps<{
  currentAlbumId?: string
  selected?: string[]
}>()

watch(() => selected, () => {
  selectedAlbums.value = [...(selected || [])]
})

const show = defineModel("show", { type: Boolean, default: false })
preventBack(show)
const emit = defineEmits<{
  (e: 'save', value: string[]): void
}>()

watch(show, () => {
  if (show.value) {
    selectedAlbums.value = [...(selected || [])]
    searchKeyword.value = ''
    loadAlbum()
  }
})

const albumList = ref<Album[]>([])
const searchKeyword = ref('')
const filteredAlbumList = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return albumList.value

  return albumList.value.filter(album => (album.name || '').toLowerCase().includes(keyword))
})

const loadAlbum = () => {
  return getAlbums().then((res) => {
    const newValue: Album[] = []
    if (res.large) {
      newValue.push(...res.large)
    }
    if (res.small) {
      newValue.push(...res.small)
    }
    albumList.value = newValue
  })
}

const selectedAlbums = ref<string[]>([])
const isSelected = (albumId: string) => selectedAlbums.value.includes(albumId)
const toggleSelectAlbum = (albumId: string) => {
  if (isSelected(albumId)) {
    selectedAlbums.value = selectedAlbums.value.filter(id => id !== albumId)
    return
  }

  selectedAlbums.value = [...selectedAlbums.value, albumId]
}

const clearSelection = () => {
  selectedAlbums.value = []
}

const closeSheet = () => {
  show.value = false
}

const handleSaveAlbumSelect = () => {
  if (!selectedAlbums.value.length) return
  emit('save', selectedAlbums.value)
}
</script>
<style lang="scss" scoped>
:global(.album-picker-sheet .van-action-sheet__content) {
  height: min(82vh, 680px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sheet-header {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 64px 1fr 64px;
  align-items: center;
  min-height: 58px;
  padding: 6px 12px 4px;
  border-bottom: 1px solid #f0f1f3;
}

.header-title {
  min-width: 0;
  text-align: center;

  h2 {
    margin: 0;
    color: #1f2933;
    font-size: 17px;
    font-weight: 600;
    line-height: 22px;
  }

  span {
    display: block;
    margin-top: 2px;
    color: #7a8491;
    font-size: 12px;
    line-height: 16px;
  }
}

.header-action {
  border: 0;
  background: transparent;
  color: #4b5563;
  font-size: 14px;
  line-height: 24px;
  padding: 8px 0;
  text-align: left;

  &:disabled {
    color: #c5cad1;
  }
}

.clear-action {
  color: #1989fa;
  text-align: right;
}

.album-search {
  flex: 0 0 auto;
  padding: 10px 12px 8px;
  background: #fff;
}

.album-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 10px 12px;
}

.album-state {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.small-card-grid {
  padding-bottom: 4px;

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

  .cover {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 12px;
    overflow: hidden;
    line-height: 0;
    background: #f5f6f8;
  }

  :deep(.van-image) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    border-radius: 12px;
    overflow: hidden;
  }

  :deep(.van-image__img) {
    display: block;
  }

  &.selected {
    .cover {
      box-shadow: 0 0 0 2px #1989fa inset;
    }
  }

  .title-desc {
    margin-top: 6px;
    width: 100%;
    overflow: hidden;

    h3 {
      margin: 0;
      color: #333;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    p {
      margin: 1px 0 0;
      font-size: 12px;
      color: #999;
      line-height: 16px;
    }
  }
}

.select-indicator {
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
  transition: all 0.18s ease;

  &.checked {
    border-color: #1989fa;
    background: #1989fa;
    box-shadow: 0 2px 6px rgba(25, 137, 250, 0.26);
  }
}

.current-album {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.9);
}

.selected-mask {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: 12px;
  background: rgba(25, 137, 250, 0.12);
  pointer-events: none;
}

.sheet-footer {
  flex: 0 0 auto;
  position: relative;
  z-index: 3;
  padding: 10px 16px 12px;
  background: #fff;
  box-shadow: 0 -6px 18px rgba(31, 41, 51, 0.08);
}
</style>
