<script lang="ts" setup>
import { useRoute } from 'vue-router';

const { menus } = defineProps<{
  menus: {
    icon: string;
    text: string;
    to?: string;
    activeIcon?: string;
    activeColor?: string;
    handleClick?: () => void
    active?: boolean
    color?: string
    replace?: boolean
  }[],
}>()

const route = useRoute();
</script>
<template>
  <footer class="footer-nav safe-padding-bottom">
    <van-grid :column-num="menus.length" :border="false">
      <van-grid-item v-for="menu in menus" :key="menu.icon" :icon="route.path === menu.to ? menu.activeIcon : menu.icon"
        :text="menu.text" :to="menu.to" :replace="menu.replace" :icon-color="(route.path === menu.to || menu.active) ? menu.activeColor : menu.color"
        @click="menu.handleClick" />
    </van-grid>
  </footer>

</template>
<style lang="scss" scoped>
.safe-padding-bottom {
  background-color: var(--safe-area-bg-color);
}

.footer-nav {
  padding-top: 4px;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  --van-grid-item-icon-size: 20px;
  --van-grid-item-text-font-size: 12px;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.1);
  :deep(.van-grid-item__content) {
    padding: 6px 0 2px 0;
  }
}
</style>
