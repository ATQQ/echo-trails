<template>
  <div class="asset-layout">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>

    <BottomActions :menus="menus" />
  </div>
</template>

<script setup lang="ts">
import BottomActions from '@/components/BottomActions/BottomActions.vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const handleTabClick = (path: string) => {
  if (route.path === path) {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  } else {
    router.replace(path);
  }
}

const menus = [
  {
    icon: 'clock-o',
    text: '时间线',
    path: '/asset/timeline',
    activeIcon: 'clock',
    activeColor: '#2196f3',
    replace: true,
    handleClick: () => handleTabClick('/asset/timeline')
  },
  {
    icon: 'apps-o',
    text: '全部',
    path: '/asset/list',
    activeIcon: 'apps-o',
    activeColor: '#2196f3',
    replace: true,
    handleClick: () => handleTabClick('/asset/list')
  },
  {
    icon: 'chart-trending-o',
    text: '统计',
    path: '/asset/stats',
    activeIcon: 'chart-trending-o',
    activeColor: '#2196f3',
    replace: true,
    handleClick: () => handleTabClick('/asset/stats')
  },
  {
    icon: 'setting-o',
    text: '管理',
    path: '/asset/manage',
    activeIcon: 'setting',
    activeColor: '#2196f3',
    replace: true,
    handleClick: () => handleTabClick('/asset/manage')
  }
]
</script>

<style scoped>
.asset-layout {
  min-height: 100vh;
  background-color: #f7f8fa;
  box-sizing: border-box;
  /* Tabbar height */
}
</style>
