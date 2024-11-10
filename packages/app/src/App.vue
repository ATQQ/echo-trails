<script setup lang="ts">
import { useRoute } from 'vue-router';
import FooterNav from './components/FooterNav.vue';
import { computed } from 'vue';
const route = useRoute();
const showNav = computed(() => route.meta.nav === true)

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
  <footer-nav v-show="showNav"></footer-nav>
</template>

<style scoped>
.wrapper {
  background-color: #fff;
}
</style>
