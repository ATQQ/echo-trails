<template>
  <div class="blood-pressure-view">
    <van-nav-bar title="血压" left-arrow @click-left="router.back()" fixed placeholder class="nav-bar">
      <template #right>
        <van-icon name="ellipsis" size="18" />
      </template>
    </van-nav-bar>

    <!-- Family Selector -->
    <div class="family-select-wrapper">
      <FamilySelector />
    </div>

    <div class="content">
      <!-- Date Selector -->
      <div class="date-selector">
        <div class="date-text" @click="handleDateClick">
          {{ currentDateText }}
          <van-icon name="arrow-down" />
        </div>
        <div class="tabs-container">
          <div class="tabs">
            <span v-for="t in tabs" :key="t.value" :class="{ active: activeTab === t.value }"
              @click="activeTab = t.value">
              {{ t.label }}
            </span>
          </div>
        </div>
      </div>

      <van-empty v-if="!loading && filteredRecords.length === 0" description="暂无数据" />

      <template v-else>
        <!-- Latest Record / Summary -->
        <div class="card summary-card" v-if="latestRecord">
          <div class="status-indicator">
            <span class="dot" :style="{ background: getStatusColor(latestRecord.sbp, latestRecord.dbp) }"></span>
            <span class="label">{{ getStatusText(latestRecord.sbp, latestRecord.dbp) }}</span>
          </div>
          <div class="main-value">
            <span class="bp-value">{{ latestRecord.sbp }}/{{ latestRecord.dbp }}</span>
            <span class="unit">mmHg</span>
          </div>
          <div v-if="latestRecord.heartRate" class="sub-value">
            <span class="label">脉搏</span>
            <span class="value">{{ latestRecord.heartRate }}</span>
            <span class="unit">次/分</span>
          </div>
          <div class="sub-value" v-if="latestRecord.bloodOxygen">
            <span class="label">血氧</span>
            <span class="value">{{ latestRecord.bloodOxygen }}</span>
            <span class="unit">%</span>
          </div>
          <div class="time">{{ formatTime(latestRecord.timestamp) }}</div>

          <!-- Status Bar Visualization -->
          <div class="status-bar-container">
            <div class="status-bar">
              <div class="segment low"></div>
              <div class="segment normal"></div>
              <div class="segment high"></div>
              <div class="segment very-high"></div>
              <!-- Triangle Indicator -->
              <div class="indicator" :style="{ left: getIndicatorPosition(latestRecord.sbp) }"></div>
            </div>
            <div class="status-labels">
              <span>偏低</span>
              <span>偏高</span>
            </div>
          </div>
        </div>

        <!-- Chart -->
        <div class="card chart-card">
          <div class="chart-header">
            <span>{{ chartTitle }}</span>
          </div>
          <div class="chart-container" ref="chartContainer"></div>
        </div>

        <!-- Stats Grid (Week/Month view) -->
        <div class="card stats-card" v-if="activeTab !== 'day'">
          <div class="card-title">本{{ activeTab === 'week' ? '周' : '月' }}概览</div>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="value">{{ avgSbp }}/{{ avgDbp }} <span class="unit">mmHg</span></div>
              <div class="label">血压平均值</div>
            </div>
            <div class="stat-item">
              <div class="value">{{ avgHr }} <span class="unit">次/分</span></div>
              <div class="label">脉搏平均值</div>
            </div>
            <div class="stat-item">
              <div class="value">{{ maxSbp }} <span class="unit">mmHg</span></div>
              <div class="label">最高高压</div>
            </div>
            <div class="stat-item">
              <div class="value">{{ minDbp }} <span class="unit">mmHg</span></div>
              <div class="label">最低低压</div>
            </div>
          </div>
        </div>

        <!-- Distribution (Day view) -->
        <div class="card stats-card" v-if="activeTab === 'day'">
          <div class="card-title">
            <van-icon name="chart-trending-o" color="#ee0a24" />
            血压分布
          </div>
          <div class="distribution-bar">
            <div class="bar-fill" style="width: 100%; background: #95de64;"></div>
          </div>
          <div class="distribution-info">
            <div class="count">{{ todayRecords.length }} <span class="unit">次</span></div>
            <div class="status-text"><span class="dot normal"></span> 正常 100%</div>
          </div>
        </div>
      </template>
    </div>

    <!-- Floating Action Button or Bottom Button -->
    <div class="bottom-action">
      <van-button icon="plus" type="primary" round block @click="showAddPopup = true">
        添加测量记录
      </van-button>
    </div>

    <!-- Add Record Popup -->
    <van-popup v-model:show="showAddPopup" position="bottom" round :style="{ height: '500px' }" closeable>
      <div class="popup-content">
        <h2 class="popup-title">添加数据</h2>
        <van-cell title="测量时间" is-link :value="addForm.timeStr" @click="showDatePicker = true" />

        <div class="form-section">
          <div class="section-label">血压 (必填)</div>
          <div class="input-row">
            <div class="input-box">
              <div class="label">收缩压 (高压)</div>
              <div class="input-wrapper">
                <input type="number" v-model="addForm.sbp" placeholder="0" />
                <span class="unit">mmHg</span>
              </div>
            </div>
            <div class="input-box">
              <div class="label">舒张压 (低压)</div>
              <div class="input-wrapper">
                <input type="number" v-model="addForm.dbp" placeholder="0" />
                <span class="unit">mmHg</span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="section-label">其他 (选填)</div>
          <div class="input-row">
            <div class="input-box">
              <div class="label">脉搏</div>
              <div class="input-wrapper">
                <input type="number" v-model="addForm.heartRate" placeholder="0" />
                <span class="unit">次/分</span>
              </div>
            </div>
            <div class="input-box">
              <div class="label">血氧</div>
              <div class="input-wrapper">
                <input type="number" v-model="addForm.bloodOxygen" placeholder="0" />
                <span class="unit">%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="submit-btn-container">
          <van-button type="primary" block round @click="handleSubmit" :disabled="!isValidForm">
            保存
          </van-button>
        </div>
      </div>
    </van-popup>

    <!-- Date Picker Popup -->
    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-picker-group v-model:active-tab="pickerActiveTab" title="测量时间" :tabs="['选择日期', '选择时间']"
        @confirm="onConfirmPicker" @cancel="showDatePicker = false">
        <van-date-picker v-model="datePickerValue" :min-date="minDate" :max-date="maxDate" />
        <van-time-picker v-model="timePickerValue" />
      </van-picker-group>
    </van-popup>

    <TimeRangePicker v-model:show="showTimeRangePicker" :type="activeTab" :current-date="currentDate"
      :current-range="currentRange" @confirm="onTimeRangeConfirm" />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useBloodPressureStore } from '@/stores/bloodPressure';
