<template>
  <div class="event-view page-container">
    <van-nav-bar title="事件记录" left-arrow @click-left="router.back()" fixed placeholder class="event-nav">
      <template #right>
        <span class="nav-records" @click="goRecords">
          <van-icon name="bar-chart-o" size="18" />
          记录
        </span>
      </template>
    </van-nav-bar>

    <!-- 家人切换 -->
    <div class="family-select-wrapper">
      <FamilySelector v-model="currentFamilyId" />
    </div>

    <div class="content">
      <!-- 今日概览 -->
      <div class="today-card">
        <div class="today-left">
          <div class="today-label">今天 · {{ currentFamilyName }}</div>
          <div class="today-count">
            <span class="num">{{ todayRecords.length }}</span>
            <span class="unit">次记录</span>
          </div>
        </div>
        <div class="today-right">
          <van-icon name="records-o" size="40" color="#ffffff" />
        </div>
      </div>

      <!-- 事件按钮网格 -->
      <div v-if="loading" class="grid-loading">
        <van-skeleton title :row="3" />
      </div>
      <div v-else-if="visibleEvents.length === 0" class="grid-empty">
        <van-empty description="还没有事件，点右下角 + 添加一个吧" />
      </div>
      <div v-else class="event-grid">
        <div
          v-for="e in visibleEvents"
          :key="e.id"
          class="event-card"
          :class="{ pulsing: pulseId === e.id }"
          @click="quickRecord(e)"
          @touchstart.passive="onCardTouchStart(e)"
          @touchend="onCardTouchEnd"
          @touchcancel="onCardTouchEnd"
          @contextmenu.prevent="openManage(e)"
        >
          <span class="event-emoji">{{ e.emoji || '📌' }}</span>
          <div class="event-name">{{ e.name }}</div>
          <div class="event-meta">
            <span v-if="todayCountOf(e) > 0" class="event-today">今日 {{ todayCountOf(e) }}</span>
          </div>
        </div>
      </div>
    </div>

    <AddButton v-show="!showForm" icon="plus" @click="openAdd" />

    <!-- 新增/编辑事件弹窗 -->
    <van-popup v-model:show="showForm" position="bottom" round class="safe-padding-top event-form-popup">
      <div class="form-container">
        <div class="form-title">{{ editing ? '编辑事件' : '添加事件' }}</div>
        <van-form @submit="handleSubmit">
          <van-cell-group inset>
            <van-field name="emoji" label="图标">
              <template #input>
                <div class="emoji-picker">
                  <div class="emoji-input-row">
                    <span class="emoji-preview">{{ form.emoji || '❓' }}</span>
                    <input
                      v-model="form.emoji"
                      class="emoji-input"
                      placeholder="输入 emoji 或点选下方"
                      maxlength="6"
                      @input="onEmojiInput"
                    />
                  </div>
                  <div class="emoji-grid">
                    <span
                      v-for="em in commonEmojis"
                      :key="em"
                      class="emoji-option"
                      :class="{ active: form.emoji === em }"
                      @click="form.emoji = em"
                    >{{ em }}</span>
                  </div>
                </div>
              </template>
            </van-field>
            <van-field v-model="form.name" label="名称" placeholder="如：喝水、跑步、冥想" required
              :rules="[{ required: true, message: '请输入名称' }]" />
          </van-cell-group>
          <div class="form-actions">
            <van-button v-if="editing" block plain type="danger" @click="handleDeleteEvent">删除</van-button>
            <van-button block plain type="default" @click="closeForm">取消</van-button>
            <van-button block plain type="primary" native-type="submit">保存</van-button>
          </div>
        </van-form>
      </div>
    </van-popup>

    <!-- 事件管理操作 -->
    <van-action-sheet
      v-model:show="showManage"
      :actions="manageActions"
      cancel-text="取消"
      :description="manageEvent ? `「${manageEvent.emoji || '📌'} ${manageEvent.name}」` : ''"
      @select="onManageSelect"
      @closed="suppressClick = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { useLocalStorage } from '@vueuse/core';
import AddButton from '@/components/AddButton/AddButton.vue';
import FamilySelector from '@/components/FamilySelector/FamilySelector.vue';
import { useFamilyStore } from '@/stores/family';
import { preventBack } from '@/lib/router';
import dayjs from 'dayjs';
import {
  fetchEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchEventRecords,
  createEventRecord,
  type EventItem,
  type EventRecordItem,
} from '@/service/event';

