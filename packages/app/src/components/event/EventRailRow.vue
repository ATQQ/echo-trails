<template>
  <div
    class="d-row"
    :class="{ 'is-active': active }"
    role="button"
    tabindex="0"
    :data-event-id="event.id"
    :aria-label="`${event.name}，记录一次`"
    @click="emit('record')"
    @keydown.enter.prevent="emit('record')"
    @keydown.space.prevent="emit('record')"
  >
    <span class="d-row__emoji" aria-hidden="true">{{ event.emoji || '📌' }}</span>
    <div class="d-row__main">
      <div class="d-row__name">{{ event.name }}</div>
      <div class="d-row__meta">今天 {{ todayCount }} 次</div>
    </div>
    <span v-if="event.unit" class="d-row__unit">{{ event.unit }}</span>
    <button
      type="button"
      class="d-row__menu"
      :aria-label="`${event.name} 更多操作`"
      @click.stop="emit('menu')"
    >
      <van-icon name="ellipsis" size="18" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { EventItem } from '@/service/event';

withDefaults(defineProps<{
  event: EventItem;
  todayCount?: number;
  active?: boolean;
}>(), {
  todayCount: 0,
  active: false,
});

const emit = defineEmits<{ record: []; menu: [] }>();
</script>
