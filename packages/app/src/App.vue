<script setup lang="ts">
import { useRoute } from 'vue-router';
import FooterNav from '@/components/FooterNav/FooterNav.vue';
import { computed, onMounted } from 'vue';
const route = useRoute();
const showNav = computed(() => route.meta.nav === true)
onMounted(() => {
  window?.hideLoadingScreen?.()
})
</script>

<template>
  <div class="app-wrapper">
    <router-view v-slot="{ Component, route }">
      <KeepAlive :include="['HomeView', 'AlbumView', 'LikeView']">
        <component :is="Component" :key="route.fullPath"></component>
      </KeepAlive>
    </router-view>
  </div>
  <!-- 底部菜单 -->
  <footer-nav v-show="showNav"></footer-nav>
</template>

<style>
.app-wrapper {
  background-color: #fff;
}

html,
body {
  /* 禁用弹性滚动 */
  overscroll-behavior: none;
  --footer-area-height: 70px;
}

:root {
  --safe-area-bg-color: #fff;
}
</style>
