<template>
  <div
    class="ev-card"
    :class="{ 'is-pulse': pulse }"
    role="button"
    tabindex="0"
    :data-event-id="event.id"
    :aria-label="`${event.name}，记录一次`"
    @click="emit('record')"
    @keydown.enter.prevent="emit('record')"
    @keydown.space.prevent="emit('record')"
  >
    <button
      type="button"
      class="ev-card__menu"
      :aria-label="`${event.name} 更多操作`"
      @click.stop="emit('menu')"
    >
      <van-icon name="ellipsis" />
    </button>
    <span class="ev-card__emoji" aria-hidden="true">{{ event.emoji || '📌' }}</span>
    <span class="ev-card__name">{{ event.name }}</span>
    <span class="ev-card__meta">今天 {{ todayCount }} 次</span>
  </div>
</template>

<script setup lang="ts">
import type { EventItem } from '@/service/event';

withDefaults(defineProps<{
  event: EventItem;
  todayCount?: number;
  pulse?: boolean;
}>(), {
  todayCount: 0,
  pulse: false,
});

const emit = defineEmits<{ record: []; menu: [] }>();
</script>
