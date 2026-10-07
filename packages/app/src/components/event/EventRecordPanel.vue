<template>
  <van-popup
    :show="show"
    position="center"
    :overlay="variant === 'mobile'"
    :close-on-click-overlay="variant === 'mobile'"
    overlay-class="ev-overlay"
    class="ev-scope"
    :class="variant === 'desktop' ? 'ev-popup-dpanel' : 'ev-popup-dialog'"
    @update:show="onPopupShow"
    @click-overlay="handleClose"
  >
    <section
      v-if="event"
      :class="variant === 'desktop' ? 'd-panel' : 'dialog dialog--record'"
      role="dialog"
      aria-modal="true"
      :aria-label="`记录 ${event.name}`"
      @pointerdown="resetIdle"
      @keydown="resetIdle"
      @input="resetIdle"
      @wheel.passive="resetIdle"
    >
      <div class="panel-progress" aria-hidden="true">
        <div :key="idleNonce" class="sheet__idle is-running" />
      </div>

      <div v-if="variant === 'desktop'" class="d-panel__head">
        <span class="badge-success badge-success--sm">
          <van-icon name="success" size="14" />
        </span>
        <div>
          <div class="d-panel__title">已记录</div>
          <div class="sheet__sub">
            {{ event.emoji || '📌' }} {{ event.name }} · 今天第 {{ todayCount }} 次
          </div>
        </div>
        <button type="button" class="icon-btn" aria-label="关闭" @click="handleClose">
          <van-icon name="cross" size="18" />
        </button>
      </div>

      <template v-else>
        <div class="sheet__title">
          <span class="badge-success">
            <van-icon name="success" size="16" />
          </span>
          已记录
          <button
            type="button"
            class="icon-btn dialog-close"
            aria-label="关闭"
            @click="handleClose"
          >
            <van-icon name="cross" size="16" />
          </button>
        </div>
        <div class="sheet__sub">
          {{ event.emoji || '📌' }} {{ event.name }} · 今天第 {{ todayCount }} 次
        </div>
      </template>

      <div v-if="families.length > 1" class="family-tags">
        <span class="family-tags__label">记到</span>
        <div class="family-tags__list">
          <button
            v-for="item in families"
            :key="item.id"
            type="button"
            class="chip chip--family"
            :class="{ 'is-active': item.id === familyId }"
            :aria-pressed="item.id === familyId"
            :disabled="switching"
            @click="switchFamily(item.id)"
          >
            <span class="family-avatar" aria-hidden="true">{{ item.name.slice(0, 1) }}</span>
            {{ item.name }}
          </button>
        </div>
      </div>

      <template v-if="hasUnit">
        <div class="amount">
          <button
            type="button"
            class="amount__step"
            :aria-label="`减少 ${stepSize}${event.unit}`"
            @click="step(-1)"
          >
            <van-icon name="minus" size="18" />
          </button>
          <div class="amount__field">
            <input
              v-model="amountInput"
              class="amount__input"
              type="number"
              inputmode="decimal"
              aria-label="本次数量"
              @change="patchSoon"
            />
            <span class="amount__unit">{{ event.unit }}</span>
          </div>
          <button
            type="button"
            class="amount__step"
            :aria-label="`增加 ${stepSize}${event.unit}`"
            @click="step(1)"
          >
            <van-icon name="plus" size="18" />
          </button>
        </div>
        <div class="quick">
          <button
            v-for="value in recentAmounts"
            :key="value"
            type="button"
            class="chip"
            @click="pickAmount(value)"
          >
            {{ formatAmount(value, event.unit) }}
          </button>
        </div>
      </template>

      <div v-else class="plain-amount">
        <div class="plain-amount__text">未设置单位，本次记为 1 次</div>
        <button type="button" class="note-toggle note-toggle--flush" @click="emit('edit-event')">
          <van-icon name="plus" size="16" />
          为该事件设置单位
        </button>
      </div>

      <button type="button" class="note-toggle" @click="toggleNote">
        <van-icon name="records-o" size="16" />
        {{ noteOpen ? '收起备注' : '加备注（可选）' }}
      </button>
      <textarea
        v-if="noteOpen"
        ref="noteRef"
        v-model="note"
        class="note-input"
        placeholder="例如：饭后、陪家人一起"
        @input="patchSoon"
      />

      <div class="sheet__actions">
        <button
          type="button"
          class="btn btn--ghost btn--block"
          :disabled="switching"
          @click="emit('undo')"
        >
          {{ variant === 'desktop' ? '撤销' : '撤销这次记录' }}
        </button>
        <button
          type="button"
          class="btn btn--primary btn--block"
          :disabled="switching"
          @click="handleClose"
        >
          完成
        </button>
      </div>
    </section>
  </van-popup>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { formatAmount } from '@/composables/useEventStats';
