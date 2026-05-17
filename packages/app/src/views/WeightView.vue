<script setup lang="ts">
import { showConfirmDialog, showSuccessToast } from 'vant'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watchEffect, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { getWeightDiff, getTimeDiffDes } from '@/lib/weight-utils'
import { getWeightList, addWeight, updateWeight, deleteWeight, type WeightRecord } from '@/service/weight'
import { useFamily } from '@/composables/useFamily'
import FamilySelector from '@/components/FamilySelector/FamilySelector.vue'
import dayjs from 'dayjs'
import { createChart, ColorType, LineSeries } from 'lightweight-charts'
import { preventBack } from '@/lib/router'

const formatDate = (date: any, fmt: string = 'yyyy-MM-dd') => {
  if (!date) return ''
  const formatMap: Record<string, string> = {
    'yyyy/MM/dd': 'YYYY/MM/DD',
    'hh:mm': 'HH:mm',
    'yyyy-MM-dd': 'YYYY-MM-DD',
    'yyyy-MM-dd hh:mm': 'YYYY-MM-DD HH:mm',
    'yyyy-MM': 'YYYY-MM'
  }
  return dayjs(date).format(formatMap[fmt] || fmt)
}

const isKG = ref(localStorage.getItem('weight-kg') === 'true')
watchEffect(() => {
  localStorage.setItem('weight-kg', `${isKG.value}`)
})

const themeColor = ref('#1989fa')

const router = useRouter()
function handleBack() {
  router.go(-1) // Changed from /dashboard to /home or similar
}

const { refreshFamilies } = useFamily()

const currentFamilyId = useLocalStorage('weight_current_family', 'default')

// Watch for family changes to refresh records
watch(currentFamilyId, (val) => {
  refreshRecord(val)
})

const state = reactive({
  // people: localStorage.getItem('currentPerson') || 'default', // Removed, use currentFamilyId
  showTime: false,
  time: '',
  timeValue: [] as string[],
  showCalendar: false,
  date: '',
  weight: 0,
  tips: '',
  editRecordId: ''
})

preventBack(state, 'showTime')
preventBack(state, 'showCalendar')

// 体重数据
const weights = ref<WeightRecord[]>([])

// 搜索关键字
const searchWeight = ref('')
const loading = ref(false)
const finished = ref(false)
const page = ref(1)
const pageSize = ref(30)

// 实际展示的列表
const showWeights = computed(() =>
  weights.value.filter((w) => {
    if (!searchWeight.value)
      return true
    return `${formatDate(w.date, 'yyyy/MM/dd')}${w.tips || ''}${w.weight}`.includes(
      searchWeight.value
    )
  })
)

function onLoad() {
  getWeightList(currentFamilyId.value, page.value, pageSize.value).then(res => {
    if (res.code === 0) {
      const newData = res.data
      if (page.value === 1) {
        weights.value = newData
      } else {
        weights.value.push(...newData)
      }

      // Check if finished
      if (newData.length < pageSize.value) {
        finished.value = true
      } else {
        page.value++
      }
    } else {
      finished.value = true
    }
  }).catch(() => {
    finished.value = true
  }).finally(() => {
    loading.value = false
  })
}

function refreshRecord(familyId: string) {
  // Reset pagination
  page.value = 1
  finished.value = false
  loading.value = true
  // weights.value = []
  onLoad()
}

// 添加记录相关
const showAddRecord = ref(false)
const recordPopupContentKey = ref(0)
const editMode = ref(false)
const weightInputRef = ref<HTMLInputElement | null>(null)
const canSaveRecord = computed(() => +state.weight > 0)

preventBack(showAddRecord)

function focusWeightInput(selectContent = true) {
  nextTick(() => {
    const input = weightInputRef.value
    if (!input) return
    input.focus()
    if (selectContent) {
      input.select()
    }
  })
}

function clearWeightInputSelection() {
  const input = weightInputRef.value
  if (input) {
    try {
      input.setSelectionRange(0, 0)
    } catch {
      // 部分 WebView 的 number input 不支持文本选区 API。
    }
    input.value = input.value
    input.blur()
  }

  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) {
    activeElement.blur()
  }
  window.getSelection()?.removeAllRanges()
  requestAnimationFrame(() => {
    window.getSelection()?.removeAllRanges()
  })
}

function openAddRecordPopup() {
  showAddRecord.value = true
}

function closeAddRecordPopup() {
  clearWeightInputSelection()
  showAddRecord.value = false
}

function handleAddRecordPopupClose() {
  clearWeightInputSelection()
}

function handleAddRecordPopupClosed() {
  clearWeightInputSelection()
  weightInputRef.value = null
  recordPopupContentKey.value += 1
}

