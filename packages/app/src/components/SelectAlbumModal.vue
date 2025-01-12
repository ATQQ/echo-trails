<template>
  <!-- 选择相册 -->
  <van-action-sheet :closeable="false" :close-on-popstate="false" v-model:show="show" title="选择相册">
    <van-empty v-if="!albumList.length" description="空空如也，快去创建吧" />
    <div v-else class="album-list">
      <van-checkbox-group v-model="selectedAlbums">
        <van-grid :gutter="10" :column-num="2" :border="false">
          <van-grid-item v-for="(_album, idx) in albumList" :key="_album._id">
            <div class="small-card" @touchstart.stop>
              <div class="cover" @click="toggleSelectAlbum(idx)">
                <ImageCell :src="_album.cover" />
                <van-tag v-if="_album?._id === currentAlbumId" plain type="primary" class="current-album">当前相册</van-tag>
                <van-checkbox :ref="el => checkboxRefs[idx] = el" :name="_album._id" class="selected" />
              </div>
              <div class="title-desc">
                <h2>{{ _album.name }}</h2>
                <p>{{ _album.count }}</p>
              </div>
            </div>
          </van-grid-item>
        </van-grid>
      </van-checkbox-group>
    </div>
  </van-action-sheet>
  <van-floating-bubble @click="handleSaveAlbumSelect" v-if="show" :gap="30" class="save-album-select" axis="xy"
    icon="success" magnetic="x" />
</template>
<script setup lang="ts">
import { getAlbums } from '@/service';
import { ref, watch } from 'vue';

const { currentAlbumId, selected } = defineProps<{
  currentAlbumId?: string
  selected?: string[]
}>()

watch(() => selected, () => {
  selectedAlbums.value = selected || []
})

const show = defineModel("show", { type: Boolean, default: false })
const emit = defineEmits<{
  (e: 'save', value: string[]): void
}>()

watch(show, () => {
  if (show.value) {
    loadAlbum()
  }
})

const albumList = ref<Album[]>([])
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
const checkboxRefs = ref<any[]>([])
const toggleSelectAlbum = (idx: number) => {
  checkboxRefs.value[idx].toggle()
}

const handleSaveAlbumSelect = () => {
  emit('save', selectedAlbums.value)
}
</script>
<style lang="scss" scoped>
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

  .cover {
    position: relative;

    .selected {
      position: absolute;

      right: 10px;
      bottom: 10px;
    }

    .current-album {
      position: absolute;
      right: 10px;
      bottom: -20px;
    }
  }
}
</style>