import { useFamily } from '@/composables/useFamily';
import FamilySelector from '@/components/FamilySelector/FamilySelector.vue';
import dayjs from 'dayjs';
import { createChart, ColorType } from 'lightweight-charts';
import { showToast } from 'vant';
import TimeRangePicker from '@/components/TimeRangePicker/TimeRangePicker.vue';

const router = useRouter();
const store = useBloodPressureStore();
const { currentFamilyId, refreshFamilies } = useFamily();

// --- State ---
const activeTab = ref<'day' | 'week' | 'month' | 'custom'>('day');
const tabs = [
  { label: '日', value: 'day' as const },
  { label: '周', value: 'week' as const },
  { label: '月', value: 'month' as const },
  { label: '自定义', value: 'custom' as const },
];
const showAddPopup = ref(false);
const showDatePicker = ref(false);
const showTimeRangePicker = ref(false);

// Date State (Independent for each tab)
const dateStates = reactive({
  day: dayjs().valueOf(),
  week: dayjs().valueOf(),
  month: dayjs().valueOf(),
  custom: {
    range: [0, 0] as [number, number],
    label: ''
  }
});

const addForm = ref({
  sbp: '',
  dbp: '',
  heartRate: '',
  bloodOxygen: '',
  time: dayjs(),
  timeStr: dayjs().format('YYYY/MM/DD HH:mm')
});
const pickerActiveTab = ref(0);
const datePickerValue = ref([dayjs().format('YYYY'), dayjs().format('MM'), dayjs().format('DD')]);
const timePickerValue = ref([dayjs().format('HH'), dayjs().format('mm')]);
const minDate = new Date(2020, 0, 1);
const maxDate = new Date();

