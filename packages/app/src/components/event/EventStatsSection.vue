<template>
  <div class="stats">
    <div class="filter-panel">
      <div class="filter-row">
        <span class="filter-label">事件</span>
        <div class="chips-scroll">
          <button
            type="button"
            class="chip"
            :class="{ 'is-active': filterEventId === 'all' }"
            @click="emit('update:filterEventId', 'all')"
          >
            全部
          </button>
          <button
            v-for="e in events"
            :key="e.id"
            type="button"
            class="chip"
            :class="{ 'is-active': filterEventId === e.id }"
            @click="emit('update:filterEventId', e.id)"
          >
            {{ e.emoji || '📌' }} {{ e.name }}
          </button>
        </div>
      </div>
      <div class="filter-row">
        <span class="filter-label">时间</span>
        <div class="chips-scroll">
          <button
            v-for="item in RANGES"
            :key="item.value"
            type="button"
            class="chip"
            :class="{ 'is-active': rangeKey === item.value }"
            @click="emit('update:rangeKey', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
    </div>

    <template v-if="loading">
      <div class="statrow">
        <div v-for="i in 3" :key="i" class="skeleton-card stat-skeleton" />
      </div>
      <section class="panel"><div class="skeleton-card chart-skeleton" /></section>
    </template>

    <template v-else-if="!records.length">
      <div class="state-block">
        <div class="state-block__icon"><van-icon name="records-o" size="24" /></div>
        <div class="state-block__title">这段时间还没有记录</div>
        <div class="state-block__desc">换个时间范围或事件试试，或先去记录一次。</div>
        <button type="button" class="btn btn--primary" @click="emit('go-record')">去记录</button>
      </div>
    </template>

    <template v-else>
      <div class="statrow" :class="{ 'statrow--wide': variant === 'desktop' }">
        <div class="stat">
          <div class="stat__value">{{ totalCount }}</div>
          <div class="stat__label">总记录</div>
        </div>
        <div class="stat">
          <div class="stat__value">{{ dayCount }}</div>
          <div class="stat__label">记录天数</div>
        </div>
        <div class="stat">
          <div class="stat__value">{{ avgPerDay }}</div>
          <div class="stat__label">日均次数</div>
        </div>
        <div v-if="variant === 'desktop'" class="stat">
          <div class="stat__value">{{ streak }}</div>
          <div class="stat__label">连续天数</div>
        </div>
      </div>

      <div class="stats-flow" :class="{ 'stats-flow--split': variant === 'desktop' }">
        <section class="panel">
          <div class="panel__head">
            <van-icon name="chart-trending-o" size="16" />
            <span class="panel__title">每日发生频率</span>
            <div class="seg">
              <button
                type="button"
                :class="{ 'is-active': chartDays === 7 }"
                @click="emit('update:chartDays', 7)"
              >
                7 天
              </button>
              <button
                type="button"
                :class="{ 'is-active': chartDays === 30 }"
                @click="emit('update:chartDays', 30)"
              >
                30 天
              </button>
            </div>
          </div>
          <div class="chart-host">
            <svg
              :viewBox="`0 0 ${dims.w} ${dims.h}`"
              role="img"
              aria-label="每日记录次数趋势"
            >
              <defs>
                <linearGradient id="ev-area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#1989fa" stop-opacity="0.2" />
                  <stop offset="100%" stop-color="#1989fa" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path :d="areaPath" fill="url(#ev-area-fill)" />
              <path :d="linePath" fill="none" stroke="#1989fa" stroke-width="2.4" stroke-linecap="round" />
              <circle
                v-for="(p, i) in points"
                :key="i"
                :cx="p.x"
                :cy="p.y"
                :r="p.isToday ? 4 : 2.6"
                :fill="p.isToday ? '#1989fa' : '#ffffff'"
                stroke="#1989fa"
                stroke-width="1.6"
              >
                <title>{{ p.label }}：{{ p.value }} 次</title>
              </circle>
              <text
                v-for="(p, i) in points"
                v-show="p.showLabel"
                :key="`l-${i}`"
                :x="p.x"
                :y="dims.h - 6"
                text-anchor="middle"
                font-size="11"
                fill="#969799"
              >
                {{ p.label }}
              </text>
            </svg>
          </div>
        </section>

        <section v-if="variant === 'desktop'" class="panel">
          <div class="panel__head">
            <van-icon name="pie-chart-o" size="16" />
            <span class="panel__title">事件占比</span>
          </div>
          <div class="donut">
            <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="各事件占比">
              <circle cx="70" cy="70" r="54" fill="none" stroke="#eef1f5" stroke-width="16" />
              <circle
                v-for="(a, i) in donutArcs"
                :key="i"
                cx="70"
                cy="70"
                r="54"
                fill="none"
                :stroke="a.color"
                stroke-width="16"
                :stroke-dasharray="`${a.len} ${donutCircumference - a.len}`"
                :stroke-dashoffset="-a.offset"
                transform="rotate(-90 70 70)"
              >
                <title>{{ a.name }}：{{ a.value }} 次</title>
              </circle>
              <text x="70" y="66" text-anchor="middle" font-size="20" font-family="DIN Alternate, monospace" fill="#323233">
                {{ donutTotal }}
              </text>
              <text x="70" y="84" text-anchor="middle" font-size="11" fill="#969799">次记录</text>
            </svg>
            <ul class="donut__legend">
              <li v-for="(item, i) in totals.slice(0, 5)" :key="item.id">
                <i :style="{ background: ringColors[i % ringColors.length] }" />
                <span class="donut__name">{{ item.emoji }} {{ item.name }}</span>
                <span class="fade-num">{{ item.value }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <van-icon name="clock-o" size="16" />
            <span class="panel__title">发生时段分布</span>
            <span class="panel__hint">0–23 时</span>
          </div>
          <div class="hour-chart">
            <div
              v-for="(count, h) in hours"
              :key="h"
              class="hour-col"
              :title="`${h} 时：${count} 次`"
            >
              <div
                class="hour-bar"
                :class="{ 'is-now': h === currentHour }"
                :style="{ height: `${(count / hourMax) * 100}%` }"
              />
            </div>
          </div>
          <div class="hour-axis">
            <span v-for="(count, h) in hours" :key="h">{{ h % 3 === 0 ? h : '' }}</span>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <van-icon name="records-o" size="16" />
            <span class="panel__title">记录明细</span>
            <span class="panel__hint">按天分组</span>
          </div>
          <div v-for="group in groups" :key="group.date" class="group">
            <div class="group__head">
              <span class="group__date">{{ dayTitle(group.date) }}</span>
              <span class="group__sum">{{ group.items.length }} 次</span>
            </div>
            <button
              v-for="r in group.items"
              :key="r.id"
              type="button"
              class="rec-row"
              @click="openDetail(r)"
            >
              <span class="rec-row__emoji" aria-hidden="true">{{ r.emoji || '📌' }}</span>
              <span class="rec-row__main">
                <span class="rec-row__name">{{ r.eventName }}</span>
                <span v-if="r.note" class="rec-row__note">{{ r.note }}</span>
              </span>
              <span v-if="r.amount != null" class="rec-row__value">
                {{ formatAmount(r.amount, unitOf(r.eventId)) }}
              </span>
              <span class="rec-row__time">{{ timeOf(r.occurredAt) }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>

    <van-popup
      v-model:show="showDetail"
      position="center"
      overlay-class="ev-overlay"
      class="ev-scope ev-popup-dialog"
    >
      <section class="dialog" role="dialog" aria-modal="true" aria-label="记录详情">
        <h3>{{ detailRecord?.emoji || '📌' }} {{ detailRecord?.eventName }}</h3>
        <p v-if="detailRecord">{{ fullTime(detailRecord.occurredAt) }}</p>
        <div class="detail-row" v-if="detailRecord?.amount != null">
          <span class="detail-row__label">数量</span>
          <span class="detail-row__value">{{ formatAmount(detailRecord.amount, unitOf(detailRecord.eventId)) }}</span>
        </div>
        <div class="detail-row" v-if="detailRecord?.note">
          <span class="detail-row__label">备注</span>
          <span class="detail-row__value">{{ detailRecord.note }}</span>
        </div>
        <div class="sheet__actions">
          <button type="button" class="btn btn--danger" @click="removeDetail">删除该记录</button>
          <button type="button" class="btn btn--ghost btn--block" @click="showDetail = false">关闭</button>
        </div>
      </section>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import dayjs from 'dayjs';
import { preventBack } from '@/lib/router';
import { formatAmount, useEventStats, type EventRangeKey } from '@/composables/useEventStats';
import type { EventItem, EventRecordItem } from '@/service/event';

const props = withDefaults(defineProps<{
  events: EventItem[];
  records: EventRecordItem[];
  loading?: boolean;
  variant?: 'mobile' | 'desktop';
  filterEventId?: string;
  rangeKey?: EventRangeKey;
  chartDays?: number;
  streak?: number;
  todayCount?: number;
}>(), {
  loading: false,
  variant: 'mobile',
  filterEventId: 'all',
  rangeKey: '7d',
  chartDays: 7,
  streak: 0,
  todayCount: 0,
});

const emit = defineEmits<{
  'update:filterEventId': [value: string];
  'update:rangeKey': [value: EventRangeKey];
  'update:chartDays': [value: number];
  'go-record': [];
  'delete-record': [id: string];
}>();

const RANGES: { label: string; value: EventRangeKey }[] = [
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '全部', value: 'all' },
];

const ringColors = ['#1989fa', '#4fb0c6', '#7f9cf5', '#f0a35e', '#b08bd0', '#c9d3e0'];

const filterEventId = toRef(props, 'filterEventId');
const chartDays = toRef(props, 'chartDays');

const { totalCount, dayCount, avgPerDay, daily, hours, totals, groups } = useEventStats(
  toRef(props, 'events'),
  toRef(props, 'records'),
  filterEventId,
  chartDays,
);

/** 内联 SVG 的坐标尺寸：手机短一些、桌面更高，和原型比例一致 */
const dims = computed(() => (props.variant === 'desktop' ? { w: 640, h: 190 } : { w: 330, h: 150 }));
const PAD_X = 14;
const PAD_T = 18;
const PAD_B = 24;

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  label: string;
  isToday: boolean;
  showLabel: boolean;
}

