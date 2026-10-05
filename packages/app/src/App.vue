<script setup lang="ts">
import { type RouteLocationNormalizedLoaded, useRoute } from 'vue-router';
import FooterNav from '@/components/FooterNav/FooterNav.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isTauri } from '@/constants';
import { isAutoCheckUpdateEnabled } from '@/composables/useAutoCheckUpdate';
import { useAppUpdate } from '@/composables/useAppUpdate';
import MainLayout from '@/components/MainLayout.vue';
import SideNav from '@/components/SideNav/SideNav.vue';
import { useFooterStore } from '@/stores/footer';
import { useAuthStore } from '@/stores/auth';
import { useResponsive } from '@/composables/useResponsive';
import { useSideNavCollapsed } from '@/composables/useSideNavCollapsed';
import { useVConsole } from '@/composables/useVConsole';

const route = useRoute();
const footerStore = useFooterStore();
const authStore = useAuthStore();
const { isDesktop } = useResponsive();
const { collapsed: sideNavCollapsed } = useSideNavCollapsed();
const showNav = computed(() => route.meta.nav === true)
const isSwipePage = computed(() => !isDesktop.value && ['/home', '/'].includes(route.path))
const showSideNav = computed(() => isDesktop.value && route.name !== 'login' && authStore.isLoggedIn)
const isTauriDesktop = computed(() => isTauri && isDesktop.value)
const isSideNavCollapsed = computed(() => showSideNav.value && sideNavCollapsed.value)
const isAlbumScrolled = ref(false)
const showAlbumBlur = computed(() => route.path === '/' && isAlbumScrolled.value)
const getRouteViewKey = (viewRoute: RouteLocationNormalizedLoaded) => {
  if (viewRoute.matched.some(record => record.path === '/asset')) {
    return 'asset-layout'
  }

  if (isDesktop.value) {
    return viewRoute.fullPath
  }

  return ['/home', '/'].includes(viewRoute.path) ? 'main-layout' : viewRoute.fullPath
}

const handleAlbumScrollState = (event: Event) => {
  const detail = (event as CustomEvent<{ isScrolled?: boolean }>).detail
  isAlbumScrolled.value = !!detail?.isScrolled
}

watch(() => route.path, (path) => {
  if (path !== '/') {
    isAlbumScrolled.value = false
  }
})

// 拦截非输入元素上的 Backspace，防止触发浏览器/Tauri WebView 的 history.back()
// 焦点在 input/textarea/contenteditable 上时正常删除字符
const handleBackspaceNavigation = (e: KeyboardEvent) => {
  if (e.key !== 'Backspace') return
  const target = e.target as HTMLElement | null
  if (!target) return
  const tag = target.tagName
  // 输入类元素允许默认删除行为
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
  // 其余元素阻止默认的 history.back()
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('album-scroll-state', handleAlbumScrollState)
  window.addEventListener('keydown', handleBackspaceNavigation)
  // 兜底：5s 后若首页仍未触发隐藏（如登录页/非相册路由），强制隐藏 loading
  setTimeout(() => window?.hideLoadingScreen?.(), 5000)
  // 初始化 vConsole 调试控制台（依据设置页调试面板的开关状态）
  useVConsole()
  if (!isTauri || !isAutoCheckUpdateEnabled.value) return;
  // 静默检查：Web 离线包后台下载，未交互则在启动窗口内直接启用刷新
  void useAppUpdate().check({ silent: true });
})

watch([showSideNav, isSideNavCollapsed], ([hasSideNav, collapsedValue]) => {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('body-has-side-nav', hasSideNav)
  document.body.classList.toggle('body-side-nav-collapsed', collapsedValue)
}, { immediate: true })

onBeforeUnmount(() => {
  window.removeEventListener('album-scroll-state', handleAlbumScrollState)
  window.removeEventListener('keydown', handleBackspaceNavigation)
})
</script>

