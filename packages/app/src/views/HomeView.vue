<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
import PageTitle from '@/components/PageTitle.vue';

</script>

<template>
  <PhotoList>
    <template #header>
      <PageTitle title="照片" />
    </template>
  </PhotoList>
</template>
