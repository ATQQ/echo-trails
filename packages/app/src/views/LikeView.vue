<script setup lang="ts">
import PageTitle from '@/components/PageTitle.vue';
import PhotoList from '@/components/PhotoList.vue';
</script>

<template>
  <PhotoList likedMode>
    <template #header>
      <PageTitle title="我喜欢" exit likedMode/>
    </template>
  </PhotoList>
</template>
