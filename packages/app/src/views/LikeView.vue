<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
import { showConfirmDialog } from 'vant';
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const logoutCount = ref(0);
watch(logoutCount, () => {
  if (logoutCount.value > 3) {
    showConfirmDialog({
      title: '确认退出',
      message: '确定要退出登录吗？',
    }).then(() => {
      window.localStorage.removeItem('token');
      router.replace({
        name: 'login'
      })
    }).catch(() => {
      logoutCount.value = 0;
    })
  }
});
</script>

<template>
  <PhotoList likedMode>
    <template #header>
      <h1 @click="logoutCount++">我喜欢</h1>
    </template>
  </PhotoList>
</template>
<style scoped lang="scss">
h1 {
  font-weight: lighter;
  margin-bottom: 0;
  padding-left: 10px;
}
</style>
