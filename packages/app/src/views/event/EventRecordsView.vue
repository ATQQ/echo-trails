<template>
  <div class="event-records-view page-container">
    <van-nav-bar title="事件记录" left-arrow @click-left="router.back()" fixed placeholder class="records-nav" />

    <!-- 家人切换 -->
    <div class="family-select-wrapper">
      <FamilySelector v-model="currentFamilyId" />
    </div>

    <div class="content">
      <!-- 筛选面板 -->
      <div class="filter-panel">
        <div class="filter-row">
          <span class="filter-label">事件</span>
          <div class="chips-scroll">
            <span class="chip" :class="{ active: filterEventId === 'all' }" @click="filterEventId = 'all'">全部</span>
            <span
              v-for="e in events"
              :key="e.id"
              class="chip"
              :class="{ active: filterEventId === e.id }"
              @click="filterEventId = e.id"
            >{{ e.emoji || '📌' }} {{ e.name }}</span>
          </div>
        </div>
        <div class="filter-row">
          <span class="filter-label">时间</span>
          <div class="chips-scroll">
            <span v-for="r in rangePresets" :key="r.key" class="chip" :class="{ active: rangeKey === r.key }" @click="onRangePick(r.key)">{{ r.label }}</span>
          </div>
        </div>
      </div>

      <!-- 数据概览 -->
      <div class="stats-card">
        <div class="stat-item">
          <div class="stat-value">{{ totalCount }}</div>
          <div class="stat-label">总记录</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ dayCount }}</div>
          <div class="stat-label">记录天数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ avgPerDay }}</div>
          <div class="stat-label">日均次数</div>
        </div>
      </div>

      <van-skeleton v-if="loading && records.length === 0" title :row="4" style="margin-top: 16px" />

      <template v-else-if="records.length > 0">
        <!-- 每日频率图 -->
        <div class="chart-card">
          <div class="chart-title">
            <van-icon name="chart-trending-o" color="#1989fa" size="16" />
            每日发生频率
          </div>
          <div class="daily-chart" ref="dailyChartRef"></div>
        </div>

        <!-- 时间分布图 -->
        <div class="chart-card">
          <div class="chart-title">
            <van-icon name="clock-o" color="#1989fa" size="16" />
            发生时段分布
          </div>
          <div class="hour-chart">
            <div class="hour-bars">
              <div v-for="h in 24" :key="h - 1" class="hour-col">
                <span v-if="hourData.arr[h - 1] > 0" class="hour-value">{{ hourData.arr[h - 1] }}</span>
                <div
                  class="hour-bar"
                  :class="{ empty: hourData.arr[h - 1] === 0 }"
                  :style="{ height: `${(hourData.arr[h - 1] / hourData.max) * 100}%` }"
                  :title="`${h - 1}时：${hourData.arr[h - 1]}次`"
                ></div>
                <span v-if="(h - 1) % 3 === 0" class="hour-label">{{ h - 1 }}时</span>
                <span v-else class="hour-label placeholder">&nbsp;</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <van-empty v-else-if="!loading" description="当前筛选下暂无记录" />

      <!-- 记录列表（按天分组） -->
      <template v-if="records.length > 0">
        <div class="list-title">
          <van-icon name="records-o" color="#1989fa" size="16" />
          记录明细
        </div>
        <div v-for="group in groupedRecords" :key="group.date" class="day-group">
          <div class="day-header">
            <span class="day-title">{{ dayTitle(group.date) }}</span>
            <span class="day-count">{{ group.items.length }} 次</span>
          </div>
          <div class="day-list">
            <div
              v-for="r in group.items"
              :key="r.id"
              class="record-item"
              @click="openDetail(r)"
            >
              <span class="record-emoji">{{ r.emoji || '📌' }}</span>
              <div class="record-main">
                <div class="record-name">{{ r.eventName }}</div>
                <div v-if="r.note" class="record-note">{{ r.note }}</div>
              </div>
              <div class="record-time">{{ dayjs(r.occurredAt).format('HH:mm') }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 记录详情/删除 -->
    <van-popup v-model:show="showDetail" position="bottom" round class="safe-padding-bottom">
      <div class="detail-panel">
        <div class="detail-title">{{ detailRecord?.emoji || '📌' }} {{ detailRecord?.eventName }}</div>
        <van-cell-group inset>
          <van-cell title="发生时间" :value="detailRecord ? formatFullTime(detailRecord.occurredAt) : ''" />
          <van-cell v-if="detailRecord?.note" title="备注" :value="detailRecord.note" />
        </van-cell-group>
        <div class="detail-actions">
          <van-button block plain type="danger" @click="confirmDeleteRecord">删除该记录</van-button>
          <van-button block plain type="default" @click="showDetail = false">关闭</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 自定义日期范围 -->
    <van-calendar
      v-model:show="showCalendar"
      type="range"
      :min-date="calendarMin"
      :max-date="calendarMax"
      :allow-same-day="true"
      @confirm="onCalendarConfirm"
      @close="onCalendarClose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { useLocalStorage } from '@vueuse/core';
import { createChart, ColorType, HistogramSeries } from 'lightweight-charts';
import dayjs from 'dayjs';
import FamilySelector from '@/components/FamilySelector/FamilySelector.vue';
import { useFamilyStore } from '@/stores/family';
import { preventBack } from '@/lib/router';
import {
  fetchEvents,
  fetchEventRecords,
  deleteEventRecord,
  type EventItem,
  type EventRecordItem,
} from '@/service/event';

defineOptions({ name: 'EventRecordsView' });

const router = useRouter();
const familyStore = useFamilyStore();

const loading = ref(true);
const records = ref<EventRecordItem[]>([]);
const events = ref<EventItem[]>([]);
const currentFamilyId = useLocalStorage('event_current_family', 'default');

// 筛选状态
const filterEventId = ref('all');
const rangeKey = ref('7d');
const customRange = ref<[string, string] | null>(null);
const showCalendar = ref(false);
const calendarMin = new Date(2000, 0, 1);
const calendarMax = new Date();
const rangePresets = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: 'all', label: '全部' },
  { key: 'custom', label: '自定义' },
];

