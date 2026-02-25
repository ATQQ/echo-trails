<script setup lang="ts">
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import PhotoList from '@/components/PhotoList/PhotoList.vue';
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <PhotoList likedMode>
    <template #header>
      <PageTitle title="我喜欢" likedMode>
        <template #action>
          <van-icon name="arrow-left" size="26" @click="router.back()" style="margin-right: 16px;"/>
        </template>
      </PageTitle>
    </template>
  </PhotoList>
</template>
