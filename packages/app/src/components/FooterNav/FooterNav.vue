<template>
  <BottomActions :menus="menus" />
</template>

<script lang="ts" setup>
import BottomActions from '../BottomActions/BottomActions.vue';
import { useRoute, useRouter } from 'vue-router';
import { useFooterStore } from '@/stores/footer';
import { computed } from 'vue';

const route = useRoute();
const router = useRouter();
const footerStore = useFooterStore();

const handleTabClick = (path: string, replace = false) => {
  if (route.path === path) {
    // 查找当前页面的滚动容器：优先虚拟列表容器，其次是默认的页面根容器
    const scrollContainer = document.querySelector('.virtual-list-container') || document.querySelector('.app-wrapper > *:first-child');
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      // 兜底：如果没找到，尝试 window
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  } else {
    if (replace) {
      router.replace(path);
    } else {
      router.push(path);
    }
  }
}

const menus = computed(() => {
  return footerStore.items.map(item => ({
    ...item,
    handleClick: () => handleTabClick(item.path || item.to || '', item.replace)
  }))
})
</script>
