<template>
  <div class="asset-layout">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>

    <van-tabbar route placeholder fixed>
      <van-tabbar-item replace to="/asset/timeline" icon="clock-o">时间线</van-tabbar-item>
      <van-tabbar-item replace to="/asset/list" icon="apps-o">全部</van-tabbar-item>
      <van-tabbar-item replace to="/asset/stats" icon="chart-trending-o">统计</van-tabbar-item>
      <van-tabbar-item replace to="/asset/manage" icon="setting-o">管理</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
// Layout logic if needed
</script>

<style scoped>
.asset-layout {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-bottom: 50px;
  /* Tabbar height */
}
</style>
