<script setup lang="ts">
import VideoList from '@/components/VideoList.vue';
import PageTitle from '@/components/PageTitle.vue';
</script>

<template>
  <VideoList>
    <template #header>
      <PageTitle title="视频" type="video" />
    </template>
  </VideoList>
</template>