function handleAddRecord() {
  editMode.value = false
  state.editRecordId = ''
  state.tips = ''
  // 展示当前时间
  const now = new Date()
  state.date = formatDate(now, 'yyyy/MM/dd')
  state.time = formatDate(now, 'hh:mm')
  state.timeValue = state.time.split(':')
  // 展示最近一次的记录
  state.weight = weights.value.length > 0 ? weights.value[0].weight : 50.0
  if (!isKG.value) {
    state.weight *= 2
  }
  openAddRecordPopup()
}

// 时间选择
function handleSureTime(timeSelect: any) {
  state.time = timeSelect.selectedValues.join(':')
  state.showTime = false
}
// 日期选择:前1周
const now = new Date()
const minDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7)
const maxDate = now
function handleSureDate(date: Date) {
  state.date = formatDate(date, 'yyyy/MM/dd')
  state.showCalendar = false
}

// 修改/添加记录
function handleSureRecord() {
  const date = new Date(`${state.date} ${state.time}`)
  let weight = +state.weight
  if (weight <= 0) {
    return
  }
  weight = +(isKG.value ? weight : weight / 2).toFixed(2)
  // 修改
  if (editMode.value) {
    updateWeight({
      id: state.editRecordId,
      weight,
      date,
      tips: state.tips
    }).then(() => {
      showSuccessToast('修改成功')
      // 刷新列表
      refreshRecord(currentFamilyId.value)
      closeAddRecordPopup()
    })
    return
  }

  const { tips } = state
  state.tips = ''
  addWeight({
    familyId: currentFamilyId.value === 'default' ? 'default' : currentFamilyId.value,
    weight,
    date,
    tips,
    operator: 'self'
  }).then((res) => {
    showSuccessToast('记录成功')
    refreshRecord(currentFamilyId.value)
  })

  closeAddRecordPopup()
}

// 删除记录
function handleDeleteWeight(item: WeightRecord) {
  showConfirmDialog({
    title: '提示',
    message: '确认移除此条记录？'
  })
    .then(() => {
      const id = item._id
      if (id) {
        deleteWeight(id).then(() => {
          // Find index in weights.value
          const index = weights.value.findIndex(w => w._id === id)
          if (index > -1) {
            weights.value.splice(index, 1)
          }
        })
      }
    })
    .catch(() => {
      // on cancel
    })
}
function handleUpdateWeight(item: WeightRecord) {
  const record = item
  state.editRecordId = record._id || ''
  editMode.value = true

  // 展示当前时间
  const now = new Date(record.date)
  state.date = formatDate(now, 'yyyy/MM/dd')
  state.time = formatDate(now, 'hh:mm')
  state.timeValue = state.time.split(':')
  // 展示最近一次的记录
  state.weight = record.weight
  if (!isKG.value) {
    state.weight *= 2
  }
  state.tips = record.tips || ''
  openAddRecordPopup()
}
// 格式化内容展示
const overviewData = computed(() => {
  const res = []
  // 最新的一次
  const latest = weights.value[0]
  if (!latest) return [] // Handle empty

  // 与上一次比较
  const lastTime = weights.value.length === 1 ? weights.value[0] : weights.value[1]
  res.push({
    text: `与上一次比较(${getTimeDiffDes(latest.date, lastTime.date)})`,
    ...getWeightDiff(latest.weight, lastTime.weight)
  })
  // 与今天第一次比较
  const todayData = weights.value.filter(
    v => formatDate(now, 'yyyy-MM-dd') === formatDate(v.date, 'yyyy-MM-dd')
  )
  if (todayData.length !== 0) {
    const todayFirst = todayData[todayData.length - 1]
    res.push({
      text: `与今天首次比较(${getTimeDiffDes(latest.date, todayFirst.date)})`,
      ...getWeightDiff(latest.weight, todayFirst.weight)
    })
  }
  // 与本月第一次比较
  const monthData = weights.value.filter(
    v => formatDate(now, 'yyyy-MM') === formatDate(v.date, 'yyyy-MM')
  )
  if (monthData.length !== 0) {
    const monthFirst = monthData[monthData.length - 1]
    res.push({
      text: `与本月首次比较(${getTimeDiffDes(latest.date, monthFirst.date)})`,
      ...getWeightDiff(latest.weight, monthFirst.weight)
    })
  }
  return res
})

const chartContainer = ref<HTMLElement | null>(null)
let chart: any = null
let series: any = null

onUnmounted(() => {
  if (chart) {
    chart.remove()
    chart = null
  }
  window.removeEventListener('resize', handleResize)
})

const handleResize = () => {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth })
  }
}

