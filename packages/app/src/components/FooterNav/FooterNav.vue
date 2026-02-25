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
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
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
