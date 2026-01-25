<template>
  <BottomActions :menus="menus" />
</template>

<script lang="ts" setup>
import BottomActions from '../BottomActions/BottomActions.vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

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

const menus = [
  {
    icon: 'home-o',
    text: '全部',
    path: '/home',
    activeIcon: 'wap-home',
    activeColor: '#2196f3',
    replace: false,
    handleClick: () => handleTabClick('/home')
  },
  {
    icon: 'photo-o',
    text: '相册',
    path: '/',
    activeIcon: 'photo',
    activeColor: '#2196f3',
    replace: true,
    handleClick: () => handleTabClick('/', true)
  },
  {
    icon: 'like-o',
    text: '我喜欢',
    path: '/like',
    activeIcon: 'like',
    activeColor: '#f53f3f',
    replace: false,
    handleClick: () => handleTabClick('/like')
  },
  {
    icon: 'apps-o',
    text: '发现',
    to: '/discovery',
    activeIcon: 'apps-o',
    activeColor: '#2196f3',
    replace: true
  },
]
</script>