const points = computed<ChartPoint[]>(() => {
  const { w, h } = dims.value;
  const series = daily.value;
  const max = Math.max(1, ...series.map((s) => s.value));
  const stepX = (w - PAD_X * 2) / Math.max(1, series.length - 1);
  return series.map((s, i) => ({
    x: PAD_X + i * stepX,
    y: h - PAD_B - (s.value / max) * (h - PAD_T - PAD_B),
    value: s.value,
    label: s.label,
    isToday: s.isToday,
    showLabel: series.length <= 10 || i % 5 === 0 || s.isToday,
  }));
});

/** 用三次贝塞尔做过冲平滑，和原型一致 */
function smoothPath(list: ChartPoint[]): string {
  if (list.length < 2) return '';
  let d = `M${list[0].x.toFixed(1)},${list[0].y.toFixed(1)}`;
  for (let i = 0; i < list.length - 1; i++) {
    const p0 = list[i - 1] || list[i];
    const p1 = list[i];
    const p2 = list[i + 1];
    const p3 = list[i + 2] || p2;
    d +=
      ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}` +
      ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}` +
      ` ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

const linePath = computed(() => smoothPath(points.value));

const areaPath = computed(() => {
  const list = points.value;
  if (!list.length) return '';
  const baseline = dims.value.h - PAD_B;
  return `${linePath.value} L${list[list.length - 1].x.toFixed(1)},${baseline} L${list[0].x.toFixed(1)},${baseline} Z`;
});

const hourMax = computed(() => Math.max(1, ...hours.value));
const currentHour = new Date().getHours();

const donutCircumference = 2 * Math.PI * 54;

const donutTotal = computed(() => totals.value.reduce((sum, item) => sum + item.value, 0));

const donutArcs = computed(() => {
  const total = donutTotal.value || 1;
  let offset = 0;
  return totals.value.slice(0, 6).map((item, i) => {
    const len = (item.value / total) * donutCircumference;
    const arc = {
      len,
      offset,
      color: ringColors[i % ringColors.length],
      name: item.name,
      value: item.value,
    };
    offset += len;
    return arc;
  });
});

const showDetail = ref(false);
const detailRecord = ref<EventRecordItem | null>(null);

const unitOf = (eventId: string) => props.events.find((e) => e.id === eventId)?.unit || '';

const timeOf = (ts: number) => dayjs(ts).format('HH:mm');
const fullTime = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm');

function dayTitle(date: string) {
  const d = dayjs(date);
  if (d.isSame(dayjs(), 'day')) return '今天';
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return '昨天';
  return d.format('M 月 D 日');
}

function openDetail(record: EventRecordItem) {
  detailRecord.value = record;
  showDetail.value = true;
}

function removeDetail() {
  const target = detailRecord.value;
  if (!target) return;
  showDetail.value = false;
  emit('delete-record', target.id);
}

preventBack(showDetail);
</script>

<style scoped lang="scss">
.stats-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-flow--split {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  align-items: start;
}

.stat-skeleton {
  min-height: 64px;
}

.chart-skeleton {
  min-height: 180px;
}

.detail-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
  font-size: 13px;
}

.detail-row__label {
  flex: none;
  width: 48px;
  color: var(--ink-3);
}

.detail-row__value {
  flex: 1;
  min-width: 0;
  color: var(--ink);
  word-break: break-word;
}
</style>
