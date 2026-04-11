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
    // 查找当前页面的滚动容器
    let activeContainer: Document | Element = document;
    
    // 如果在带有横向滑动的 MainLayout 中（/home 或 /），限定查找范围为当前 active 的视图容器
    const swipeItems = ['/home', '/'];
    const swipeIndex = swipeItems.indexOf(path);
    if (swipeIndex !== -1) {
      const swiperItems = document.querySelectorAll('.custom-swiper-item');
      if (swiperItems[swipeIndex]) {
        activeContainer = swiperItems[swipeIndex];
      }
    }

    // 优先虚拟列表容器，其次是普通的带滚动条的下拉刷新容器，最后兜底页面根容器
    const scrollContainer = activeContainer.querySelector('.virtual-list-container') || activeContainer.querySelector('.pull-refresh-container') || document.querySelector('.app-wrapper > *:first-child');
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
