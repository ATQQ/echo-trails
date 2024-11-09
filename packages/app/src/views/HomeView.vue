<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
</script>

<template>
  <PhotoList>
    <template #header>
      <h1>照片</h1>
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
