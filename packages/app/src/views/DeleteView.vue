<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
import PageTitle from '@/components/PageTitle.vue';

</script>

<template>
  <PhotoList :is-delete="true">
    <template #header>
      <PageTitle title="回收站" />
    </template>
  </PhotoList>
</template>
