<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLocalStorage } from '@vueuse/core';
import { showConfirmDialog, showToast, showLoadingToast, closeToast, showDialog } from 'vant';
import { isTauri } from '@/constants';
import { checkLogin } from '@/service';
import { version } from '../../package.json';
import { type } from '@tauri-apps/plugin-os';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from "@/lib/request";

const router = useRouter();

// Download state
const showDownloadProgress = ref(false);
const downloadPercent = ref(0);
const downloadStatus = ref('');

// ... existing code ...

// 用户信息
const { value: userInfo } = useLocalStorage('userInfo', {
  username: '',
  operator: ''
});

const isAdmin = ref(false);
const isLogin = ref(false);
onMounted(async () => {
  try {
    const res = await checkLogin();
    if (res.code === 0) {
      isAdmin.value = res.data.isAdmin;
      isLogin.value = true;
    }
  } catch (e) {
    console.error(e);
  }
});


// App 版本号
const appVersion = ref(version);

// 退出登录
const handleLogout = () => {
  showConfirmDialog({
    title: '提示',
    message: '确定要退出登录吗？',
  })
    .then(() => {
      // 清除 token 和用户信息
      localStorage.removeItem('token');
      userInfo.username = '';
      userInfo.operator = '';
      isLogin.value = false;

      showToast('已退出登录');
      router.replace('/login');
    })
    .catch(() => {
      // on cancel
    });
};

// 跳转到服务配置
const goToServiceConfig = () => {
  router.push('/set');
};

// 检查更新
const handleCheckUpdate = async () => {
  const toast = showLoadingToast({
    message: '检查更新中...',
    forbidClick: true,
    duration: 0,
  });

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
    // 我们需要传入 version 和 platform
    const res = await api.get('app/check-update', {
      searchParams: {
        version: appVersion.value,
        platform: platform,
        t: Date.now()
      }
    }).json<ServerResponse<any>>(); // 假设 ServerResponse 是通用的 { code, data }

    if (res.code !== 0) {
      throw new Error(res.message || 'Check update failed');
    }

    const updateInfo = res.data;

    if (updateInfo && updateInfo.hasUpdate) {
      closeToast();

      // 构建更新提示信息
      let message = `最新版本：${updateInfo.latestVersion}\n\n${updateInfo.description || ''}`;

      // 如果有详细 changelog
      if (updateInfo.changelog) {
          const log = updateInfo.changelog;
          message = `最新版本：${updateInfo.latestVersion}\n发布日期：${log.date || ''}\n\n${log.description || updateInfo.description}`;
      }

      showConfirmDialog({
        title: '发现新版本',
        message: message,
        confirmButtonText: (platform === 'android' && isTauri) ? '应用内更新' : '去更新',
        cancelButtonText: (platform === 'android' && isTauri) ? '浏览器下载' : '取消',
        closeOnClickOverlay: (platform === 'android' && isTauri),
      })
        .then(async () => {
          if (updateInfo.downloadUrl) {
            // Check if we are on Android and use native download
            if (platform === 'android' && isTauri) {
              handleDownload(updateInfo.downloadUrl, updateInfo.latestVersion, updateInfo.md5);
            } else if (isTauri) {
               await openUrl(updateInfo.downloadUrl);
             } else {
              window.open(updateInfo.downloadUrl, '_blank');
            }
          } else {
            showToast('暂无下载地址');
          }
        })
        .catch(async (action: any) => {
          // on cancel
          if (action === 'cancel' && platform === 'android' && isTauri) {
             if (updateInfo.downloadUrl) {
                await openUrl(updateInfo.downloadUrl);
             } else {
                showToast('暂无下载地址');
             }
          }
        });
    } else {
      closeToast();
      showToast('当前已是最新版本');
    }
  } catch (e) {
    console.error(e);
    closeToast();
    showToast('检查更新失败');
  }
};

// 关于项目
const showAbout = () => {
  showConfirmDialog({
    title: '关于 Echo Trails',
    message: 'Echo Trails 是一个跨平台的相册管理应用，旨在提供便捷的照片管理和浏览体验。\n\n当前版本：v' + appVersion.value,
    showCancelButton: false,
  });
};

const goBack = () => {
  router.back();
};

const openGithub = async () => {
  const url = 'https://github.com/ATQQ/echo-trails';
  if (isTauri) {
    await openUrl(url);
  } else {
    window.open(url, '_blank');
  }
};