const loading = ref(false);

const fetchData = async () => {
  const { start, end } = getTimeRange();
  if (start && end) {
    loading.value = true;
    try {
      await store.fetchRecords(start, end);
    } finally {
      loading.value = false;
    }
  }
};

const getTimeRange = () => {
  let start = 0;
  let end = 0;

  if (activeTab.value === 'custom') {
    [start, end] = dateStates.custom.range;
  } else {
    const d = dayjs(dateStates[activeTab.value as 'day' | 'week' | 'month']);
    if (activeTab.value === 'day') {
      start = d.startOf('day').valueOf();
      end = d.endOf('day').valueOf();
    } else if (activeTab.value === 'week') {
      const day = d.day();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = d.add(diffToMonday, 'day');
      start = monday.startOf('day').valueOf();
      end = monday.add(6, 'day').endOf('day').valueOf();
    } else if (activeTab.value === 'month') {
      start = d.startOf('month').valueOf();
      end = d.endOf('month').valueOf();
    }
  }
  return { start, end };
};

watch(() => currentFamilyId.value, () => {
  fetchData();
});

// --- Computed ---
const currentDate = computed(() => {
  if (activeTab.value === 'custom') return 0;
  return dateStates[activeTab.value as 'day' | 'week' | 'month'];
});

const currentRange = computed(() => dateStates.custom.range);

const latestRecord = computed(() => store.records[0]); // Assumes sorted
const filteredRecords = computed(() => {
  const { start, end } = getTimeRange();

  if (!start || !end) return [];

  return store.records.filter(r => r.timestamp >= start && r.timestamp <= end);
});

const todayRecords = computed(() => {
  // Always return today's records for distribution, regardless of view?
  // Or just return filteredRecords if in 'day' view?
  if (activeTab.value === 'day') return filteredRecords.value;
  return filteredRecords.value;
});

const currentDateText = computed(() => {
  if (activeTab.value === 'custom') {
    return dateStates.custom.label || '请选择时间段';
  }
  const d = dayjs(dateStates[activeTab.value]);
  if (activeTab.value === 'day') return d.format('YYYY年MM月DD日');
  if (activeTab.value === 'week') {
    // Calculate week range display
    const day = d.day();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = d.add(diffToMonday, 'day');
    const sunday = monday.add(6, 'day');
    if (monday.year() !== sunday.year()) {
      return `${monday.format('YYYY年MM月DD日')}-${sunday.format('YYYY年MM月DD日')}`;
    }
    return `${monday.format('YYYY年MM月DD日')}-${sunday.format('MM月DD日')}`;
  }
  return d.format('YYYY年MM月');
});

const chartTitle = computed(() => {
  if (activeTab.value === 'day') return '今日趋势';
  return '近期趋势';
});

// Stats (based on filteredRecords)
const avgSbp = computed(() => {
  if (!filteredRecords.value.length) return 0;
  const sum = filteredRecords.value.reduce((acc, r) => acc + r.sbp, 0);
  return Math.round(sum / filteredRecords.value.length);
});
const avgDbp = computed(() => {
  if (!filteredRecords.value.length) return 0;
  const sum = filteredRecords.value.reduce((acc, r) => acc + r.dbp, 0);
  return Math.round(sum / filteredRecords.value.length);
});
const avgHr = computed(() => {
  if (!filteredRecords.value.length) return 0;
  const sum = filteredRecords.value.reduce((acc, r) => acc + r.heartRate, 0);
  return Math.round(sum / filteredRecords.value.length);
});
const maxSbp = computed(() => {
  if (!filteredRecords.value.length) return 0;
  return Math.max(...filteredRecords.value.map(r => r.sbp));
});
const minDbp = computed(() => {
  if (!filteredRecords.value.length) return 0;
  return Math.min(...filteredRecords.value.map(r => r.dbp));
});

const isValidForm = computed(() => {
  return addForm.value.sbp && addForm.value.dbp;
});

// --- Methods ---
const handleDateClick = () => {
  showTimeRangePicker.value = true;
};

