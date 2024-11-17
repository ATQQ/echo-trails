<script setup lang="ts">
import EditAlbumCard from '@/components/EditAlbumCard.vue';
import InfoCard from '@/components/InfoCard.vue';
import PhotoList from '@/components/PhotoList.vue';
import { provideAlbumPhotoStore } from '@/composables/albumphoto';
import { getAlbumInfo, getPhotoListInfo, updateAlbum } from '@/service';
import { showToast } from 'vant';
import { computed, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
const route = useRoute();
const album = ref<Album>()
const refreshAlbum = () => {
  if (!route.params.albumId) return
  getAlbumInfo(route.params.albumId + '').then(res => {
    album.value = res
  })
}

provideAlbumPhotoStore({
  refreshAlbum
})

onMounted(() => {
  refreshAlbum()
})

// 信息展示
const showInfoPanel = ref(false)
const listData = ref<InfoItem[]>([])
const handleShowInfoPanel = async () => {
  listData.value = await getPhotoListInfo({
    albumId: album.value?._id
  })
  // 调接口拉数据
  showInfoPanel.value = true
}
const albumInfoData = computed(() => {
  if (!album.value) {
    return []
  }
  return [
    {
      title: '名称',
      value: album.value.name
    },
    {
      title: '描述',
      value: album.value.description
    },
    {
      title: '样式',
      value: album.value.style === 'large' ? '大卡片' : '小卡片'
    }
  ]
})

onBeforeRouteLeave((to, from, next) => {
  if (showInfoPanel.value) {
    showInfoPanel.value = false
    next(false)
    return false
  }
  next()
})

const editMode = ref(false)
const addData = reactive({
  name: '',
  description: '',
  isLarge: false,
})

const handleEdit = () => {
  if (!album.value) return
  editMode.value = true
  addData.name = album.value.name
  addData.description = album.value.description
  addData.isLarge = album.value.style === 'large'
}

const onSubmit = () => {
  if (album.value?._id) {
    updateAlbum(album.value?._id, addData).then(async () => {
      showToast('修改成功')
      await refreshAlbum()
      editMode.value = false
    })
    return
  }
}
</script>

<template>
  <PhotoList v-if="album" :album="album">
    <template #header>
      <div v-if="album.count" class="large-card">
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
      <!-- 操作按钮 -->
      <div class="actions" :class="{
        empty: !album.count
      }">
        <span @click="handleShowInfoPanel" class="action-item"><i>...</i></span>
      </div>
      <van-popup v-model:show="showInfoPanel" position="right"
        :style="{ width: '100%', height: '100%', background: '#eff2f5', padding: '20px 0' }">
        <!-- 基本信息卡片展示 -->
        <InfoCard :data="listData" />
        <!-- 编辑卡片 -->
        <InfoCard v-if="!editMode" class="card-margin" :data="albumInfoData" />
        <EditAlbumCard v-if="editMode" :data="addData" @submit="onSubmit" />
        <div class="operation card-margin">
          <van-button v-if="!editMode" @click="handleEdit" type="primary" block round size="small">编辑</van-button>
          <van-button v-else @click="editMode = false" type="danger" block round size="small">取消</van-button>
        </div>
      </van-popup>
    </template>
  </PhotoList>
</template>
<style scoped lang="scss">
.large-card {
  position: relative;
  border-radius: 10px 10px 0 0;
  overflow: hidden;
  height: 50vw;
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

.actions {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  color: #fff;
  background: linear-gradient(to top, rgba(255, 255, 255, 0), rgba(0, 0, 0, 0.3));
  display: flex;
  justify-content: flex-end;

  &.empty {
    color: #000;
    background: none;
  }

  .action-item {
    width: 24px;
    height: 24px;
    margin-right: 16px;
    display: flex;
    justify-content: center;
    align-items: center;

    i {
      font-weight: bold;
      font-size: 20px;
      line-height: 20px;
      font-style: normal
    }
  }
}

.card-margin {
  margin-top: 20px;
}

.operation {
  padding: var(--van-cell-group-inset-padding);
}
</style>