const handleDownload = async (url: string, version: string, md5?: string) => {
  showDownloadProgress.value = true;
  downloadPercent.value = 0;
  downloadStatus.value = '准备下载...';

  const unlisten = await listen('download-progress', (event: any) => {
    const { progress, total, status } = event.payload;
    if (status === 'exists') {
      downloadPercent.value = 100;
      downloadStatus.value = '文件已存在';
    } else {
      if (total > 0) {
        downloadPercent.value = Math.floor((progress / total) * 100);
        downloadStatus.value = `正在下载... ${downloadPercent.value}%`;
      } else {
        const mb = (progress / 1024 / 1024).toFixed(2);
        downloadStatus.value = `正在下载... ${mb}MB`;
      }
    }
  });

  try {
    const filePath = await invoke('download_apk', { url, version, md5 });
    showDownloadProgress.value = false;
    unlisten();

    showConfirmDialog({
      title: '下载完成',
      message: `安装包已下载到: ${filePath}\n是否立即安装？`,
      confirmButtonText: '立即安装',
    })
      .then(async () => {
        try {
          await invoke('open_apk', { filePath });
        } catch (e) {
          showToast('无法打开文件: ' + e);
        }
      })
      .catch(() => {});
  } catch (e) {
    console.error(e);
    showToast('下载失败: ' + e);
    showDownloadProgress.value = false;
    unlisten();
  }
};
</script>

<template>
  <div class="manage-container">
    <van-nav-bar
      title="设置"
      left-text="返回"
      left-arrow
      @click-left="goBack"
      placeholder
      class="safe-padding-top"
    />

    <div class="content">
      <!-- 账号管理 -->
      <van-cell-group title="账号管理" inset v-if="isAdmin">
        <van-cell title="账号列表" is-link to="/manage/accounts" />
      </van-cell-group>

      <!-- 基础配置 -->
      <van-cell-group title="基础配置" inset>
        <van-cell title="家庭" :value="userInfo.username || '未登录'" />
        <van-cell title="用户" :value="userInfo.operator || '-'" />
        <!-- 账号管理菜单 -->
        <!-- 在这里新增一个账号管理tab -->
        <van-cell title="退出登录" is-link @click="handleLogout" class="logout-cell" />
      </van-cell-group>

      <!-- 服务配置 -->
      <van-cell-group v-if="isAdmin" title="系统设置" inset>
        <van-cell title="服务配置" is-link @click="goToServiceConfig" label="配置服务器地址和访问令牌" />
      </van-cell-group>

      <!-- 功能 -->
      <van-cell-group v-if="isLogin" title="功能" inset>
        <van-cell title="回收站" is-link to="/delete" />
      </van-cell-group>

      <!-- 其他 -->
      <van-cell-group title="其他" inset>
        <van-cell v-if="isTauri" title="检查更新" is-link @click="handleCheckUpdate" />
        <van-cell title="关于项目" is-link @click="showAbout" />
      </van-cell-group>

      <!-- 版本信息 -->
      <div class="version-info">
        <div>Echo Trails v{{ appVersion }}</div>
        <div class="github-link" @click="openGithub">
          开源地址: https://github.com/ATQQ/echo-trails
        </div>
      </div>
    </div>

    <!-- Download Progress Overlay -->
    <van-overlay :show="showDownloadProgress" z-index="9999">
      <div class="wrapper" style="display: flex; align-items: center; justify-content: center; height: 100%;">
        <div class="block" style="width: 80%; background-color: #fff; border-radius: 8px; padding: 20px; text-align: center;">
          <van-loading type="spinner" v-if="downloadPercent < 100" />
          <div style="margin-top: 10px; font-size: 16px;">{{ downloadStatus }}</div>
          <van-progress :percentage="downloadPercent" style="margin-top: 15px;" />
        </div>
      </div>
    </van-overlay>
  </div>
</template>

<style scoped lang="scss">
.manage-container {
  min-height: 100vh;
  box-sizing: border-box;
  background-color: #f7f8fa;
}

.content {
  padding-top: 12px;
  padding-bottom: 40px;
}

.logout-cell {
  color: var(--van-danger-color);
  :deep(.van-cell__title) {
    color: inherit;
  }
}

.version-info {
  margin-top: 30px;
  text-align: center;
  color: #969799;
  font-size: 12px;

  .github-link {
    margin-top: 8px;
    color: var(--van-primary-color);
    cursor: pointer;
  }
}
</style>