// 详情弹窗
const showDetail = ref(false);
const detailRecord = ref<EventRecordItem | null>(null);

preventBack(showDetail);
preventBack(showCalendar);

const today = () => dayjs().format('YYYY-MM-DD');

const dateRange = computed(() => {
  const t = today();
  switch (rangeKey.value) {
    case 'today':
      return { startDate: t, endDate: t };
    case '7d':
      return { startDate: dayjs().subtract(6, 'day').format('YYYY-MM-DD'), endDate: t };
    case '30d':
      return { startDate: dayjs().subtract(29, 'day').format('YYYY-MM-DD'), endDate: t };
    case 'custom':
      return customRange.value
        ? { startDate: customRange.value[0], endDate: customRange.value[1] }
        : null;
    default:
      return null;
  }
});

const onRangePick = (key: string) => {
  if (key === 'custom') {
    showCalendar.value = true;
    return;
  }
  rangeKey.value = key;
};

const onCalendarConfirm = (dates: Date[]) => {
  if (dates && dates.length === 2) {
    const [start, end] = dates;
    customRange.value = [dayjs(start).format('YYYY-MM-DD'), dayjs(end).format('YYYY-MM-DD')];
    rangeKey.value = 'custom';
  }
  showCalendar.value = false;
};

const onCalendarClose = () => {
  // 未确认日期就关闭时，回退到上一次的有效范围
  if (rangeKey.value === 'custom' && !customRange.value) {
    rangeKey.value = '30d';
  }
};

const loadEvents = async () => {
  try {
    events.value = await fetchEvents(currentFamilyId.value);
  } catch (err) {
    console.error('Failed to load events', err);
  }
};

const reload = async () => {
  loading.value = true;
  try {
    records.value = await fetchEventRecords(currentFamilyId.value, {
      eventId: filterEventId.value === 'all' ? undefined : filterEventId.value,
      startDate: dateRange.value?.startDate,
      endDate: dateRange.value?.endDate,
    });
  } catch (err) {
    console.error('Failed to fetch event records', err);
  } finally {
    loading.value = false;
  }
};

watch([filterEventId, rangeKey, customRange], reload);

watch(currentFamilyId, () => {
  filterEventId.value = 'all';
  loadEvents();
  reload();
});

onMounted(async () => {
  if (!familyStore.familyList.length) {
    await familyStore.fetchFamilyList();
  }
  await loadEvents();
  await reload();
});

// ==================== 统计 ====================

const totalCount = computed(() => records.value.length);
const dayCount = computed(() => new Set(records.value.map((r) => r.date)).size);
const avgPerDay = computed(() => {
  if (!dayCount.value) return '0';
  return (totalCount.value / dayCount.value).toFixed(1);
});

// ==================== 图表 ====================

const dailyChartRef = ref<HTMLElement | null>(null);
let dailyChart: any = null;
let dailySeries: any = null;
let resizeObserver: ResizeObserver | null = null;

const dailyData = computed(() => {
  const map = new Map<string, number>();
  for (const r of records.value) {
    map.set(r.date, (map.get(r.date) || 0) + 1);
  }
  // 范围 ≤ 120 天时补零，展示更真实的每日频率
  const range = dateRange.value;
  if (range && range.startDate && range.endDate) {
    const days = dayjs(range.endDate).diff(dayjs(range.startDate), 'day');
    if (days <= 120) {
      let d = dayjs(range.startDate);
      const end = dayjs(range.endDate);
      while (d.isBefore(end) || d.isSame(end, 'day')) {
        const key = d.format('YYYY-MM-DD');
        if (!map.has(key)) map.set(key, 0);
        d = d.add(1, 'day');
      }
    }
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, value]) => ({ time: date, value }));
});

const buildDailyChart = () => {
  if (!dailyChartRef.value) return;
  if (!dailyChart) {
    dailyChart = createChart(dailyChartRef.value, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#969799',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#f0f0f0' },
      },
      width: dailyChartRef.value.clientWidth,
      height: 180,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
      },
      localization: {
        dateFormat: 'yyyy-MM-dd',
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });
    dailySeries = dailyChart.addSeries(HistogramSeries, {
      color: '#1989fa',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    resizeObserver = new ResizeObserver(() => {
      if (dailyChart && dailyChartRef.value) {
        dailyChart.applyOptions({ width: dailyChartRef.value.clientWidth });
      }
    });
    resizeObserver.observe(dailyChartRef.value);
  }
  dailySeries.setData(dailyData.value);
  dailyChart.timeScale().fitContent();
};

