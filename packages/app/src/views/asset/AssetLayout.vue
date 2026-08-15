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

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.asset-layout {
  min-height: 100vh;
  background-color: #f7f8fa;
  box-sizing: border-box;
  /* Tabbar height */
}

@include desktop {
  // 全局 `--footer-area-height` 在桌面端被置为 0（因为全局 FooterNav 已隐藏），
  // 但资产页保留自己的 BottomActions，所以需要在此为子视图恢复底部占位。
  .asset-layout {
    --footer-area-height: 60px;
  }

  // 与 App.vue 中 `body.body-has-side-nav .van-nav-bar--fixed` 一致的处理：
  // 让固定底部 BottomActions 偏移到 SideNav 右侧，不遮盖左侧导航。
  :deep(.footer-nav) {
    left: var(--side-nav-width, 0px);
    width: calc(100vw - var(--side-nav-width, 0px));
    transition: left 0.2s ease, width 0.2s ease;
  }
}
</style>