watchEffect(async () => {
  if (weights.value.length !== 0 && chartContainer.value) {
    await nextTick()
    if (!chartContainer.value) return

    // 如果图表已存在，先销毁
    if (chart) {
      chart.remove()
      chart = null
    }

    const dataMap = new Map();
    weights.value.forEach(item => {
      const time = Math.floor(new Date(item.date).getTime() / 1000); // Lightweight charts uses seconds
      if (!dataMap.has(time)) {
        dataMap.set(time, item.weight);
      }
    });

    const data = Array.from(dataMap.entries())
      .map(([time, value]) => ({ time: time as any, value }))
      .sort((a, b) => a.time - b.time);

    chart = createChart(chartContainer.value, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#969799',
      },
      width: chartContainer.value.clientWidth,
      height: 220,
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#f0f0f0' },
      },
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
          return dayjs(time * 1000).format('MM-DD')
        }
      },
      localization: {
        dateFormat: 'yyyy-MM-dd',
        timeFormatter: (time: number) => {
          return dayjs(time * 1000).format('YYYY-MM-DD HH:mm')
        }
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    })

    series = chart.addSeries(LineSeries, {
      color: '#1989fa',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: false,
    })

    series.setData(data)

    // Fit content
    chart.timeScale().fitContent()

    window.addEventListener('resize', handleResize)
  }
})

onMounted(() => {
  refreshFamilies()
  refreshRecord(currentFamilyId.value)
})
</script>

<template>
  <div>
    <van-nav-bar class="safe-padding-top" fixed title="体重记录" left-text="返回" left-arrow @click-left="handleBack" />
    <!-- 选人 -->
    <header class="family-select-wrapper safe-padding-top">
      <FamilySelector v-model="currentFamilyId" :active-color="themeColor" />
    </header>

    <van-empty v-if="weights.length === 0" description="没有记录，点击右下角 + 添加" />
    <main v-else>
      <!-- 最近一次的记录 -->
      <h2 class="current-time">
        {{ formatDate(weights[0].date) }}
      </h2>
      <h1 class="current-weight">
        {{ weights[0].weight }}
        <span>kg</span>
        <span class="jin">{{ weights[0].weight * 2 }}</span>
        <span>斤</span>
      </h1>
      <p v-for="(t, idx) in overviewData" :key="idx" class="rank">
        {{ t.text }}
        <span :class="t.symbol" />
        <span class="res">{{ t.res }}</span>
      </p>
      <div ref="chartContainer" style="width: 100%; height: 220px" />
      <van-divider :style="{ color: '#1989fa', borderColor: '#1989fa', padding: '0 16px' }">
        体重记录（{{ isKG ? 'kg' : '斤' }}）
        <van-switch v-model="isKG" :size="18" inactive-color="#e8ffee" />
      </van-divider>
      <van-search v-model="searchWeight" placeholder="请输入过滤关键词" input-align="center" />

      <div class="weight-list">
        <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="onLoad">
          <van-swipe-cell v-for="(t, idx) in showWeights" :key="idx">
            <van-cell :title-style="{ flex: 1.1 }" :border="false" :title="formatDate(t.date)">
              <div style="display: flex; justify-content: space-between">
                <span>{{ (isKG ? t.weight : t.weight * 2).toFixed(2) }}</span>
                <span>{{ t.tips || '' }}</span>
              </div>
            </van-cell>
            <template #right>
              <van-button square type="primary" text="编辑" @click="handleUpdateWeight(t)" />
              <van-button square type="danger" text="删除" @click="handleDeleteWeight(t)" />
            </template>
          </van-swipe-cell>
        </van-list>
      </div>
    </main>
    <!-- 添加记录 -->
    <div class="add-record" @click="handleAddRecord">
      <van-icon name="plus" size="20" />
    </div>
    <!-- 添加记录弹窗 -->
    <van-popup
      v-model:show="showAddRecord"
      position="bottom"
      class="safe-padding-top"
      round
      closeable
      :style="{ height: '100%' }"
      @click-close-icon="clearWeightInputSelection"
      @click-overlay="clearWeightInputSelection"
      @close="handleAddRecordPopupClose"
      @closed="handleAddRecordPopupClosed"
      @opened="focusWeightInput"
    >
      <div :key="recordPopupContentKey" class="record-popup">
        <header class="record-popup-header">
          <h2>{{ editMode ? '修改记录' : '录入记录' }}</h2>
          <van-button
            type="primary"
            size="small"
            round
            :disabled="!canSaveRecord"
            @click="handleSureRecord"
          >
            保存
          </van-button>
        </header>

        <van-cell-group inset class="record-section">
          <van-cell title="记录日期" is-link :value="state.date" @click="state.showCalendar = true" />
          <van-cell title="记录时间" is-link :value="state.time" @click="state.showTime = true" />
        </van-cell-group>

        <section class="weight-input-section">
          <div class="section-label">体重</div>
          <div class="weight-input-card" @click="focusWeightInput(true)">
            <input
              ref="weightInputRef"
              v-model.number="state.weight"
              type="number"
              inputmode="decimal"
              placeholder="0"
            />
            <span class="weight-unit">{{ isKG ? 'kg' : '斤' }}</span>
          </div>
          <div class="unit-helper">
            <span>当前单位：{{ isKG ? '公斤' : '斤' }}</span>
            <van-switch v-model="isKG" :size="18" inactive-color="#e8ffee" />
          </div>
        </section>

        <section class="record-section">
          <div class="section-label">备注</div>
          <van-field
            v-model="state.tips"
            rows="3"
            autosize
            type="textarea"
            maxlength="100"
            placeholder="记录饮食、运动或当天状态"
            show-word-limit
            class="note-input"
          />
        </section>

        <div class="record-submit">
          <van-button type="primary" block round :disabled="!canSaveRecord" @click="handleSureRecord">
            保存记录
          </van-button>
        </div>
      </div>
    </van-popup>
    <!-- 时间 -->
    <van-popup v-model:show="state.showTime" position="bottom">
      <van-time-picker v-model="state.timeValue" @confirm="handleSureTime" @cancel="state.showTime = false" />
    </van-popup>
    <!-- 日历 -->
    <van-calendar v-model:show="state.showCalendar" :min-date="minDate" :max-date="maxDate" :color="themeColor"
      @confirm="handleSureDate" />
  </div>
