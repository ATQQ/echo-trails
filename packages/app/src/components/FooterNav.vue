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
  },
  {
    icon: 'photo-o',
    text: '相册',
    to: '/',
    activeIcon: 'photo',
    activeColor: '#2196f3'
  },
  {
    icon: 'like-o',
    text: '我喜欢',
    to: '/like',
    activeIcon: 'like',
    activeColor: '#f53f3f'
  },
]
</script>
