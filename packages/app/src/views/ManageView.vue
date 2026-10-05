<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLocalStorage } from '@vueuse/core';
import { showConfirmDialog, showToast } from 'vant';
import { isTauri } from '@/constants';
import { checkLogin } from '@/service';
import { isLocalMode } from '@/lib/serviceRouter';
import { getAppCommit, getNativeBuild } from '@/lib/app-update';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isCacheDebugMode, isCacheDisabled } from '@/composables/useCachedImage';
import { isNativeUploadTokenEnabled } from '@/composables/useUploadTokenConfig';
import { isAutoCheckUpdateEnabled } from '@/composables/useAutoCheckUpdate';
import { useVConsole } from '@/composables/useVConsole';
import { useAppUpdate } from '@/composables/useAppUpdate';
import { preventBack } from '@/lib/router';

const router = useRouter();

// 更新流程统一交给 useAppUpdate（静默 + 手动），这里只暴露进度给遮罩层
const {
  downloading,
  downloadPercent,
  downloadStatus,
  check: checkAppUpdate,
  currentVersion,
} = useAppUpdate();

// 用户信息
const { value: userInfo } = useLocalStorage('userInfo', {
  username: '',
  operator: '',
  isAdmin: false
});

const isAdmin = ref(userInfo.isAdmin || false);
const isLogin = ref(isLocalMode() || !!localStorage.getItem('token'));
onMounted(async () => {
  try {
    const res = await checkLogin();
    if (res.code === 0) {
      isAdmin.value = res.data.isAdmin;
      userInfo.isAdmin = res.data.isAdmin;
      isLogin.value = true;
    }
  } catch (e) {
    if (!isLocalMode()) {
      userInfo.username = '';
      userInfo.operator = '';
      userInfo.isAdmin = false;
      isLogin.value = false;
      isAdmin.value = false;
    }
    console.error(e);
  }
});


// 版本信息：热更新后当前版本与热更包信息都由 Native 提供
const clickVersionCount = ref(0);
const appCommit = getAppCommit();
const nativeCommit = ref('');
const nativeShellVersion = ref('');
const webVersion = ref('');
const webHash = ref('');
const versionCommit = computed(() => nativeCommit.value || appCommit);
// 主版本以壳为准：壳升级后这里自然跟着变，离线包单独一行展示
const displayVersion = computed(() => nativeShellVersion.value || currentVersion.value);
// 离线包行展示「构建该包的 commit」：当前运行的 JS 就来自离线包，其 __APP_COMMIT__ 即包自身的 commit。
const webCommit = computed(() => (webVersion.value ? appCommit : ''));

/** Native 侧拿不到真实 commit 时会返回 unknown/dev，这种情况回退到前端构建期注入值。 */
function usableCommit(value?: string) {
  const commit = value?.trim() || '';
  if (!commit || commit === 'unknown' || commit === 'dev') return '';
  return commit;
}

onMounted(() => {
  if (!isTauri) return;
  void getNativeBuild()
    .then((info) => {
      nativeCommit.value = usableCommit(info?.commit);
      nativeShellVersion.value = info?.version?.trim() || '';
      webVersion.value = info?.webVersion?.trim() || '';
      webHash.value = info?.webHash?.trim() || '';
    })
    .catch((error) => {
      console.error('Read native build info failed:', error);
    });
});

let clickTimer: any = null;
const showDebugMenu = ref(false);
const useLegacyWeightEntry = useLocalStorage('use_legacy_weight_entry', false);
const { enabled: vConsoleEnabled } = useVConsole();
preventBack(showDebugMenu);

const handleVersionClick = () => {
  clickVersionCount.value++;
  
  if (clickTimer) clearTimeout(clickTimer);
  
  if (clickVersionCount.value >= 5) {
    showDebugMenu.value = true;
    clickVersionCount.value = 0;
  } else {
    clickTimer = setTimeout(() => {
      clickVersionCount.value = 0;
    }, 1000);
  }
};

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
      userInfo.isAdmin = false;
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

// 检查更新：统一走 useAppUpdate，Web 热更新 / Android APK / 桌面原生更新都在内部决策
const handleCheckUpdate = async () => {
  await checkAppUpdate({ silent: false });
};

