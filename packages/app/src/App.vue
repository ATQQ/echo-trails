<script setup lang="ts">
import { useRoute } from 'vue-router';
import FooterNav from '@/components/FooterNav/FooterNav.vue';
import { computed, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { isTauri } from '@/constants';
import { version } from '../package.json';
import { type } from '@tauri-apps/plugin-os';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from "@/lib/request";
import NotificationBanner from '@/components/NotificationBanner/NotificationBanner.vue';

const route = useRoute();
const showNav = computed(() => route.meta.nav === true)

// Notification state
const showBanner = ref(false);
const bannerTitle = ref('');
const bannerMessage = ref('');
const bannerIcon = ref<string | undefined>(undefined);
const bannerDuration = ref(5000);
const bannerAction = ref<(() => void) | null>(null);

const appVersion = ref(version);
const updateInfoRef = ref<any>(null);

const handleDownload = async (url: string, version: string, md5?: string) => {
  // Start background download
  showToast('开始后台下载...');

  const unlisten = await listen('download-progress', (event: any) => {
    const { status } = event.payload;
    if (status === 'exists') {
      // Already exists, prompt install immediately?
      // Or show banner "Download complete"
      showDownloadCompleteBanner(event.payload.filePath || '');
    }
    // We can track progress here but user asked for "background" without overlay
  });

  try {
    const filePath = await invoke('download_apk', { url, version, md5 });
    unlisten();

    // Download finished
    showDownloadCompleteBanner(filePath as string);

  } catch (e) {
    console.error(e);
    // Optionally show failure banner
    unlisten();
  }
};

const showDownloadCompleteBanner = (filePath: string) => {
  bannerTitle.value = '下载完成';
  bannerMessage.value = '安装包已就绪，点击立即安装';
  bannerDuration.value = 8000; // Give user more time
  bannerAction.value = async () => {
    try {
      await invoke('open_apk', { filePath });
    } catch (e) {
      showToast('无法打开文件: ' + e);
    }
  };
  bannerAction.value()
  showBanner.value = true;
};

const handleBannerClick = () => {
  if (bannerAction.value) {
    bannerAction.value();
    showBanner.value = false; // Close on action
  }
};

const checkUpdate = async () => {
  try {
    // 获取当前平台
    let platform = 'macos';
    if (isTauri) {
      platform = await type();
    } else {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('android')) platform = 'android';
      else if (ua.includes('iphone') || ua.includes('ipad')) platform = 'ios';
      else if (ua.includes('windows')) platform = 'windows';
      else if (ua.includes('linux')) platform = 'linux';
    }

    // 直接调用后端 API 检查更新
    const res = await api.get('app/check-update', {
      searchParams: {
        version: appVersion.value,
        platform: platform,
        t: Date.now()
      }
    }).json<any>();

    if (res.code !== 0) return;

    const updateInfo = res.data;

    if (updateInfo && updateInfo.hasUpdate) {
      updateInfoRef.value = updateInfo;

      // Show Notification Banner
      bannerTitle.value = '发现新版本 - 点击开始下载';
      bannerMessage.value = `v${updateInfo.latestVersion} ${updateInfo.description}`;
      bannerDuration.value = 6000;

      bannerAction.value = () => {
        // When clicked, trigger update flow
        if (platform === 'android' && isTauri) {
          if (updateInfo.downloadUrl) {
            handleDownload(updateInfo.downloadUrl, updateInfo.latestVersion, updateInfo.md5);
          } else {
            showToast('暂无下载地址');
          }
        } else if (isTauri) {
           openUrl(updateInfo.downloadUrl);
        } else {
           window.open(updateInfo.downloadUrl, '_blank');
        }
      };

      showBanner.value = true;
    }
  } catch (e) {
    console.error('Update check failed:', e);
  }
};

onMounted(() => {
  window?.hideLoadingScreen?.()
  if(!isTauri) return;
  checkUpdate();
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

  <!-- Notification Banner -->
  <NotificationBanner
    v-model:show="showBanner"
    :title="bannerTitle"
    :message="bannerMessage"
    :icon="bannerIcon"
    :duration="bannerDuration"
    @click="handleBannerClick"
  />
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
