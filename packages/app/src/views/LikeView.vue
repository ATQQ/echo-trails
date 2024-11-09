<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
</script>

<template>
  <PhotoList likedMode>
    <template #header>
      <h1>我喜欢</h1>
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
