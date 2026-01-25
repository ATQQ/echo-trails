<script setup lang="ts">
import PhotoList from '@/components/PhotoList/PhotoList.vue';
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import { useRouter } from 'vue-router';
import { ref } from 'vue';

// 连续点击5次标题，跳转到删除页面
const clickCount = ref(0)
const router = useRouter()
const handleClick = () => {
  clickCount.value++
  if (clickCount.value === 3) {
    // 跳转到删除页面
    router.push({ name: 'delete' })
    // 清空点击次数
    clickCount.value = 0
  }

  // 一段时间后清空点击次数
  setTimeout(() => {
    clickCount.value = 0
  }, 3000)
}
</script>

<template>
  <PhotoList>
    <template #header>
      <PageTitle title="照片" @pressTitle="handleClick" />
    </template>
  </PhotoList>
</template>