defineOptions({ name: 'EventView' });

const router = useRouter();
const familyStore = useFamilyStore();

const commonEmojis = [
  '💧', '🏃', '📖', '🧘', '💪', '🥗', '😴', '☀️', '🚭', '💊',
  '🧠', '🎯', '🍎', '🚶', '✍️', '🧹', '🎵', '📱', '💰', '❤️',
];

const loading = ref(true);
const events = ref<EventItem[]>([]);
const todayRecords = ref<EventRecordItem[]>([]);
const pulseId = ref('');
const recording = ref(false);
const currentFamilyId = useLocalStorage('event_current_family', 'default');

const currentFamilyName = computed(() => {
  const found = familyStore.familyList.find((f) => f.familyId === currentFamilyId.value);
  return found?.name || currentFamilyId.value;
});

// 表单
const showForm = ref(false);
const editing = ref<EventItem | null>(null);
const form = ref({ name: '', emoji: '' });

// 管理操作
const showManage = ref(false);
const manageEvent = ref<EventItem | null>(null);
const manageActions = [
  { name: '编辑', value: 'edit' },
  { name: '删除', value: 'delete', color: '#ee0a24' },
];

// 长按管理事件
let pressTimer: ReturnType<typeof setTimeout> | null = null;
const pressedEvent = ref<EventItem | null>(null);
let suppressClick = false;
const onCardTouchStart = (e: EventItem) => {
  pressedEvent.value = e;
  pressTimer = setTimeout(() => {
    if (pressedEvent.value) {
      suppressClick = true;
      openManage(pressedEvent.value);
    }
  }, 600);
};
const onCardTouchEnd = () => {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  pressedEvent.value = null;
};

preventBack(showForm);
preventBack(showManage);

const today = () => dayjs().format('YYYY-MM-DD');

const loadAll = async () => {
  loading.value = true;
  try {
    const familyId = currentFamilyId.value;
    const [e, r] = await Promise.all([
      fetchEvents(familyId),
      fetchEventRecords(familyId, { startDate: today(), endDate: today() }),
    ]);
    events.value = e;
    todayRecords.value = r;
  } catch (err) {
    console.error('Failed to load events', err);
  } finally {
    loading.value = false;
  }
};

const visibleEvents = computed(() => events.value);

const todayCountOf = (e: EventItem) => todayRecords.value.filter((r) => r.eventId === e.id).length;

const quickRecord = async (e: EventItem) => {
  if (recording.value) return;
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  recording.value = true;
  try {
    await createEventRecord({
      familyId: currentFamilyId.value,
      eventId: e.id,
      occurredAt: Date.now(),
    });
    const created = await fetchEventRecords(currentFamilyId.value, { startDate: today(), endDate: today() });
    todayRecords.value = created;
    pulseId.value = e.id;
    setTimeout(() => { pulseId.value = ''; }, 600);
    showToast({
      message: `已记录「${e.emoji || '📌'} ${e.name}」`,
      type: 'success',
      duration: 1200,
    });
  } catch (err) {
    console.error('Failed to record event', err);
  } finally {
    recording.value = false;
  }
};

const onEmojiInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  // 只保留前两个 emoji 字符，避免粘贴多个
  if (val && [...val].length > 2) {
    form.value.emoji = [...val].slice(0, 2).join('');
  }
};

const openAdd = () => {
  editing.value = null;
  form.value = { name: '', emoji: '' };
  showForm.value = true;
};

const openEdit = (e: EventItem) => {
  editing.value = e;
  form.value = { name: e.name, emoji: e.emoji || '' };
  showForm.value = true;
};

const closeForm = () => {
  showForm.value = false;
  editing.value = null;
};

const handleSubmit = async () => {
  try {
    if (editing.value) {
      await updateEvent({ id: editing.value.id, ...form.value });
      showToast('已保存');
    } else {
      await createEvent(currentFamilyId.value, form.value);
      showToast('已添加');
    }
    closeForm();
    await loadAll();
  } catch (err) {
    console.error('Failed to save event', err);
  }
};

