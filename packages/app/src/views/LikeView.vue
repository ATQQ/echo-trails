<script setup lang="ts">
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import PhotoList from '@/components/PhotoList/PhotoList.vue';
</script>

<template>
  <PhotoList likedMode>
    <template #header>
      <PageTitle title="我喜欢" likedMode/>
    </template>
  </PhotoList>
</template>