</template>

<style lang="scss" scoped>
.current-time {
  padding-top: 2rem;
  text-align: center;
  font-size: 0.65rem;
  color: #6d6d6d;
}

.current-weight {
  text-align: center;
  font-size: 3rem;
  font-weight: bold;

  span {
    font-size: 0.8rem;
    padding-left: 0.5rem;
    font-weight: normal;
  }
}

.rank {
  text-align: center;
  font-weight: bold;
  font-size: 0.9rem;
  color: #6d6d6d;
  margin-bottom: 0.5rem;

  .inc,
  .dec {
    display: inline-block;

    &::after {
      display: inline-block;
      font-weight: bold;
    }
  }

  .dec::after {
    content: '轻';
    color: green;
    font-size: 10px;
    transform: scale(0.8);
  }

  .inc::after {
    content: '增加';
    color: #ff6034;
    font-size: 10px;
    transform: scale(0.8);
  }

  .res {
    color: #ff8917;
  }
}

.weight-list {
  padding: 0 0.5rem;
  overflow-y: scroll;
  height: calc(100vh - 380px);
  padding-bottom: 3rem;
}

.control {
  text-align: center;
}

.van-cell {
  justify-content: space-between;
}

.add-record {
  position: fixed;
  right: 2rem;
  bottom: 2.5rem;
  width: 3rem;
  height: 3rem;
  color: #fff;
  background-color: v-bind(themeColor);
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.record-popup {
  height: 100%;
  overflow-y: auto;
  background: #f7f8fa;
  padding: 16px 16px calc(88px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.record-popup-header {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px 12px 0;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #1f2329;
  }
}

.record-section {
  margin-bottom: 18px;
}

.section-label {
  font-size: 14px;
  color: #969799;
  margin: 0 0 10px 4px;
}

.weight-input-section {
  margin: 22px 0;
}

.weight-input-card {
  min-height: 120px;
  border-radius: 8px;
  background: #fff;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  padding: 18px 20px;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);

  input {
    width: min(210px, 65vw);
    border: none;
    outline: none;
    background: transparent;
    text-align: center;
    font-size: 56px;
    line-height: 1;
    font-weight: 700;
    color: #1f2329;
    font-family: "DIN Alternate", sans-serif;
  }

  input::placeholder {
    color: #dcdee0;
  }
}

.weight-unit {
  font-size: 18px;
  color: #646566;
}

.unit-helper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px 0;
  font-size: 13px;
  color: #969799;
}

.note-input {
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.record-submit {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 1;
}

:deep(.van-popup__close-icon) {
  padding-top: var(--safe-area-top);
}

.jin {
  font-size: 1rem;
  line-height: 1rem;
}

.family-select-wrapper {
  position: relative;
  margin-top: 46px;
}
</style>
<style>
.van-dropdown-item__content {
  padding-top: 0;
}
#tv-attr-logo{
  display: none;
}
</style>
