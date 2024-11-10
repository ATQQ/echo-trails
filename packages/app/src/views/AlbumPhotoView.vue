<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
import { getAlbumInfo } from '@/service';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const album = ref<Album>()
onMounted(() => {
  if (!route.params.albumId) return
  getAlbumInfo(route.params.albumId + '').then(res => {
    album.value = res
  })
})
</script>

<template>
  <PhotoList v-if="album" :albumId="album._id">
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
</style>
