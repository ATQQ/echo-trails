<template>
  <header class="page-header safe-padding-top">
    <h1 @click="handlePressTitle">{{ title }}</h1>
    <div class="actions">
      <van-icon name="setting-o" v-if="setMode" size="26" @click="handleGoManagePage" />
      <van-icon name="more-o" v-if="info" size="26" @click="handleShowInfoPanel" />
      <van-icon name="close" v-if="exit" size="26" @click="handleExit" />
    </div>
  </header>
  <van-popup v-model:show="showInfoPanel" position="right"
    :style="{ width: '100%', height: '100%', background: '#eff2f5', padding: '20px 0' }">
    <div class="safe-padding-top" style="width: 100%"></div>
    <!-- 基本信息卡片展示 -->
    <InfoCard :data="listData" />
    <!-- 关闭按钮 -->
    <div class="operation card-margin">
      <van-button @click="showInfoPanel = false" plain block round size="small">关闭</van-button>
    </div> 。
  </van-popup>
</template>

<script lang="ts" setup>
import { showConfirmDialog } from 'vant';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { preventBack } from '@/lib/router'
import InfoCard from './InfoCard.vue';
import { getPhotoListInfo } from '@/service';
const { title = '', exit = false, info = true, likedMode = false, setMode = false, type = '' } = defineProps<{
  title: string
  exit?: boolean
  info?: boolean
  likedMode?: boolean
  setMode?: boolean
  type?: string
}>()

const router = useRouter();

const handleGoManagePage = () => {
  router.push({
    name: 'manage'
  })
}
// 退出
const handleExit = () => {
  showConfirmDialog({
    title: '确认退出',
    message: '确定要退出登录吗？',
  }).then(() => {
    window.localStorage.removeItem('token');
    router.replace({
      name: 'login'
    })
  }).catch(() => {

  })

}
const emit = defineEmits<{
  (e: 'pressTitle'): void
}>()

const handlePressTitle = () => {
  emit('pressTitle')
}

// 信息展示
const showInfoPanel = ref(false)
const listData = ref<InfoItem[]>([])
const handleShowInfoPanel = async () => {
  // 调接口拉数据
  listData.value = await getPhotoListInfo({
    likedMode,
    type
  })
  showInfoPanel.value = true
}
preventBack(showInfoPanel)

</script>

<style lang="scss" scoped>
.page-header {
  margin-bottom: 0;
  padding-left: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h1 {
    font-weight: 300;
    margin: 10px 0;
  }

  .actions .van-icon {
    margin-right: 16px;
  }
}

.card-margin {
  margin-top: 20px;
}

.operation {
  padding: var(--van-cell-group-inset-padding);
}
</style>
