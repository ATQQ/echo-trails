<template>
  <div class="asset-layout">
    <main class="asset-main">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>

    <div class="asset-bottom-actions">
      <BottomActions :menus="menus" />
    </div>
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
    icon: 'apps-o',
    text: '全部',
    path: '/asset/list',
    activeIcon: 'apps-o',
    activeColor: '#1989fa',
    replace: true,
    handleClick: () => handleTabClick('/asset/list')
  },
  {
    icon: 'clock-o',
    text: '时间线',
    path: '/asset/timeline',
    activeIcon: 'clock',
    activeColor: '#1989fa',
    replace: true,
    handleClick: () => handleTabClick('/asset/timeline')
  },
  {
    icon: 'chart-trending-o',
    text: '统计',
    path: '/asset/stats',
    activeIcon: 'chart-trending-o',
    activeColor: '#1989fa',
    replace: true,
    handleClick: () => handleTabClick('/asset/stats')
  },
  {
    icon: 'setting-o',
    text: '管理',
    path: '/asset/manage',
    activeIcon: 'setting',
    activeColor: '#1989fa',
    replace: true,
    handleClick: () => handleTabClick('/asset/manage')
  }
]
</script>

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.asset-layout {
  min-height: 100vh;
  background-color: #f6f7f9;
  box-sizing: border-box;
  color: #23262b;

  :deep(.van-nav-bar) {
    --van-nav-bar-height: 56px;
    --van-nav-bar-background: rgba(255, 255, 255, 0.94);
    --van-nav-bar-title-text-color: #23262b;
    --van-nav-bar-icon-color: #5c6169;
    background: rgba(255, 255, 255, 0.94);
    border-bottom: 1px solid #eceef1;
    backdrop-filter: saturate(160%) blur(12px);
  }

  :deep(.van-nav-bar__title) {
    max-width: none;
    margin: 0;
    padding: 0 84px 0 44px;
    box-sizing: border-box;
    text-align: left;
  }

  :deep(.van-nav-bar__left) {
    padding: 0 4px 0 12px;
  }

  :deep(.van-nav-bar__right) {
    padding-right: 12px;
  }

  :deep(.asset-page-title) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    line-height: 1.1;

    span {
      color: #23262b;
      font-size: 17px;
      font-weight: 600;
    }

    small {
      color: #8f949c;
      font-size: 11px;
      font-weight: 400;
      white-space: nowrap;
    }
  }
}

.asset-main {
  min-width: 0;
  min-height: 100vh;
}

.asset-bottom-actions {
  :deep(.footer-nav) {
    border-top: 1px solid #eceef1;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: none;
    backdrop-filter: saturate(160%) blur(12px);
  }

  :deep(.footer-nav .van-grid-item__text) {
    color: #8f949c;
    font-size: 11px;
  }

  :deep(.footer-nav .van-grid-item.is-active .van-grid-item__text) {
    color: #1989fa;
    font-weight: 500;
  }
}

@include desktop {
  .asset-layout {
    --footer-area-height: 0px;
  }

  .asset-main {
    padding-left: 196px;

    :deep(.van-nav-bar--fixed) {
      left: 196px;
      width: calc(100vw - 196px);
    }
  }

  .asset-bottom-actions {
    :deep(.footer-nav) {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 30;
      display: flex;
      flex-direction: column;
      width: 196px;
      height: 100vh;
      padding: 18px 12px;
      border-top: 0;
      border-right: 1px solid #eceef1;
      background: #fff;
      box-shadow: none;
      box-sizing: border-box;
    }

    :deep(.footer-nav::before) {
      content: '资产管理';
      flex: 0 0 auto;
      padding: 6px 10px 15px;
      color: #23262b;
      font-size: 15px;
      font-weight: 600;
    }

    :deep(.footer-nav .van-grid) {
      display: flex;
      width: 100%;
      height: auto;
      flex: 0 0 auto;
      flex-wrap: nowrap;
      flex-direction: column;
      gap: 4px;
    }

    :deep(.footer-nav .van-grid-item) {
      flex: 0 0 40px;
      width: 100%;
      height: 40px;
    }

    :deep(.footer-nav .van-grid-item__content) {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      width: 100%;
      height: 40px;
      min-height: 40px;
      padding: 0 12px;
      box-sizing: border-box;
      border-radius: 10px;
      color: #5c6169;
    }

    :deep(.footer-nav .van-grid-item__content::after) {
      display: none;
    }

    :deep(.footer-nav .van-grid-item__icon) {
      margin: 0;
    }

    :deep(.footer-nav .van-grid-item__text) {
      margin: 0;
      color: currentColor;
      font-size: 14px;
      line-height: 1;
    }

    :deep(.footer-nav .van-grid-item.is-active .van-grid-item__content) {
      background: rgba(25, 137, 250, 0.1);
      color: #1989fa;
      font-weight: 500;
    }
  }
}
</style>
