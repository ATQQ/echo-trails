<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import FooterNav from './components/FooterNav.vue';
import { computed, onMounted } from 'vue';
const route = useRoute();
const router = useRouter();
const showNav = computed(() => route.meta.nav === true)

onMounted(()=>{
  if(location.pathname === '/'){
    router.replace({
      name: 'album'
    })
  }
})
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
<style>
html, body {
  overscroll-behavior: none; /* 禁用弹性滚动 */
}
</style>
