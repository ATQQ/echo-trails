<template>
  <div class="asset-stats">
    <van-nav-bar title="资产统计" left-arrow @click-left="onClickLeft" fixed placeholder />

    <div class="content">
      <van-cell-group inset title="分类统计">
        <van-cell v-for="cat in categoryStats" :key="cat.name" :title="cat.name" :value="`¥${cat.value}`" />
      </van-cell-group>

      <van-cell-group inset title="状态统计" style="margin-top: 16px;">
        <van-cell v-for="stat in statusStats" :key="stat.name" :title="stat.name" :value="`¥${stat.value}`" />
      </van-cell-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore } from '@/stores/asset';

const router = useRouter();
const store = useAssetStore();

const onClickLeft = () => {
  router.push('/discovery');
};

const categoryStats = computed(() => {
  const stats: Record<string, number> = {};
  store.assets.forEach(asset => {
    stats[asset.category] = (stats[asset.category] || 0) + asset.price;
  });
  return Object.entries(stats).map(([name, value]) => ({ name, value }));
});

const statusStats = computed(() => {
  const stats: Record<string, number> = {};
  store.assets.forEach(asset => {
    const statusName = store.statuses.find(s => s.value === asset.status)?.name || asset.status;
    stats[statusName] = (stats[statusName] || 0) + asset.price;
  });
  return Object.entries(stats).map(([name, value]) => ({ name, value }));
});
</script>

<style scoped>
.van-nav-bar__placeholder> :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}
.asset-stats {
  background-color: #f7f8fa;
  min-height: 100vh;
}
.content {
  padding-top: 16px;
}
</style>