import type { EventItem, EventRecordItem } from '@/service/event';

const props = withDefaults(defineProps<{
  show: boolean;
  event: EventItem | null;
  record: EventRecordItem | null;
  todayCount?: number;
  recentAmounts?: number[];
  variant?: 'mobile' | 'desktop';
  families?: { id: string; name: string }[];
  familyId?: string;
  switching?: boolean;
}>(), {
  todayCount: 0,
  recentAmounts: () => [],
  variant: 'mobile',
  families: () => [],
  familyId: '',
  switching: false,
});

const emit = defineEmits<{
  close: [];
  undo: [];
  patch: [payload: { amount: number | null; note: string }];
  'edit-event': [];
  'switch-family': [payload: { familyId: string; amount: number | null; note: string }];
}>();

const IDLE_MS = 5000;

const amountInput = ref<string>('');
const note = ref('');
const noteOpen = ref(false);
const noteRef = ref<HTMLTextAreaElement | null>(null);
const idleNonce = ref(0);

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let patchTimer: ReturnType<typeof setTimeout> | null = null;

const hasUnit = computed(() => !!props.event?.unit);
const stepSize = computed(() => {
  const def = props.event?.defaultAmount;
  return def && def > 0 ? def : 1;
});

const stopIdle = () => {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
};

function resetIdle() {
  stopIdle();
  if (!props.show || props.switching) return;
  idleNonce.value += 1;
  idleTimer = setTimeout(() => handleClose(), IDLE_MS);
}

const parseAmount = (): number | null => {
  const raw = String(amountInput.value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const currentPatch = () => ({ amount: parseAmount(), note: note.value });

function flushPatch() {
  if (patchTimer) {
    clearTimeout(patchTimer);
    patchTimer = null;
  }
  if (!props.record) return;
  emit('patch', currentPatch());
}

function patchSoon() {
  resetIdle();
  if (patchTimer) clearTimeout(patchTimer);
  patchTimer = setTimeout(() => {
    patchTimer = null;
    if (props.record) emit('patch', currentPatch());
  }, 400);
}

function switchFamily(familyId: string) {
  if (props.switching || familyId === props.familyId) return;
  if (patchTimer) {
    clearTimeout(patchTimer);
    patchTimer = null;
  }
  stopIdle();
  emit('switch-family', { familyId, ...currentPatch() });
}

function step(delta: number) {
  const base = Number(amountInput.value);
  const current = Number.isFinite(base) ? base : 0;
  const next = Math.max(0, Math.round((current + delta * stepSize.value) * 100) / 100);
  amountInput.value = String(next);
  patchSoon();
}

function pickAmount(value: number) {
  amountInput.value = String(value);
  patchSoon();
}

async function toggleNote() {
  noteOpen.value = !noteOpen.value;
  resetIdle();
  if (!noteOpen.value) {
    patchSoon();
    return;
  }
  await nextTick();
  noteRef.value?.focus();
}

function handleClose() {
  if (props.switching) return;
  flushPatch();
  stopIdle();
  emit('close');
}

function onPopupShow(value: boolean) {
  if (!value) handleClose();
}

// 每次打开（或切换到另一条记录）都重置本地编辑态与空闲计时
watch(
  () => [props.show, props.record?.id] as const,
  ([show]) => {
    stopIdle();
    if (patchTimer) {
      clearTimeout(patchTimer);
      patchTimer = null;
    }
    if (!show) return;
    amountInput.value = props.record?.amount == null ? '' : String(props.record.amount);
    note.value = props.record?.note || '';
    noteOpen.value = !!props.record?.note;
    resetIdle();
  },
  { immediate: true },
);

watch(
  () => props.switching,
  (switching) => {
    stopIdle();
    if (switching) {
      if (patchTimer) {
        clearTimeout(patchTimer);
        patchTimer = null;
      }
      return;
    }
    if (props.show) resetIdle();
  },
);

onBeforeUnmount(stopIdle);
</script>