const onTimeRangeConfirm = (res: { start: number; end: number; label: string }) => {
  if (activeTab.value === 'custom') {
    dateStates.custom.range = [res.start, res.end];
    dateStates.custom.label = res.label;
  } else {
    // Update date state for the active tab
    dateStates[activeTab.value] = res.start;
  }
  fetchData();
};

const formatTime = (ts: number) => dayjs(ts).format('MM月DD日 HH:mm');

const getStatusColor = (sbp: number, dbp: number) => {
  if (sbp >= 140 || dbp >= 90) return '#ee0a24'; // High
  if (sbp < 90 || dbp < 60) return '#1989fa'; // Low
  return '#07c160'; // Normal
};

const getStatusText = (sbp: number, dbp: number) => {
  if (sbp >= 140 || dbp >= 90) return '偏高';
  if (sbp < 90 || dbp < 60) return '偏低';
  return '正常';
};

const getIndicatorPosition = (val: number) => {
  const min = 60;
  const max = 180;
  let p = ((val - min) / (max - min)) * 100;
  if (p < 0) p = 0;
  if (p > 100) p = 100;
  return `${p}%`;
};

const onConfirmPicker = () => {
  const [y, m, d] = datePickerValue.value;
  const [hh, mm] = timePickerValue.value;
  const date = dayjs(`${y}-${m}-${d} ${hh}:${mm}`);
  addForm.value.time = date;
  addForm.value.timeStr = date.format('YYYY/MM/DD HH:mm');
  showDatePicker.value = false;
};

const handleSubmit = async () => {
  try {
    await store.addRecord({
      sbp: Number(addForm.value.sbp),
      dbp: Number(addForm.value.dbp),
      heartRate: Number(addForm.value.heartRate) || 0,
      bloodOxygen: Number(addForm.value.bloodOxygen) || 0,
      timestamp: addForm.value.time.valueOf(),
    });
    showAddPopup.value = false;
    showToast('添加成功');
    addForm.value.sbp = '';
    addForm.value.dbp = '';
    addForm.value.heartRate = '';
    addForm.value.bloodOxygen = '';

    // fetchData(); // store.addRecord already fetches (all).
    // Ideally we should re-fetch with current range, but let's rely on client filtering for now.
    // Or explicitly call fetchData() to reset store to current range?
    // If we call fetchData(), it replaces store.records with range data.
    fetchData();
  } catch (e) {
    showToast('添加失败');
  }
};

// --- Chart ---
const chartContainer = ref<HTMLElement | null>(null);
let chart: any = null;
let sbpSeries: any = null;
let dbpSeries: any = null;

const initChart = () => {
  if (!chartContainer.value) return;

  chart = createChart(chartContainer.value, {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#333',
    },
    grid: {
      vertLines: { color: '#f0f0f0' },
      horzLines: { color: '#f0f0f0' },
    },
    width: chartContainer.value.clientWidth,
    height: 200,
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
    }
  });

  sbpSeries = chart.addLineSeries({ color: '#ee0a24', title: '收缩压' });
  dbpSeries = chart.addLineSeries({ color: '#1989fa', title: '舒张压' });

  refreshChart();

  new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== chartContainer.value) { return; }
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width });
  }).observe(chartContainer.value);
};

const refreshChart = () => {
  if (!sbpSeries || !dbpSeries) return;

  // Sort records by time ascending for chart
  const data = [...filteredRecords.value].sort((a, b) => a.timestamp - b.timestamp);

  const sbpData = data.map(r => ({ time: r.timestamp / 1000, value: r.sbp }));
  const dbpData = data.map(r => ({ time: r.timestamp / 1000, value: r.dbp }));

  sbpSeries.setData(sbpData);
  dbpSeries.setData(dbpData);

  chart.timeScale().fitContent();
};

watch(activeTab, (val) => {
  if (val === 'custom') {
    if (!dateStates.custom.range[0] || !dateStates.custom.range[1]) {
      // Default to last 7 days
      const end = dayjs().endOf('day').valueOf();
      const start = dayjs().subtract(6, 'day').startOf('day').valueOf();
      dateStates.custom.range = [start, end];
      dateStates.custom.label = `${dayjs(start).format('YYYY年MM月DD日')} - ${dayjs(end).format('MM月DD日')}`;
    }
  }
  fetchData();
});