<template>
  <div class="app-wrapper" :class="{ 'is-desktop': isDesktop, 'has-side-nav': showSideNav, 'is-side-nav-collapsed': isSideNavCollapsed, 'is-tauri-desktop': isTauriDesktop }" ref="appWrapperRef">
    <div v-if="isTauriDesktop" class="app-drag-region" data-tauri-drag-region></div>
    <SideNav v-if="showSideNav" />
    <div class="app-main">
      <router-view v-slot="{ Component, route }">
        <KeepAlive v-if="isDesktop" :include="['MainLayout', 'HomeView', 'AlbumView', 'LikeView', 'DiscoveryView', 'AllAlbumView', 'VideoView', 'DriveView']">
          <component :is="Component" :key="getRouteViewKey(route)"></component>
        </KeepAlive>
        <transition v-else :name="showNav ? '' : 'van-fade'" mode="out-in">
          <KeepAlive :include="['MainLayout', 'HomeView', 'AlbumView', 'LikeView', 'DiscoveryView', 'AllAlbumView', 'VideoView', 'DriveView']">
            <component :is="isSwipePage ? MainLayout : Component" :key="getRouteViewKey(route)"></component>
          </KeepAlive>
        </transition>
      </router-view>
    </div>
  </div>
  <div v-if="showAlbumBlur && !isDesktop" class="album-top-blur-mask" aria-hidden="true"></div>
  <!-- 底部菜单（仅移动端） -->
  <footer-nav v-show="showNav && footerStore.isVisible && !isDesktop"></footer-nav>
</template>

<style>
.app-wrapper {
  background-color: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.app-drag-region {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  z-index: 9999;
  background: transparent;
  user-select: none;
  -webkit-user-select: none;
}

.app-wrapper > *:first-child:not(.app-drag-region) {
  flex: 1;
  overflow-y: auto; /* Default to scrollable */
  width: 100%;
  height: 100%;
}

.app-wrapper.has-side-nav {
  flex-direction: row;
  --side-nav-width: 200px;
}

.app-wrapper.has-side-nav.is-side-nav-collapsed {
  --side-nav-width: 64px;
}

body.body-has-side-nav {
  --side-nav-width: 200px;
}

body.body-has-side-nav.body-side-nav-collapsed {
  --side-nav-width: 64px;
}

body.body-has-side-nav .van-dropdown-item {
  left: var(--side-nav-width, 0px);
  width: calc(100vw - var(--side-nav-width, 0px));
  transition: left 0.2s ease, width 0.2s ease;
}

body.body-has-side-nav .van-nav-bar--fixed {
  left: var(--side-nav-width, 0px);
  width: calc(100vw - var(--side-nav-width, 0px));
  transition: left 0.2s ease, width 0.2s ease;
}

.app-wrapper.has-side-nav > *:first-child:not(.app-drag-region) {
  flex: 0 0 auto;
  overflow-y: auto;
  width: auto;
  height: 100%;
}

.app-wrapper.has-side-nav .app-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.app-wrapper.is-desktop {
  --footer-area-height: 0px;
}

.app-wrapper.is-desktop .app-main,
.app-wrapper.is-desktop .app-main * {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.app-wrapper.is-desktop .app-main::-webkit-scrollbar,
.app-wrapper.is-desktop *::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.app-wrapper .app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

html,
body {
  /* 禁用弹性滚动 */
  overscroll-behavior: none;
  --footer-area-height: 70px;
  height: 100%;
  width: 100%;
  overflow: hidden;
  /* 添加全局阻尼平滑滚动 */
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

/* 为所有滚动容器添加平滑效果 */
* {
  -webkit-overflow-scrolling: touch;
}

:root {
  --safe-area-bg-color: #fff;
}

.album-top-blur-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 72px;
  pointer-events: none;
  z-index: 8;
  overflow: hidden;
  contain: paint;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.68) 0%, rgba(255, 255, 255, 0.34) 45%, rgba(255, 255, 255, 0) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 48%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 48%, rgba(0,0,0,0) 100%);
}
</style>
