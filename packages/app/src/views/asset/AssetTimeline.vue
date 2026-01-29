<template>
  <div class="asset-timeline">
    <van-nav-bar title="资产时间线" left-arrow @click-left="onClickLeft" fixed placeholder />
    
    <div class="timeline-content">
      <van-steps direction="vertical" :active="-1">
        <van-step v-for="asset in sortedAssets" :key="asset.id">
          <h3>{{ asset.name }}</h3>
          <p>{{ formatDate(asset.purchaseDate) }} - ¥{{ asset.price }}</p>
          <p v-if="asset.description" class="desc">{{ asset.description }}</p>
        </van-step>
      </van-steps>
      
      <van-empty v-if="sortedAssets.length === 0" description="暂无资产记录" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore } from '@/stores/asset';

const router = useRouter();
const assetStore = useAssetStore();

const sortedAssets = computed(() => assetStore.assetsByDate);

const onClickLeft = () => {
  router.push('/discovery');
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};
</script>

<style scoped>
.asset-timeline {
  background-color: #fff;
  min-height: 100vh;
}
.timeline-content {
  padding: 16px 0;
}
.desc {
  color: #969799;
  font-size: 12px;
}
</style>
