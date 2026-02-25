<template>
  <div class="blood-pressure-view">
    <van-nav-bar title="血压" left-arrow @click-left="router.back()" fixed placeholder class="nav-bar">
      <!-- <template #right>
        <van-icon name="ellipsis" size="18" />
      </template> -->
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

      <van-empty v-if="filteredRecords.length === 0" description="暂无数据" />

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
          <div class="chart-container" ref="chartContainer"></div>
        </div>

        <!-- Stats Grid (Week/Month view) -->
        <div class="card stats-card">
          <div class="card-title">
            <van-icon name="eye-o" color="#ff4d4f" size="18" style="margin-right: 4px;" />
            数据概览
          </div>
          <div class="stats-grid">
            <!-- Row 1: Averages -->
            <div class="stat-item">
              <div class="value">{{ avgSbp }} <span class="unit">mmHg</span></div>
              <div class="label">平均高压</div>
            </div>
            <div class="stat-item">
              <div class="value">{{ avgDbp }} <span class="unit">mmHg</span></div>
              <div class="label">平均低压</div>
            </div>

            <!-- Row 2: Max Values -->
            <div class="stat-item">
              <div class="value">{{ maxSbp }} <span class="unit">mmHg</span></div>
              <div class="label">
                最高高压
                <span class="tag high" v-if="maxSbp >= 140">偏高</span>
              </div>
            </div>
            <div class="stat-item">
              <div class="value">{{ maxDbp }} <span class="unit">mmHg</span></div>
              <div class="label">
                最高低压
                <span class="tag high" v-if="maxDbp >= 90">偏高</span>
              </div>
            </div>

            <!-- Row 3: Min Values -->
            <div class="stat-item">
              <div class="value">{{ minSbp }} <span class="unit">mmHg</span></div>
              <div class="label">
                最低高压
                <span class="tag low" v-if="minSbp > 0 && minSbp < 90">偏低</span>
              </div>
            </div>
            <div class="stat-item">
              <div class="value">{{ minDbp }} <span class="unit">mmHg</span></div>
              <div class="label">
                最低低压
                <span class="tag low" v-if="minDbp > 0 && minDbp < 60">偏低</span>
              </div>
            </div>

            <!-- Row 4: Heart Rate -->
            <div class="stat-item" v-if="minHr && maxHr">
              <div class="value">{{ minHr }}-{{ maxHr }} <span class="unit">次/分</span></div>
              <div class="label">心率范围</div>
            </div>
            <div class="stat-item" v-if="avgHr">
              <div class="value">{{ avgHr }} <span class="unit">次/分</span></div>
              <div class="label">平均心率</div>
            </div>

            <!-- Row 5: Blood Oxygen -->
            <div class="stat-item" v-if="minBloodOxygen && maxBloodOxygen">
              <div class="value">{{ minBloodOxygen }}-{{ maxBloodOxygen }} <span class="unit">%</span></div>
              <div class="label">血氧范围</div>
            </div>
            <div class="stat-item" v-if="avgBloodOxygen">
              <div class="value">{{ avgBloodOxygen }} <span class="unit">%</span></div>
              <div class="label">平均血氧</div>
            </div>
          </div>
        </div>

        <!-- Distribution (Day view) -->
        <div class="card stats-card">
          <div class="card-title">
            <van-icon name="chart-trending-o" color="#ee0a24" />
            血压分布
          </div>
          <div class="distribution-bar">
            <div v-for="(item, index) in bpDistribution" :key="index" class="bar-fill"
              :style="{ width: item.percent + '%', background: item.color }" v-show="item.percent > 0">
            </div>
          </div>
          <div class="distribution-info">
            <div v-for="(item, index) in bpDistribution" :key="index" class="distribution-item" v-show="item.count > 0">
              <div class="count">{{ item.count }} <span class="unit">次</span></div>
              <div class="status-text">
                <span class="dot" :style="{ background: item.color }"></span>
                {{ item.label }} {{ item.percent }}%
              </div>
            </div>
          </div>
        </div>

        <!-- 列表展示数据 -->
        <div class="record-list">
          <div v-for="(group, date) in groupedRecords" :key="date" class="record-group">
            <div class="group-header">{{ date }}</div>
            <div class="group-items">
              <div v-for="record in group" :key="record.id" class="record-item" @click="openDetail(record)">
                <div class="record-main">
                  <span class="bp-value">{{ record.sbp }}/{{ record.dbp }} <span class="unit">mmHg</span></span>
                  <div class="record-note" v-if="record.note">
                    <van-icon name="notes-o" />
                    <span class="text">{{ record.note }}</span>
                  </div>
                </div>
                <div class="record-meta">
                  <span class="time">{{ dayjs(record.timestamp).format('MM月DD日 HH:mm') }}</span>
                  <van-icon name="arrow" color="#ccc" />
                </div>
              </div>
            </div>
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
    <van-popup v-model:show="showAddPopup" position="bottom" class="safe-padding-top" round :style="{ height: '100%' }"
      closeable>
      <div class="popup-content">
        <h2 class="popup-title">添加数据</h2>
        <van-cell title="测量时间" is-link :value="addForm.timeStr" @click="showDatePicker = true" />

        <!-- 快捷输入框 -->
        <div class="form-section">
          <div class="section-label">快捷输入 (智能解析)</div>
          <van-field ref="quickInputRef" v-model="quickInput" rows="2" autosize type="textarea" inputmode="decimal"
            placeholder="粘贴或输入：120 80 75 98 (分别对应高压、低压、脉搏、血氧)" class="quick-input-field">
            <template #button>
              <van-button size="small" type="success" :disabled="!isValidForm" @click="handleSubmit">
                保存
              </van-button>
            </template>
          </van-field>
        </div>

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
        <div class="form-section">
          <div class="section-label">备注</div>
          <van-field v-model="addForm.note" rows="2" autosize type="textarea" maxlength="100" placeholder="请输入备注信息"
            show-word-limit class="note-input" />
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

    <!-- Detail Popup -->
    <van-popup v-model:show="showDetailPopup" position="bottom" round closeable>
      <div class="popup-content">
        <h2 class="popup-title">详情</h2>
        <div class="detail-list" v-if="currentRecord">
          <div class="detail-item">
            <span class="label">测量时间</span>
            <span class="value">{{ dayjs(currentRecord.timestamp).format('YYYY/MM/DD HH:mm') }}</span>
          </div>
          <div class="detail-item">
            <span class="label">收缩压 (高压)</span>
            <span class="value">{{ currentRecord.sbp }}<span class="unit">mmHg</span></span>
          </div>
          <div class="detail-item">
            <span class="label">舒张压 (低压)</span>
            <span class="value">{{ currentRecord.dbp }}<span class="unit">mmHg</span></span>
          </div>
          <div class="detail-item">
            <span class="label">脉搏</span>
            <span class="value">{{ currentRecord.heartRate || '--' }}<span class="unit">次/分</span></span>
          </div>
          <div class="detail-item">
            <span class="label">血氧</span>
            <span class="value">{{ currentRecord.bloodOxygen || '--' }}<span class="unit">%</span></span>
          </div>
          <div class="detail-item full-width" v-if="currentRecord.note">
            <span class="label">备注</span>
            <span class="value note-text">{{ currentRecord.note }}</span>
          </div>
        </div>

        <div class="submit-btn-container">
          <van-button type="danger" block round @click="handleDelete">
            删除数据
          </van-button>
        </div>
      </div>
    </van-popup>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, reactive, onUnmounted, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useBloodPressureStore, type BloodPressureRecord } from '@/stores/bloodPressure';
