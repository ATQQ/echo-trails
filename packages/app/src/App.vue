<script setup lang="ts">
import FooterNav from './components/FooterNav.vue';
</script>

<template>
  <div class="wrapper">
    <router-view v-slot="{ Component, route }">
      <KeepAlive :include="['HomeView', 'AlbumView', 'LikeView']">
        <component :is="Component" :key="route.fullPath"></component>
      </KeepAlive>
    </router-view>
  </div>
  <!-- 底部菜单 -->
  <footer-nav></footer-nav>
</template>

<style scoped>
.wrapper {
  background-color: #fff;
}
</style>