// 关于项目
const showAbout = () => {
  showConfirmDialog({
    title: '关于 Echo Trails',
    message: 'Echo Trails 是一个跨平台的相册管理应用，旨在提供便捷的照片管理和浏览体验。\n\n当前版本：v' + displayVersion.value,
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
      <van-cell-group v-if="!isLocalMode()" title="基础配置" inset>
        <van-cell title="家庭" :value="userInfo.username || '未登录'" />
        <van-cell title="用户" :value="userInfo.operator || '-'" />
        <!-- 账号管理菜单 -->
        <!-- 在这里新增一个账号管理tab -->
        <van-cell v-if="isLogin" title="退出登录" is-link @click="handleLogout" class="logout-cell" />
        <van-cell v-else title="登录" is-link replace to="/login" />
      </van-cell-group>

      <!-- 服务配置 -->
      <van-cell-group title="系统设置" inset>
        <van-cell title="服务配置" is-link @click="goToServiceConfig" :label="isLocalMode() ? '当前：本地模式' : '配置远程服务器地址和访问令牌'" />
      </van-cell-group>

      <!-- 功能 -->
      <van-cell-group v-if="isLogin" title="功能" inset>
        <van-cell title="回收站" is-link to="/delete" />
        <van-cell title="缓存管理" is-link to="/manage/cache" />
      </van-cell-group>

      <!-- 其他 -->
      <van-cell-group title="其他" inset>
        <van-cell v-if="isTauri" title="检查更新" is-link @click="handleCheckUpdate" />
        <van-cell v-if="isTauri" title="自动检查更新" label="启动时自动检查新版本">
          <template #right-icon>
            <van-switch v-model="isAutoCheckUpdateEnabled" size="20" />
          </template>
        </van-cell>
        <van-cell title="关于项目" is-link @click="showAbout" />
      </van-cell-group>

      <!-- 版本信息 -->
      <div class="version-info">
        <div @click="handleVersionClick">
          Echo Trails v{{ displayVersion }}<span v-if="versionCommit"> ({{ versionCommit }})</span>
        </div>
        <div v-if="webVersion" class="ota-line" :title="webHash ? `离线包 md5: ${webHash}` : undefined">
          离线包 v{{ webVersion }}<span v-if="webCommit"> ({{ webCommit }})</span>
        </div>
        <div class="github-link" @click="openGithub">
          开源地址: https://github.com/ATQQ/echo-trails
        </div>
      </div>
    </div>

    <!-- Download Progress Overlay -->
    <van-overlay :show="downloading" z-index="9999">
      <div class="wrapper" style="display: flex; align-items: center; justify-content: center; height: 100%;">
        <div class="block" style="width: 80%; background-color: #fff; border-radius: 8px; padding: 20px; text-align: center;">
          <van-loading type="spinner" v-if="downloadPercent < 100" />
          <div style="margin-top: 10px; font-size: 16px;">{{ downloadStatus }}</div>
          <van-progress :percentage="downloadPercent" style="margin-top: 15px;" />
        </div>
      </div>
    </van-overlay>

    <!-- Debug Menu Popup -->
    <van-popup v-model:show="showDebugMenu" position="bottom" round class="safe-padding-bottom">
      <div class="debug-menu-header">
        <h3>开发者调试模式</h3>
      </div>
      <div class="debug-menu-content">
        <van-cell-group inset>
          <van-cell v-if="isTauri && !isLocalMode()" title="原生 S3 上传 Token" label="开启后在客户端内直接生成 S3 预签名 URL（需要配置了云端环境）">
            <template #right-icon>
              <van-switch v-model="isNativeUploadTokenEnabled" size="20" />
            </template>
          </van-cell>
          <van-cell v-if="isTauri" title="图片缓存角标" label="在图片左上角显示「缓存」标识并支持点击删除单张缓存">
            <template #right-icon>
              <van-switch v-model="isCacheDebugMode" size="20" />
            </template>
          </van-cell>
          <van-cell v-if="isTauri" title="禁用图片缓存" label="强制所有图片从网络加载，不读取也不写入本地缓存">
            <template #right-icon>
              <van-switch v-model="isCacheDisabled" size="20" />
            </template>
          </van-cell>
          <van-cell title="旧版体重入口" label="开启后健康管理里的「体重记录」进入旧版页面">
            <template #right-icon>
              <van-switch v-model="useLegacyWeightEntry" size="20" />
            </template>
          </van-cell>
          <van-cell title="vConsole 调试控制台" label="启用后可在应用内查看 console 日志">
            <template #right-icon>
              <van-switch v-model="vConsoleEnabled" size="20" />
            </template>
          </van-cell>
        </van-cell-group>
      </div>
    </van-popup>
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

  .ota-line {
    margin-top: 6px;
    word-break: break-all;
    user-select: all;
  }

  .github-link {
    margin-top: 8px;
    color: var(--van-primary-color);
    cursor: pointer;
  }
}

.debug-menu-header {
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid #f2f3f5;
  margin-bottom: 12px;
  
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #323233;
  }
}

.debug-menu-content {
  padding-bottom: 24px;
  background-color: #f7f8fa;
}
</style>
