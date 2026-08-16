<template>
  <div v-show="visible" class="drive-select-bar">
    <span class="count">已选 {{ count }} 项</span>
    <div class="actions">
      <button type="button" class="action" :disabled="!count" @click="$emit('move')">移动</button>
      <button type="button" class="action" :disabled="shareDisabled" @click="$emit('share')">分享</button>
      <button type="button" class="action is-danger" :disabled="!count" @click="$emit('delete')">删除</button>
      <button type="button" class="action" @click="$emit('cancel')">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import './style.css'

withDefaults(defineProps<{
  visible?: boolean
  count?: number
  shareDisabled?: boolean
}>(), {
  visible: false,
  count: 0,
  shareDisabled: true,
})

defineEmits<{
  move: []
  share: []
  delete: []
  cancel: []
}>()
</script>