watch(filteredRecords, () => {
  refreshChart();
}, { deep: true });

onMounted(async () => {
  await refreshFamilies();
  fetchData();
  nextTick(() => {
    initChart();
  });
});

</script>

<style lang="scss" scoped>
.van-nav-bar__placeholder>:deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.blood-pressure-view {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-bottom: 80px;
}

.family-select-wrapper {
  background: #fff;

  :deep(.van-dropdown-menu__bar) {
    box-shadow: none;
    height: 40px;
  }
}

.content {
  padding: 12px;
}

.date-selector {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;

  .date-text {
    font-size: 16px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin-bottom: 12px;
    cursor: pointer;
  }

  .tabs-container {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .tabs {
    display: flex;
    justify-content: center;
    background: #fff;
    border-radius: 16px;
    padding: 2px;

    span {
      padding: 4px 16px;
      border-radius: 14px;
      font-size: 14px;
      color: #666;
      cursor: pointer;

      &.active {
        background: #f7f8fa;
        color: #000;
        font-weight: bold;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
    }
  }
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.summary-card {
  position: relative;

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .label {
      font-size: 14px;
      font-weight: bold;
    }
  }

  .main-value {
    margin-bottom: 8px;

    .bp-value {
      font-size: 32px;
      font-weight: bold;
      font-family: 'DIN Alternate', sans-serif;
    }

    .unit {
      font-size: 14px;
      color: #999;
      margin-left: 4px;
    }
  }

  .sub-value {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;

    .label {
      color: #666;
      font-size: 14px;
    }

    .value {
      font-size: 20px;
      font-weight: bold;
    }

    .unit {
      color: #999;
      font-size: 12px;
    }
  }

  .time {
    font-size: 12px;
    color: #999;
    margin-bottom: 16px;
  }

  .status-bar-container {
    .status-bar {
      height: 8px;
      border-radius: 4px;
      display: flex;
      overflow: hidden;
      position: relative;
      margin-bottom: 4px;

      .segment {
        flex: 1;
      }

      .low {
        background: #1989fa;
      }

      .normal {
        background: #07c160;
      }

      .high {
        background: #ff976a;
      }

      .very-high {
        background: #ee0a24;
      }

      .indicator {
        position: absolute;
        top: 0;
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 6px solid #333;
        transform: translateX(-50%);
      }
    }

    .status-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #999;
    }
  }
}

.chart-card {
  .chart-header {
    font-weight: bold;
    margin-bottom: 12px;
  }

  .chart-container {
    width: 100%;
    height: 200px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  .stat-item {
    .value {
      font-size: 18px;
      font-weight: bold;

      .unit {
        font-size: 12px;
        color: #999;
        font-weight: normal;
      }
    }

    .label {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
  }
}

.card-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.distribution-bar {
  height: 12px;
  background: #f0f0f0;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;

  .bar-fill {
    height: 100%;
    border-radius: 6px;
  }
}

.distribution-info {
  display: flex;
  justify-content: space-between;
  font-size: 14px;

  .count {
    font-weight: bold;
  }

  .status-text {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #666;

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #07c160;
    }
  }
}

.bottom-action {
  position: fixed;
  bottom: 20px;
  left: 20px;
  right: 20px;
}

.popup-content {
  padding: 20px;
  display: flex;
  flex-direction: column;

  .popup-title {
    font-size: 24px;
    margin-bottom: 24px;
    font-weight: normal;
  }

  .form-section {
    margin-bottom: 24px;

    .section-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 12px;
    }

    .input-row {
      display: flex;
      gap: 12px;

      .input-box {
        flex: 1;
        background: #f7f8fa;
        padding: 16px;
        border-radius: 12px;

        .label {
          font-size: 12px;
          color: #999;
          margin-bottom: 8px;
        }

        .input-wrapper {
          display: flex;
          align-items: baseline;

          input {
            width: 100%;
            border: none;
            background: transparent;
            font-size: 20px;
            font-weight: bold;
            padding: 0;
            margin: 0;
          }

          .unit {
            font-size: 12px;
            color: #999;
            margin-left: 4px;
            white-space: nowrap;
          }
        }
      }
    }
  }

  .submit-btn-container {
    margin-top: auto;
  }
}
</style>
