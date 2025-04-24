<script setup lang="ts">
import PageTitle from '@/components/PageTitle.vue';
import PhotoList from '@/components/PhotoList.vue';
import { isTauri } from '@/constants';
</script>

<template>
  <PhotoList likedMode>
    <template #header>
      <PageTitle title="我喜欢" :exit="!isTauri" likedMode :set-mode="isTauri"/>
    </template>
  </PhotoList>
</template>
