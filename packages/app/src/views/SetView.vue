<script setup lang="ts">
import { getConfig, refreshService, saveConfig, validConfig } from '@/lib/configStorage';
import { checkServiceHealth } from '@/service';
import { getBitifulConfig, getBitifulConfigLocal, updateBitifulConfigComplete, type BitifulConfig } from '@/lib/bitifulConfig';
import { defaultOrigin } from '@/lib/request';
import router from '@/router';
import { useLocalStorage } from '@vueuse/core';
import { showConfirmDialog, showNotify } from 'vant';
import { computed, onMounted, ref } from 'vue';
import QrcodeVue from 'qrcode.vue';

const mode = ref('');
const modeValue = ref<string[]>([]);
const selectMode = computed(() => modeValue.value[0])
const showModeSelect = ref(false);
const columns = [
  { text: 'Server', value: 'server' },
  // 开发中
  // { text: 'Native', value: 'native' },
];

const onModeChanged = ({ selectedValues, selectedOptions }: { selectedValues: string[], selectedOptions: any[] }) => {
  mode.value = selectedOptions[0]?.text;
  modeValue.value = selectedValues;
  showModeSelect.value = false;
};

const serverUrl = ref('')
const token = ref('');
const { value: userInfo } = useLocalStorage('userInfo', {
  operator: '',
  username: ''
})

// Bitiful 配置相关
const showBitifulConfig = ref(false)
const bitifulConfig = ref<BitifulConfig>({
  accessKey: '',
  secretKey: '',
  cdnToken: '',
  bucket: '',
  domain: '',
  coverStyle: '',
  previewStyle: '',
  albumStyle: '',
  region: 'cn-east-1',
  endpoint: 'https://s3.bitiful.net',
})

const onSubmit = async () => {
  const config = {
    mode: selectMode.value,
    serverUrl: serverUrl.value,
    token: '',
  }
  try {
    // 校验数据合理性
    await checkServiceHealth(config.serverUrl)
    showNotify({ type: 'success', message: '服务地址校验通过，页面即将重载' })
    setTimeout(() => {
      window.location.reload()
    }, 2000)
  } catch (err: any) {
    // 清空用户信息
    userInfo.operator = ''
    userInfo.username = ''
    // 更新无效配置页面状态
    showExit.value = false
    config.token = ''
    showNotify({ type: 'danger', message: err?.message });
  } finally {
    // 存配置数据
    await saveConfig(config)
    // 更新服务
    await refreshService(config)
  }

};

const showExit = ref(false)

const onClickLeft = () => {
  router.back();
};

onMounted(async () => {
  // 取数据
  const cfg = await getConfig()

  // 格式化后回填
  mode.value = cfg.mode
  modeValue.value = [cfg.mode]
  serverUrl.value = cfg.serverUrl
  token.value = cfg.token || ''
  showExit.value = !!cfg.token

  // 加载 bitiful 配置 - 优先使用远端配置
  try {
    const remoteBitifulConfig = await getBitifulConfig()
    if (remoteBitifulConfig) {
      bitifulConfig.value = remoteBitifulConfig
    }
  } catch (error) {
    // 如果远端获取失败，尝试获取本地配置
    const localBitifulConfig = await getBitifulConfigLocal()
    if (localBitifulConfig) {
      bitifulConfig.value = localBitifulConfig
    }
  }
})

const onReset = async () => {
  const confirmed = await showConfirmDialog({
    title: '初始化确认',
    message:
      '确定要初始化所有配置吗？',
  })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
  if (!confirmed) {
    return
  }

  // 清空配置数据
  localStorage.removeItem('config')

  mode.value = 'server'
  modeValue.value = ['server']
  serverUrl.value = defaultOrigin
  token.value = ''

  await saveConfig({
    mode: 'server',
    serverUrl: defaultOrigin,
    token: ''
  })
}

const onLogout = async () => {
  const confirmed = await showConfirmDialog({
    title: '退出登录',
    message:
      '确定要退出登录吗？',
  })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
  if (!confirmed) {
    return
  }

  // 清空配置数据
  localStorage.clear()
  token.value = ''
  const config = {
    mode: selectMode.value,
    serverUrl: serverUrl.value,
    token: token.value
  }
  await saveConfig(config)

  showNotify({ type: 'success', message: '退出登录成功' })
  setTimeout(() => {
    // 刷新页面
    window.location.reload()
  }, 2000)
}

// 保存 bitiful 配置
const onSaveBitifulConfig = async () => {
  try {
    // ~~创建配置副本，排除 region 字段~~
    const { ...configWithoutRegion } = bitifulConfig.value
    await updateBitifulConfigComplete(configWithoutRegion)
    showNotify({ type: 'success', message: 'Bitiful 配置更新成功' })
  } catch (err: any) {
    showNotify({ type: 'danger', message: err?.message || 'Bitiful 配置更新失败' })
  }
}