watch([records, dailyData], () => {
  if (dailyChartRef.value) buildDailyChart();
}, { deep: true });

const hourData = computed(() => {
  const arr = new Array(24).fill(0) as number[];
  for (const r of records.value) {
    arr[dayjs(r.occurredAt).hour()] += 1;
  }
  const max = Math.max(...arr, 1);
  return { arr, max };
});

// ==================== 列表与删除 ====================

const groupedRecords = computed(() => {
  const map = new Map<string, EventRecordItem[]>();
  for (const r of records.value) {
    const list = map.get(r.date) || [];
    list.push(r);
    map.set(r.date, list);
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }));
});

const dayTitle = (date: string) => {
  const d = dayjs(date);
  const t = today();
  if (date === t) return '今天';
  if (date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return '昨天';
  return d.format('YYYY-MM-DD');
};

const formatFullTime = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss');

const openDetail = (r: EventRecordItem) => {
  detailRecord.value = r;
  showDetail.value = true;
};

const confirmDeleteRecord = () => {
  if (!detailRecord.value) return;
  const target = detailRecord.value;
  showConfirmDialog({
    title: '删除记录',
    message: `确定删除「${target.eventName}」这条记录吗？`,
  }).then(async () => {
    try {
      await deleteEventRecord(target.id);
      showToast('已删除');
      showDetail.value = false;
      await reload();
    } catch (err) {
      console.error('Failed to delete record', err);
    }
  }).catch(() => {});
};

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (dailyChart) {
    dailyChart.remove();
    dailyChart = null;
    dailySeries = null;
  }
});
</script>

<style scoped lang="scss">
.event-records-view {
  min-height: 100vh;
  background-color: #f7f8fa;

  .van-nav-bar__placeholder > :deep(.van-nav-bar--fixed) {
    padding-top: var(--safe-area-top);
  }
}

.family-select-wrapper {
  margin-top: 4px;
}

.content {
  padding: 12px 16px 48px;
}

.filter-panel {
  background: #fff;
  border-radius: 14px;
  padding: 6px 14px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f6f8;

  &:last-child {
    border-bottom: none;
  }

  .filter-label {
    flex-shrink: 0;
    font-size: 13px;
    color: #969799;
    width: 30px;
  }
}

.chips-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  .chip {
    flex-shrink: 0;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    border: 1px solid #dcdee0;
    color: #646566;
    background: #fff;
    cursor: pointer;
    transition: all 0.15s ease;

    &.active {
      background: #1989fa;
      color: #fff;
      border-color: #1989fa;
    }
  }
}

.stats-card {
  display: flex;
  background: #fff;
  border-radius: 14px;
  padding: 14px 0;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  .stat-item {
    flex: 1;
    text-align: center;

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #323233;
    }

    .stat-label {
      font-size: 12px;
      color: #969799;
      margin-top: 2px;
    }
  }
}

.chart-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #323233;
  margin-bottom: 12px;
}

.daily-chart {
  width: 100%;
  height: 180px;
}

.hour-chart {
  height: 150px;
  display: flex;
  align-items: stretch;
}

.hour-bars {
  flex: 1;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding-bottom: 22px;
  position: relative;
}

.hour-col {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;

  .hour-value {
    font-size: 10px;
    color: #969799;
    margin-bottom: 2px;
    line-height: 1;
  }

  .hour-bar {
    width: 100%;
    max-width: 14px;
    border-radius: 3px 3px 0 0;
    background: linear-gradient(180deg, #54a8ff 0%, #1989fa 100%);
    transition: height 0.3s ease;

    &.empty {
      background: #f0f2f5;
      height: 2px !important;
    }
  }

  .hour-label {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: #969799;
    white-space: nowrap;

    &.placeholder {
      visibility: hidden;
    }
  }
}

.list-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #323233;
  margin: 16px 0 10px;
}

.day-group {
  margin-bottom: 14px;
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 8px;

  .day-title {
    font-size: 14px;
    font-weight: 600;
    color: #323233;
  }

  .day-count {
    font-size: 12px;
    color: #969799;
  }
}

.day-list {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.record-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #f5f6f8;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: #f7f8fa;
  }

  .record-emoji {
    flex-shrink: 0;
    font-size: 26px;
    line-height: 1;
  }

  .record-main {
    flex: 1;
    min-width: 0;

    .record-name {
      font-size: 14px;
      color: #323233;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .record-note {
      font-size: 12px;
      color: #969799;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .record-time {
    flex-shrink: 0;
    font-size: 13px;
    color: #969799;
    font-variant-numeric: tabular-nums;
  }
}

.detail-panel {
  padding: 18px 16px calc(18px + var(--safe-area-bottom));
}

.detail-title {
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 16px;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
}
</style>