const handleDeleteEvent = async () => {
  if (!editing.value) return;
  const target = editing.value;
  showConfirmDialog({
    title: '删除事件',
    message: `确定删除「${target.name}」吗？历史记录仍将保留。`,
  }).then(async () => {
    try {
      await deleteEvent(target.id);
      showToast('已删除');
      closeForm();
      await loadAll();
    } catch (err) {
      console.error('Failed to delete event', err);
    }
  }).catch(() => {});
};

const openManage = (e: EventItem) => {
  manageEvent.value = e;
  showManage.value = true;
};

const onManageSelect = (action: any) => {
  showManage.value = false;
  if (!manageEvent.value) return;
  if (action.value === 'edit') {
    openEdit(manageEvent.value);
  } else if (action.value === 'delete') {
    const target = manageEvent.value;
    showConfirmDialog({
      title: '删除事件',
      message: `确定删除「${target.name}」吗？历史记录仍将保留。`,
    }).then(async () => {
      try {
        await deleteEvent(target.id);
        showToast('已删除');
        await loadAll();
      } catch (err) {
        console.error('Failed to delete event', err);
      }
    }).catch(() => {});
  }
  manageEvent.value = null;
};

const goRecords = () => {
  router.push('/events/records');
};

// 家人切换时重新加载
watch(currentFamilyId, () => {
  loadAll();
});

onMounted(async () => {
  if (!familyStore.familyList.length) {
    await familyStore.fetchFamilyList();
  }
  loadAll();
});
</script>

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.event-view {
  min-height: 100vh;
  background-color: #f7f8fa;

  .van-nav-bar__placeholder > :deep(.van-nav-bar--fixed) {
    padding-top: var(--safe-area-top);
  }
}

.family-select-wrapper {
  margin-top: 4px;
}

.nav-records {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #1989fa;
  cursor: pointer;
}

.content {
  padding: 16px 16px 96px;
}

.today-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1989fa 0%, #54a8ff 100%);
  color: #fff;
  box-shadow: 0 8px 20px rgba(25, 137, 250, 0.25);
  margin-bottom: 16px;

  .today-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .today-label {
    font-size: 13px;
    opacity: 0.85;
  }

  .today-count {
    display: flex;
    align-items: baseline;
    gap: 6px;

    .num {
      font-size: 34px;
      font-weight: 700;
      line-height: 1;
    }

    .unit {
      font-size: 14px;
      opacity: 0.9;
    }
  }
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  @include desktop {
    grid-template-columns: repeat(5, 1fr);
  }
}

.event-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 1px solid #eef0f3;
  border-radius: 14px;
  padding: 18px 10px 12px;
  background: #fff;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.12s ease, box-shadow 0.12s ease;

  &:active {
    transform: scale(0.94);
  }

  &.pulsing {
    animation: card-pulse 0.6s ease;
  }

  .event-emoji {
    font-size: 40px;
    line-height: 1;
  }

  .event-name {
    font-size: 14px;
    font-weight: 600;
    color: #323233;
    word-break: break-all;
    text-align: center;
    line-height: 1.3;
  }

  .event-meta {
    display: flex;
    align-items: center;
    justify-content: center;

    .event-today {
      font-size: 11px;
      color: #1989fa;
      background: rgba(25, 137, 250, 0.1);
      padding: 2px 8px;
      border-radius: 999px;
    }
  }
}

@keyframes card-pulse {
  0% { transform: scale(1); }
  40% { transform: scale(0.9); box-shadow: 0 0 0 6px rgba(25, 137, 250, 0.15); }
  100% { transform: scale(1); }
}

.grid-loading {
  padding: 8px;
}

.grid-empty {
  padding-top: 40px;
}

.form-container {
  padding: 16px 16px calc(16px + var(--safe-area-bottom));
}

.form-title {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 14px;
}

.emoji-picker {
  width: 100%;

  .emoji-input-row {
    display: flex;
    align-items: center;
    gap: 10px;

    .emoji-preview {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      border: 1px dashed #dcdee0;
      border-radius: 8px;
      background: #f7f8fa;
    }

    .emoji-input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      font-size: 15px;
      color: #323233;
      background: transparent;
      padding: 6px 0;
    }
  }

  .emoji-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;

    .emoji-option {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;

      &.active {
        border-color: #1989fa;
        background: rgba(25, 137, 250, 0.08);
      }
    }
  }
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
}
</style>
