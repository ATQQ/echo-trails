<script setup lang="ts">
import PageTitle from '@/components/PageTitle.vue';
import { getConfig, refreshService, saveConfig, validConfig } from '@/lib/configStorage';
import { defaultOrigin } from '@/lib/request';
import router from '@/router';
import { showConfirmDialog, showNotify } from 'vant';
import { computed, onMounted, ref } from 'vue';

const mode = ref('');
const modeValue = ref<string[]>([]);
const selectMode = computed(() => modeValue.value[0])
const showModeSelect = ref(false);
const columns = [
  { text: 'Server', value: 'server' },
  { text: 'Native', value: 'native' },
];

const onModeChanged = ({ selectedValues, selectedOptions }: { selectedValues: string[], selectedOptions: any[] }) => {
  mode.value = selectedOptions[0]?.text;
  modeValue.value = selectedValues;
  showModeSelect.value = false;
};

const serverUrl = ref('')
const token = ref('');

const onSubmit = async () => {
  const config = {
    mode: selectMode.value,
    serverUrl: serverUrl.value,
    token: token.value
  }
  try {
    // 校验数据合理性
    await validConfig(config)

    // 存配置数据
    await saveConfig(config)
    // 更新服务
    await refreshService(config)
    // 回到首页
    router.replace({
      name: 'album'
    })
  } catch (err: any) {
    showNotify({ type: 'danger', message: err?.message });
  }

};

const showExit = ref(false)

onMounted(async () => {
  // 取数据
  const cfg = await getConfig()

  // 格式化后回填
  mode.value = cfg.mode
  modeValue.value = [cfg.mode]
  serverUrl.value = cfg.serverUrl
  token.value = cfg.token || ''
  showExit.value = !!cfg.token
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
  localStorage.clear()

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
  setTimeout(()=>{
    // 刷新页面
    window.location.reload()
  },2000)
}
</script>

<template>
  <PageTitle title="设置" :info="false" />
  <van-form @submit="onSubmit">
    <van-cell-group inset>
      <!-- 模式选择 -->
      <van-field v-model="mode" is-link readonly name="mode" label="模式" placeholder="点击切换模式"
        @click="showModeSelect = true" />

      <template v-if="selectMode === 'server'">
        <van-field v-model="serverUrl" name="serverUrl" label="服务地址" placeholder="服务地址"
          :rules="[{ required: true, message: '请填写服务地址' }]" />
        <van-field v-model="token" type="password" name="token" label="令牌" placeholder="验证身份" s
          :rules="[{ required: true, message: '请填写令牌' }]" />
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
</template>
<style scoped>
.mode-select :deep(.van-popup) {
  padding-top: 0 !important;
}

.btn-wrapper {
  margin: 16px;
}
</style>