import { useBloodPressureStats } from '@/composables/useBloodPressureStats';
import { useFamily } from '@/composables/useFamily';
import FamilySelector from '@/components/FamilySelector/FamilySelector.vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';

dayjs.locale('zh-cn');
import { showToast, showConfirmDialog } from 'vant';
import TimeRangePicker from '@/components/TimeRangePicker/TimeRangePicker.vue';
import { preventBack } from '@/lib/router';

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
const showDetailPopup = ref(false);
const currentRecord = ref<BloodPressureRecord | null>(null);

const quickInputRef = ref<HTMLInputElement | null>(null);

const quickInput = ref('');

watch(quickInput, (val) => {
  if (!val) {
    addForm.value.sbp = '';
    addForm.value.dbp = '';
    addForm.value.heartRate = '';
    addForm.value.bloodOxygen = '';
    return
  };

  // Extract all number sequences
  const numbers = val.match(/\d+/g);

  if (numbers && numbers.length > 0) {
    if (numbers[0]) addForm.value.sbp = numbers[0];
    else addForm.value.sbp = '';
    if (numbers[1]) addForm.value.dbp = numbers[1];
    else addForm.value.dbp = '';
    if (numbers[2]) addForm.value.heartRate = numbers[2];
    else addForm.value.heartRate = '';
    if (numbers[3]) addForm.value.bloodOxygen = numbers[3];
    else addForm.value.bloodOxygen = '';
  }
});

