<template>
  <footer class="footer-nav">
    <van-grid clickable :column-num="3">
      <van-grid-item v-for="menu in menus" :key="menu.icon" :icon="menu.icon" :text="menu.text" :to="menu.to"
        :icon-color="menu.color" />
    </van-grid>
  </footer>
</template>

<script lang="ts" setup>

// TODO: active style
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
  },
  {
    icon: 'like',
    text: '我喜欢',
    to: '/like',
    color: '#f53f3f'
  },
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
