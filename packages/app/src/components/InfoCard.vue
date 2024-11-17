<template>
  <van-cell-group inset>
    <van-cell v-for="item in data" :key="item.title" :title="item.title" :value="item.value" :label="item.label" />
  </van-cell-group>
</template>

<script lang="ts" setup>
const { data } = defineProps<{
  data: InfoItem[]
}>()
</script>
