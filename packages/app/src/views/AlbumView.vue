<script lang="ts" setup>
import { createAlbum, getAlbums, updateAlbum } from '@/service';
import { showToast } from 'vant';
import { ref, reactive, onActivated } from 'vue'
import { useRouter } from 'vue-router';
import { OnLongPress } from '@vueuse/components'

const albumList = reactive<{
  large: Album[],
  small: Album[]
}>({
  large: [],
  small: []
})

const showEmpty = ref(false)
const loading = ref(false)
const loadAlbum = (_loading = false) => {
  loading.value = _loading
  return getAlbums().then((res) => {
    loading.value = false
    Object.assign(albumList, res)
    showEmpty.value = !albumList.large?.length && !albumList.small?.length
  })
}

onActivated(() => {
  loadAlbum()
})

const showAddModal = ref(false)

const addData = reactive({
  name: '',
  description: '',
  isLarge: false,
  editId: ''
})

const reset = () => {
  showAddModal.value = false
  addData.name = ''
  addData.description = ''
  addData.isLarge = false
  addData.editId = ''
}

const handleEdit = (album: Album) => {
  addData.editId = album._id
  addData.name = album.name
  addData.description = album.description
  addData.isLarge = album.style === 'large'
  showAddModal.value = true
}

const onSubmit = () => {
  const { editId, ...ops } = addData
  if (editId) {
    updateAlbum(editId, ops).then(async () => {
      showToast('修改成功')
      reset()
      loadAlbum()
    })
    return
  }
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

</script>

<template>
  <van-pull-refresh v-model="loading" @refresh="loadAlbum(true)">
    <div class="album">
      <h1>相册</h1>
      <van-empty v-if="showEmpty" description="空空如也，快去创建吧" />
      <!-- 大卡片 -->
      <van-grid :column-num="1" :border="false">
        <van-grid-item v-for="album in albumList.large" :key="album._id">
          <OnLongPress class="long-press-wrapper" @trigger="handleEdit(album)" :options="{
            modifiers: {
              prevent: true,
              stop: true,
            }
          }">
            <div class="large-card" @click.stop.prevent="goToDetail(album._id)">
              <van-image fit="cover" position="center" width="100%" height="100%" lazy-load :src="album.cover">
              </van-image>
              <!-- 标题和描述 -->
              <div class="title-desc" :class="{
                noCover: !album.cover
              }">
                <h2>{{ album.name }}</h2>
                <p>{{ album.description }}</p>
              </div>
            </div>
          </OnLongPress>
        </van-grid-item>
      </van-grid>
      <!-- 小卡片分类 -->
      <van-grid :gutter="10" :column-num="2" :border="false">
        <van-grid-item v-for="album in albumList.small" :key="album._id">
          <OnLongPress class="long-press-wrapper" @trigger="handleEdit(album)" :options="{
            modifiers: {
              prevent: true,
              stop: true,
            }
          }">
            <div class="small-card" @click.stop.prevent="goToDetail(album._id)">
              <van-image fit="cover" position="center" width="100%" height="100%" lazy-load :src="album.cover">
              </van-image>
              <div class="title-desc">
                <h2>{{ album.name }}</h2>
                <p>{{ album.count }}</p>
              </div>
            </div>
          </OnLongPress>
        </van-grid-item>
      </van-grid>
    </div>
  </van-pull-refresh>

  <!-- 添加相册 -->
  <div @click="showAddModal = true" v-show="!showAddModal" class="add-container">
    <van-icon name="plus" size="18" />
  </div>
  <van-popup @close="showAddModal = false" v-model:show="showAddModal" round position="bottom"
    :style="{ height: '50%' }" @closed="reset">
    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field required v-model="addData.name" name="相册名" label="相册名" placeholder="请输入相册名"
          :rules="[{ required: true, message: '请填写相册名' }]">
          <template #left-icon></template>
        </van-field>
        <van-field v-model="addData.description" autosize show-word-limit rows="5" maxlength="100" type="textarea"
          name="描述" label="描述" placeholder="描述" />
        <van-field name="switch" label="大卡片">
          <template #input>
            <van-switch v-model="addData.isLarge" />
          </template>
        </van-field>
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit">
          提交
        </van-button>
      </div>
    </van-form>
  </van-popup>
</template>

<style scoped lang="scss">
.album {
  padding-bottom: 60px;
}

h1 {
  font-weight: lighter;
  margin-bottom: 0;
  padding-left: 10px;
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

.add-container {
  position: fixed;
  right: 10px;
  bottom: 60px;
  z-index: 1;
  padding: 4px;
  background-color: var(--van-primary-color);
  color: #fff;
  border-radius: 50%;
}

.long-press-wrapper {
  width: 100%;
}
</style>
