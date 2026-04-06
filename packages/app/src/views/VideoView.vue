<script setup lang="ts">
import VideoList from '@/components/VideoList/VideoList.vue';
import PageTitle from '@/components/PageTitle/PageTitle.vue';

defineOptions({
  name: 'VideoView'
});
</script>

<template>
  <VideoList>
    <template #header>
      <PageTitle title="视频" type="video" />
    </template>
  </VideoList>
</template>
