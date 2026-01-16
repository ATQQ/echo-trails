<template>
  <BottomActions :menus="menus" />
</template>

<script lang="ts" setup>
import BottomActions from './BottomActions.vue';

const menus = [
  {
    icon: 'home-o',
    text: '全部',
    to: '/home',
    activeIcon: 'wap-home',
    activeColor: '#2196f3',
    replace: false
  },
  {
    icon: 'photo-o',
    text: '相册',
    to: '/',
    activeIcon: 'photo',
    activeColor: '#2196f3',
    replace: true
  },
  {
    icon: 'like-o',
    text: '我喜欢',
    to: '/like',
    activeIcon: 'like',
    activeColor: '#f53f3f',
    replace: false
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