watch(showAddPopup, async (val) => {
  if (val) {
    // Reset form or set default time
    addForm.value.time = dayjs();
    addForm.value.timeStr = dayjs().format('YYYY/MM/DD HH:mm');
    addForm.value.sbp = '';
    addForm.value.dbp = '';
    addForm.value.heartRate = '';
    addForm.value.bloodOxygen = '';
    quickInput.value = '';

    await nextTick();
    setTimeout(() => {
      quickInputRef.value?.focus();
    }, 500)
  }
});

preventBack(showAddPopup);
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
  timeStr: dayjs().format('YYYY-MM-DD HH:mm'),
  note: ''
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

const groupedRecords = computed(() => {
  const groups: Record<string, BloodPressureRecord[]> = {};
  filteredRecords.value.forEach(record => {
    const date = dayjs(record.timestamp).format('YYYY年MM月DD日-dddd');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(record);
  });
  return groups;
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


// Stats (based on filteredRecords)
const {
  avgSbp,
  avgDbp,
  avgHr,
  maxSbp,
  maxDbp,
  minSbp,
  minDbp,
  minHr,
  maxHr,
  avgBloodOxygen,
  minBloodOxygen,
  maxBloodOxygen
} = useBloodPressureStats(filteredRecords);

const bpDistribution = computed(() => {
  const stats = {
    low: { count: 0, color: '#1989fa', label: '偏低' },
    normal: { count: 0, color: '#95de64', label: '正常' },
    normal_high: { count: 0, color: '#faad14', label: '正常高值' },
    high: { count: 0, color: '#ff4d4f', label: '偏高' }
  };

  const records = filteredRecords.value;
  const total = records.length;

  records.forEach(record => {
    const { sbp, dbp } = record;
    if (sbp >= 140 || dbp >= 90) {
      stats.high.count++;
    } else if (sbp < 90 || dbp < 60) {
      stats.low.count++;
    } else if ((sbp >= 120 && sbp <= 139) || (dbp >= 80 && dbp <= 89)) {
      stats.normal_high.count++;
    } else {
      stats.normal.count++;
    }
  });

  return Object.values(stats).map(item => ({
    ...item,
    percent: total > 0 ? Math.round((item.count / total) * 100) : 0
  }));
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
      heartRate: addForm.value.heartRate ? Number(addForm.value.heartRate) : 0,
      bloodOxygen: addForm.value.bloodOxygen ? Number(addForm.value.bloodOxygen) : 0,
      timestamp: addForm.value.time.valueOf(),
      note: addForm.value.note
    });
    showAddPopup.value = false;
    showToast('添加成功');
    addForm.value = {
      sbp: '',
      dbp: '',
      heartRate: '',
      bloodOxygen: '',
      time: dayjs(),
      timeStr: dayjs().format('YYYY-MM-DD HH:mm'),
      note: ''
    };

    // fetchData(); // store.addRecord already fetches (all).
    // Ideally we should re-fetch with current range, but let's rely on client filtering for now.
    // Or explicitly call fetchData() to reset store to current range?
    // If we call fetchData(), it replaces store.records with range data.
    fetchData();
  } catch (e) {
    showToast('添加失败');
  }
};