const showShareQrCode = ref(false);
const qrCodeValue = ref('');

const onShareLogin = () => {
  const config = {
    serverUrl: serverUrl.value,
    token: token.value
  };
  qrCodeValue.value = JSON.stringify(config);
  showShareQrCode.value = true;
};
</script>

<template>
  <div class="set-view-container">
    <van-nav-bar title="服务配置" left-text="返回" left-arrow @click-left="onClickLeft" placeholder class="safe-padding-top" />
    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <!-- 模式选择 -->
        <van-field v-model="mode" is-link readonly name="mode" label="模式" placeholder="点击切换模式"
          @click="showModeSelect = true" />

        <template v-if="selectMode === 'server'">
          <van-field v-model="serverUrl" name="serverUrl" label="服务地址" placeholder="服务地址"
            :rules="[{ required: true, message: '请填写服务地址' }]" />
          <!-- <van-field v-model="token" type="password" name="token" label="令牌" placeholder="验证身份" s
            :rules="[{ required: true, message: '请填写令牌' }]" /> -->
        </template>

      </van-cell-group>
      <!-- <van-cell-group inset>
        <van-cell title="家庭" :value="userInfo.username" />
        <van-cell title="操作账号" :value="userInfo.operator" />
      </van-cell-group> -->

      <!-- Bitiful 配置区域 -->
      <van-cell-group inset v-if="showExit">
        <van-cell title="Bitiful 配置" is-link :value="showBitifulConfig ? '收起' : '展开'"
          @click="showBitifulConfig = !showBitifulConfig" />
        <template v-if="showBitifulConfig">
          <van-field v-model="bitifulConfig.accessKey" name="accessKey" label="Access Key" placeholder="默认不回显展示" />
          <van-field v-model="bitifulConfig.secretKey" type="password" name="secretKey" label="Secret Key"
            placeholder="默认不回显展示" />
          <van-field v-model="bitifulConfig.cdnToken" name="cdnToken" label="CDN Token" placeholder="默认不回显展示" />
          <van-field v-model="bitifulConfig.bucket" name="bucket" label="Bucket" placeholder="请输入 Bucket 名称" />
          <van-field v-model="bitifulConfig.region" name="region" label="Region" placeholder="请输入 Region" />
          <van-field v-model="bitifulConfig.endpoint" name="endpoint" label="Endpoint" placeholder="请输入 Endpoint" />
          <van-field v-model="bitifulConfig.domain" name="domain" label="CDN Domain" placeholder="自定义域名" />
          <!-- 添加提示 -->
          <van-cell title="💡 提示" value="配置样式节约流量" title-class="text-blue-600" value-class="text-gray-500 text-sm" />
          <van-field v-model="bitifulConfig.coverStyle" name="coverStyle" label="封面样式" placeholder="（选填）封面样式" />
          <van-field v-model="bitifulConfig.previewStyle" name="previewStyle" label="预览样式" placeholder="（选填）预览样式" />
          <van-field v-model="bitifulConfig.albumStyle" name="albumStyle" label="相册样式" placeholder="（选填）相册样式" />
          <div class="btn-wrapper">
            <van-button round block type="primary" @click="onSaveBitifulConfig">
              保存 Bitiful 配置
            </van-button>
          </div>
        </template>
      </van-cell-group>
      <div class="btn-wrapper">
        <van-button round block type="success" native-type="submit">
          确定
        </van-button>
      </div>
      <div class="btn-wrapper">
        <van-button round block type="primary" @click="onReset">
          初始化所有配置
        </van-button>
      </div>

      <div class="btn-wrapper" v-if="showExit">
        <van-button round block type="primary" @click="onShareLogin">
          分享登录凭证
        </van-button>
      </div>

      <div class="btn-wrapper" v-if="showExit">
        <van-button round block type="danger" @click="onLogout">
          退出登录
        </van-button>
      </div>
    </van-form>
    <div class="mode-select">
      <van-popup v-model:show="showModeSelect" destroy-on-close position="bottom">
        <van-picker :columns="columns" :model-value="modeValue" @confirm="onModeChanged"
          @cancel="showModeSelect = false" />
      </van-popup>
    </div>
    <van-popup v-model:show="showShareQrCode" round :style="{ padding: '24px' }">
      <div style="text-align: center;">
        <h3 style="margin-top: 0;">扫码登录</h3>
        <qrcode-vue :value="qrCodeValue" :size="200" level="M" />
        <p style="color: #666; font-size: 14px; margin-bottom: 0; margin-top: 16px;">请使用另一设备的 Echo Trails 扫描此二维码</p>
      </div>
    </van-popup>
  </div>
</template>
<style scoped>
.set-view-container {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-bottom: 40px;
  box-sizing: border-box;
}

.mode-select :deep(.van-popup) {
  padding-top: 0 !important;
}

.btn-wrapper {
  margin: 16px;
}
</style>
