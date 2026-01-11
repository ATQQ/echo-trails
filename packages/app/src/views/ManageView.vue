<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLocalStorage } from '@vueuse/core';
import { showConfirmDialog, showToast, showLoadingToast, closeToast } from 'vant';
import { isTauri } from '@/constants';
import { checkLogin } from '@/service';

const router = useRouter();

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

// App 版本号 (这里暂时硬编码，或者从环境变量读取)
const appVersion = ref('0.1.2');

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
const handleCheckUpdate = () => {
  const toast = showLoadingToast({
    message: '检查更新中...',
    forbidClick: true,
    duration: 0,
  });

  // 模拟检查更新
  setTimeout(() => {
    closeToast();
    showToast('当前已是最新版本');
  }, 1500);
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
        <van-cell title="当前用户" :value="userInfo.username || '未登录'" />
        <van-cell title="操作员" :value="userInfo.operator || '-'" />
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
        Echo Trails v{{ appVersion }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.manage-container {
  min-height: 100vh;
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
}
</style>