const openDetail = (record: BloodPressureRecord) => {
  currentRecord.value = record;
  showDetailPopup.value = true;
};

const handleDelete = () => {
  if (!currentRecord.value) return;

  showConfirmDialog({
    title: '确认删除',
    message: '确定要删除这条测量记录吗？',
  })
    .then(async () => {
      try {
        await store.removeRecord(currentRecord.value!.id);
        showToast('删除成功');
        showDetailPopup.value = false;
        fetchData(); // Refresh list
      } catch (e) {
        showToast('删除失败');
      }
    })
    .catch(() => {
      // on cancel
    });
};

// --- Chart ---
const chartContainer = ref<HTMLElement | null>(null);
let chart: any = null;
let sbpSeries: any = null;
let dbpSeries: any = null;

onUnmounted(() => {
  if (chart) {
    chart.remove();
    chart = null;
  }
  window.removeEventListener('resize', handleResize);
});

const handleResize = () => {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth });
  }
};

watchEffect(async () => {
  if (filteredRecords.value.length !== 0 && chartContainer.value) {
    await nextTick();
    if (!chartContainer.value) return;

    // If chart exists, destroy it first
    if (chart) {
      chart.remove();
      chart = null;
    }

    // Sort records by time ascending for chart
    const data = [...filteredRecords.value]
      .sort((a, b) => a.timestamp - b.timestamp)
      // Filter out invalid timestamps or duplicates if necessary (lightweight-charts requires unique increasing time)
      .map(r => ({ ...r, time: Math.floor(r.timestamp / 1000) as any })); // Cast to any to satisfy type temporarily

    // Deduplicate timestamps
    const uniqueData: typeof data = [];
    const seenTimes = new Set<number>();

    data.forEach(r => {
      if (!seenTimes.has(r.time)) {
        seenTimes.add(r.time);
        uniqueData.push(r);
      }
    });

    const sbpData = uniqueData.map(r => ({ time: r.time, value: r.sbp }));
    const dbpData = uniqueData.map(r => ({ time: r.time, value: r.dbp }));

    chart = createChart(chartContainer.value, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#969799', // Matched WeightView
      },
      grid: {
        vertLines: { visible: false }, // Matched WeightView
        horzLines: { color: '#f0f0f0' },
      },
      width: chartContainer.value.clientWidth,
      height: 200,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.2,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const date = dayjs(time * 1000);
          if (activeTab.value === 'day') {
            return date.format('HH:mm');
          }
          return date.format('MM-DD');
        },
      },
      localization: {
        dateFormat: 'yyyy-MM-dd',
        timeFormatter: (time: number) => {
          return dayjs(time * 1000).format('YYYY-MM-DD HH:mm');
        }
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    // Set Fixed Scale for Y (0-180)
    chart.priceScale('right').applyOptions({
      autoScale: false,
      minValue: 0,
      maxValue: 180,
    });

    // SBP Series (High) - Line
    sbpSeries = chart.addSeries(LineSeries, {
      color: '#ff4d4f',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      pointMarkersVisible: true, // WeightView uses lastValueVisible: true, priceLineVisible: false
      pointMarkersRadius: 4, // WeightView doesn't explicitly set this, but kept from previous
      title: '收缩压',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // DBP Series (Low) - Line
    dbpSeries = chart.addSeries(LineSeries, {
      color: '#1989fa', // Use Blue for DBP to distinguish from SBP (Red)
      lineWidth: 2,
      crosshairMarkerVisible: true,
      pointMarkersVisible: true,
      pointMarkersRadius: 4,
      title: '舒张压',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    sbpSeries.setData(sbpData);
    dbpSeries.setData(dbpData);

    chart.timeScale().fitContent();

    window.addEventListener('resize', handleResize);
  }
});

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

// Removed watch(filteredRecords) since watchEffect handles it

onMounted(async () => {
  await refreshFamilies();
  fetchData();
  // Removed explicit initChart call
});

</script>

<style lang="scss" scoped>
@import url('./style.scss');
</style>
<style>
#tv-attr-logo {
  display: none;
}
</style>
