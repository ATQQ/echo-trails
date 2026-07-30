<script setup lang="ts">
import AudioList from '@/components/AudioList/AudioList.vue';
import PageTitle from '@/components/PageTitle/PageTitle.vue';

defineOptions({
  name: 'AudioView'
});
</script>

<template>
  <AudioList>
    <template #header>
      <PageTitle title="音频" type="audio" />
    </template>
  </AudioList>
</template>
