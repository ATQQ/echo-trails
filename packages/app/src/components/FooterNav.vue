<template>
  <footer class="footer-nav safe-padding-bottom">
    <van-grid clickable :column-num="3" :border="false">
      <van-grid-item v-for="menu in menus" :key="menu.icon" :icon="route.path === menu.to ? menu.activeIcon : menu.icon"
        :text="menu.text" :to="menu.to" :icon-color="route.path === menu.to ? menu.color : ''" />
    </van-grid>
  </footer>
</template>

<script lang="ts" setup>
import { useRoute } from 'vue-router';

const route = useRoute();
const menus = [
  {
    icon: 'home-o',
    text: '全部',
    to: '/',
    activeIcon: 'wap-home',
    color: '#2196f3',
  },
  {
    icon: 'photo-o',
    text: '相册',
    to: '/album',
    activeIcon: 'photo',
    color: '#2196f3'
  },
  {
    icon: 'like-o',
    text: '我喜欢',
    to: '/like',
    activeIcon: 'like',
    color: '#f53f3f'
  },
]
</script>

<style lang="scss" scoped>
.safe-padding-bottom{
  background-color: var(--safe-area-bg-color);
}

.footer-nav {
  padding-top: 8px;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  --van-grid-item-icon-size: 20px;
  --van-grid-item-text-font-size: 12px;

  :deep(.van-grid-item__content) {
    padding: 6px 0 2px 0;
  }
}
</style>
