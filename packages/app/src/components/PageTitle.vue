<template>
  <header class="page-header">
    <h1>{{ title }}</h1>
    <div class="actions">
      <van-icon name="more-o" v-if="info" size="26" @click="handleShowInfoPanel" />
      <van-icon name="close" v-if="exit" size="26" @click="handleExit" />
    </div>
  </header>
  <van-popup v-model:show="showInfoPanel" position="right" :style="{ width: '100%', height: '100%' }" />
</template>

<script lang="ts" setup>
import { showConfirmDialog } from 'vant';
import { ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
const { title = '', exit = false, info = true } = defineProps<{
  title: string
  exit?: boolean
  info?: boolean
}>()

const router = useRouter();

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

// 信息展示
const showInfoPanel = ref(false)
const handleShowInfoPanel = () => {
  showInfoPanel.value = true
}
onBeforeRouteLeave((to, from, next) => {
  if (showInfoPanel.value) {
    showInfoPanel.value = false
    next(false)
    return false
  }
  next()
})
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
</style>
