<template>
  <van-image v-if="src" @click="emit('click')" fit="cover" position="center" width="100%" height="100%" lazy-load
    :src="src">
    <slot />
    <template v-slot:loading>
      <van-loading type="spinner" size="20" />
    </template>
  </van-image>
</template>

<script lang="ts" setup>
import { defineProps } from 'vue'

const { src } = defineProps<{
  src: string
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()
</script>
