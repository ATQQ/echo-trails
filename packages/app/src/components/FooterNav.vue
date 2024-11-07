<template>
  <footer class="footer-nav">
    <van-grid clickable :column-num="2">
      <van-grid-item v-for="menu in menus" :key="menu.icon" :icon="menu.icon" :text="menu.text" :to="menu.to" />
    </van-grid>
  </footer>
</template>

<script lang="ts" setup>
const menus = [
  {
    icon: 'home-o',
    text: '全部',
    to: '/'
  },
  {
    icon: 'photo-o',
    text: '相册',
    to: '/album'
  }
]
</script>

<style lang="scss" scoped>
.footer-nav {
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
