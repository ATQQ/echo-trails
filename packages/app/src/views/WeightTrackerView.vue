<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, nextTick, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { showConfirmDialog, showSuccessToast, showToast } from 'vant'
import { useRouter } from 'vue-router'
import FamilySelector from '@/components/FamilySelector/FamilySelector.vue'
import { preventBack } from '@/lib/router'
import { getWeightList, addWeight, updateWeight, deleteWeight, type WeightRecord } from '@/service/weight'
import { useFamily } from '@/composables/useFamily'

type TabName = 'home' | 'record' | 'stats' | 'profile'
type RangeName = 'week' | 'month' | 'year'

interface ChartPoint {
  date: string
  label: string
  value: number
  x: number
  y: number
  highlight?: 'high' | 'low'
}

const themeColor = '#1976ff'
const router = useRouter()
const { refreshFamilies } = useFamily()
const currentFamilyId = useLocalStorage('weight_current_family', 'default')
const isKG = ref(localStorage.getItem('weight-kg') === 'true')
const activeTab = ref<TabName>('home')
const range = ref<RangeName>('week')
const records = ref<WeightRecord[]>([])
const loading = ref(false)
const selectedRecord = ref<WeightRecord | null>(null)
const showRecordActions = ref(false)
const showTargetDialog = ref(false)
const showHeightDialog = ref(false)

const state = reactive({
  date: dayjs().format('YYYY/MM/DD'),
  showCalendar: false,
  weightInput: '',
  tips: '',
  editRecordId: '',
  targetDraft: '52.0',
  heightDraft: '162'
})

const targetWeight = useLocalStorage('weight_target_kg', 52)
const heightCm = useLocalStorage('weight_height_cm', 162)

preventBack(state, 'showCalendar')
preventBack(showRecordActions)
preventBack(showTargetDialog)
preventBack(showHeightDialog)

watchEffect(() => {
  localStorage.setItem('weight-kg', `${isKG.value}`)
})

watch(currentFamilyId, () => {
  loadRecords()
})

const sortedRecords = computed(() => {
  return [...records.value].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

const latestRecord = computed(() => sortedRecords.value[0])

const latestWeight = computed(() => latestRecord.value?.weight || 0)

const earliestRecord = computed(() => sortedRecords.value[sortedRecords.value.length - 1])

const initialWeight = computed(() => earliestRecord.value?.weight || latestWeight.value || 0)

const weekRecords = computed(() => {
  const start = dayjs().subtract(6, 'day').startOf('day')
  return sortedRecords.value.filter(item => dayjs(item.date).isAfter(start) || dayjs(item.date).isSame(start))
})

const chartSource = computed(() => {
  const amount = range.value === 'week' ? 6 : range.value === 'month' ? 29 : 364
  const start = dayjs().subtract(amount, 'day').startOf('day')
  return sortedRecords.value.filter(item => dayjs(item.date).isAfter(start) || dayjs(item.date).isSame(start))
})

const trendRecords = computed(() => {
  return chartSource.value.slice(0, 12)
})

const todayLabel = computed(() => {
  const selected = dayjs(state.date, 'YYYY/MM/DD')
  return selected.isSame(dayjs(), 'day') ? '今天' : selected.format('ddd')
})

const currentWeightText = computed(() => formatNumber(displayWeight(latestWeight.value), 1))

const bmiValue = computed(() => {
  const height = heightCm.value / 100
  if (!latestWeight.value || !height) return 0
  return latestWeight.value / height / height
})

const bmiStatus = computed(() => {
  const bmi = bmiValue.value
  if (!bmi) return '暂无'
  if (bmi < 18.5) return '偏低'
  if (bmi < 24) return '正常'
  if (bmi < 28) return '偏高'
  return '偏胖'
})

const bmiPercent = computed(() => {
  if (!bmiValue.value) return 0
  return Math.min(Math.max(((bmiValue.value - 15) / 20) * 100, 6), 94)
})

const lostWeight = computed(() => Math.max(initialWeight.value - latestWeight.value, 0))

const distanceToTarget = computed(() => Math.max(latestWeight.value - targetWeight.value, 0))

const goalProgress = computed(() => {
  const total = Math.max(initialWeight.value - targetWeight.value, 0)
  if (!total) return latestWeight.value <= targetWeight.value ? 100 : 0
  return Math.min(Math.max((lostWeight.value / total) * 100, 0), 100)
})

const statsSummary = computed(() => {
  const source = chartSource.value
  if (!source.length) {
    return { high: 0, low: 0 }
  }
  return {
    high: Math.max(...source.map(item => item.weight)),
    low: Math.min(...source.map(item => item.weight))
  }
})

const chartPoints = computed<ChartPoint[]>(() => {
  const source = compactChartRecords(normalizeDailyRecords(chartSource.value))
  if (!source.length) return []

  const values = source.map(item => item.weight)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const gap = Math.max(max - min, 0.8)
  const top = max + gap * 0.25
  const bottom = min - gap * 0.25
  const width = 300
  const left = 20
  const right = 14
  const usableWidth = width - left - right
  const usableHeight = 86
  const topOffset = 20

  return source.map((item, index) => {
    const x = source.length === 1 ? width / 2 : left + (usableWidth * index) / (source.length - 1)
    const y = topOffset + ((top - item.weight) / (top - bottom || 1)) * usableHeight
    return {
      date: dayjs(item.date).format('YYYY-MM-DD'),
      label: dayjs(item.date).format(range.value === 'year' ? 'M月' : 'M/D'),
      value: item.weight,
      x,
      y,
      highlight: item.weight === max ? 'high' : item.weight === min ? 'low' : undefined
    }
  })
})

const chartLinePoints = computed(() => chartPoints.value.map(point => `${point.x},${point.y}`).join(' '))

const chartAreaPoints = computed(() => {
  if (!chartPoints.value.length) return ''
  const first = chartPoints.value[0]
  const last = chartPoints.value[chartPoints.value.length - 1]
  return `${first.x},112 ${chartLinePoints.value} ${last.x},112`
})

const canSaveRecord = computed(() => Number(state.weightInput) > 0)

const tabItems: Array<{ name: TabName, text: string, icon: string }> = [
  { name: 'home', text: '首页', icon: 'wap-home-o' },
  { name: 'record', text: '记录', icon: 'notes-o' },
  { name: 'stats', text: '统计', icon: 'bar-chart-o' },
  { name: 'profile', text: '我的', icon: 'manager-o' }
]

const keypadItems = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

const rangeItems: Array<{ name: RangeName, text: string }> = [
  { name: 'week', text: '周' },
  { name: 'month', text: '月' },
  { name: 'year', text: '年' }
]

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return (0).toFixed(digits)
  return value.toFixed(digits)
}

function displayWeight(weight: number) {
  return isKG.value ? weight : weight * 2
}

function normalizeWeight(value: number) {
  return +(isKG.value ? value : value / 2).toFixed(2)
}

function formatRecordWeight(weight: number, digits = 1) {
  return formatNumber(displayWeight(weight), digits)
}

function formatRecordDate(date: string | Date) {
  const value = dayjs(date)
  if (value.isSame(dayjs(), 'day')) return '今天'
  if (value.isSame(dayjs().subtract(1, 'day'), 'day')) return '昨天'
  return value.format('M月D日')
}

function formatRecordWeekday(date: string | Date) {
  const weekdayMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekdayMap[dayjs(date).day()]
}

function formatFullDate(date: string | Date) {
  return dayjs(date).format('YYYY年M月D日')
}

function normalizeDailyRecords(source: WeightRecord[]) {
  const daily = new Map<string, WeightRecord>()
  source.forEach(item => {
    const key = dayjs(item.date).format('YYYY-MM-DD')
    const exists = daily.get(key)
    if (!exists || dayjs(item.date).isAfter(dayjs(exists.date))) {
      daily.set(key, item)
    }
  })
  return Array.from(daily.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function compactChartRecords(source: WeightRecord[]) {
  const maxPoints = range.value === 'week' ? 7 : 8
  if (source.length <= maxPoints) return source

  const step = (source.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, index) => source[Math.round(index * step)]).filter(Boolean)
}

async function loadRecords() {
  loading.value = true
  try {
    const res = await getWeightList(currentFamilyId.value, 1, 180)
    if (res.code === 0) {
      records.value = res.data
      return
    }
    showToast('体重数据加载失败')
  } catch (error) {
    console.error(error)
    showToast('体重数据加载失败')
  } finally {
    loading.value = false
  }
}

function handleBack() {
  router.back()
}

function openRecord(record?: WeightRecord) {
  const target = record || latestRecord.value
  state.editRecordId = record?._id || ''
  state.date = dayjs(record?.date || new Date()).format('YYYY/MM/DD')
  state.tips = record?.tips || ''
  state.weightInput = target ? formatNumber(displayWeight(target.weight), 1) : ''
  activeTab.value = 'record'
  nextTick(() => {
    window.scrollTo({ top: 0 })
  })
}

function handleKeypadTap(key: string) {
  if (key === 'back') {
    state.weightInput = state.weightInput.slice(0, -1)
    return
  }
  if (key === '.' && state.weightInput.includes('.')) return
  if (state.weightInput.length >= 5) return
  state.weightInput = `${state.weightInput}${key}`
}

function handleCalendarConfirm(date: Date) {
  state.date = dayjs(date).format('YYYY/MM/DD')
  state.showCalendar = false
}

async function saveRecord() {
  const value = Number(state.weightInput)
  if (value <= 0) {
    showToast('请输入体重')
    return
  }

  const weight = normalizeWeight(value)
  const date = dayjs(`${state.date} ${dayjs().format('HH:mm')}`, 'YYYY/MM/DD HH:mm').toDate()

  try {
    if (state.editRecordId) {
      await updateWeight({
        id: state.editRecordId,
        weight,
        date,
        tips: state.tips
      })
      showSuccessToast('修改成功')
    } else {
      await addWeight({
        familyId: currentFamilyId.value === 'default' ? 'default' : currentFamilyId.value,
        weight,
        date,
        tips: state.tips,
        operator: 'self'
      })
      showSuccessToast('记录成功')
    }
    state.editRecordId = ''
    state.tips = ''
    await loadRecords()
    activeTab.value = 'home'
  } catch (error) {
    console.error(error)
    showToast('保存失败，请稍后重试')
  }
}

function openRecordAction(record: WeightRecord) {
  selectedRecord.value = record
  showRecordActions.value = true
}

function editSelectedRecord() {
  if (!selectedRecord.value) return
  showRecordActions.value = false
  openRecord(selectedRecord.value)
}

async function removeSelectedRecord() {
  if (!selectedRecord.value?._id) return
  const record = selectedRecord.value as WeightRecord & { _id: string }
  showRecordActions.value = false
  try {
    await showConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条体重记录吗？'
    })
    await deleteWeight(record._id)
    records.value = records.value.filter(item => item._id !== record._id)
    showSuccessToast('已删除')
  } catch (error) {
    if (error) {
      console.error(error)
    }
  }
}

function openTargetDialog() {
  state.targetDraft = formatNumber(displayWeight(targetWeight.value), 1)
  showTargetDialog.value = true
}

function confirmTarget() {
  const value = Number(state.targetDraft)
  if (value > 0) {
    targetWeight.value = normalizeWeight(value)
  }
}

function openHeightDialog() {
  state.heightDraft = String(heightCm.value)
  showHeightDialog.value = true
}

function confirmHeight() {
  const value = Number(state.heightDraft)
  if (value >= 80 && value <= 240) {
    heightCm.value = value
    return
  }
  showToast('请输入合理身高')
}

function handleSettingToast() {
  showToast('设置项暂未接入')
}

onMounted(async () => {
  await refreshFamilies()
  await loadRecords()
})
</script>

<template>
  <div class="weight-tracker">
    <section v-if="activeTab === 'home'" class="screen home-screen">
      <header class="home-hero safe-padding-top">
        <button class="plain-icon" type="button" aria-label="返回" @click="handleBack">
          <van-icon name="arrow-left" />
        </button>
        <div class="greeting">
          <div class="avatar">
            <van-icon name="contact-o" />
          </div>
          <div>
            <h1>早上好，Lily</h1>
            <p>坚持记录，遇见更好的自己</p>
          </div>
        </div>
        <button class="plain-icon" type="button" aria-label="提醒" @click="handleSettingToast">
          <van-icon name="bell" />
        </button>
      </header>

      <main class="home-content">
        <div class="metric-grid">
          <article class="metric-card current-card">
            <div class="metric-title">
              <span>当前体重（{{ isKG ? 'kg' : '斤' }}）</span>
              <van-icon name="eye-o" />
            </div>
            <strong>{{ currentWeightText }}</strong>
            <p>
              距离目标
              <span>{{ formatRecordWeight(distanceToTarget, 1) }}</span>
            </p>
          </article>

          <article class="metric-card bmi-card">
            <div class="bmi-ring" :style="{ '--bmi-percent': `${bmiPercent}%` }">
              <span>BMI</span>
              <strong>{{ formatNumber(bmiValue, 1) }}</strong>
              <em>{{ bmiStatus }}</em>
            </div>
          </article>
        </div>

        <button class="primary-action" type="button" @click="openRecord()">
          <van-icon name="plus" />
          <span>记录今日体重</span>
        </button>

        <article class="panel trend-panel">
          <div class="panel-header">
            <h2>最近7天趋势</h2>
            <span>单位：{{ isKG ? 'kg' : '斤' }}</span>
          </div>
          <div v-if="chartPoints.length" class="mini-chart">
            <svg viewBox="0 0 300 128" role="img" aria-label="最近体重趋势图">
              <defs>
                <linearGradient id="weightFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#1976ff" stop-opacity="0.18" />
                  <stop offset="100%" stop-color="#1976ff" stop-opacity="0" />
                </linearGradient>
              </defs>
              <line v-for="line in [36, 62, 88]" :key="line" x1="18" x2="286" :y1="line" :y2="line" class="grid-line" />
              <polygon :points="chartAreaPoints" fill="url(#weightFill)" />
              <polyline :points="chartLinePoints" class="trend-line" />
              <g v-for="point in chartPoints" :key="point.date">
                <circle :cx="point.x" :cy="point.y" r="4" class="point-dot" />
                <text :x="point.x" :y="point.y - 10" class="point-label" text-anchor="middle">
                  {{ formatRecordWeight(point.value, 1) }}
                </text>
                <text :x="point.x" y="122" class="axis-label" text-anchor="middle">
                  {{ point.label }}
                </text>
              </g>
            </svg>
          </div>
          <van-empty v-else description="暂无趋势数据" />
        </article>

        <div class="summary-grid">
          <article class="summary-card">
            <span>初始体重</span>
            <strong>{{ formatRecordWeight(initialWeight, 1) }}</strong>
            <em>{{ isKG ? 'kg' : '斤' }}</em>
          </article>
          <article class="summary-card">
            <span>目标体重</span>
            <strong>{{ formatRecordWeight(targetWeight, 1) }}</strong>
            <em>{{ isKG ? 'kg' : '斤' }}</em>
          </article>
          <article class="summary-card">
            <span>距离目标</span>
            <strong>{{ formatRecordWeight(distanceToTarget, 1) }}</strong>
            <em>{{ isKG ? 'kg' : '斤' }}</em>
          </article>
        </div>
      </main>
    </section>

    <section v-else-if="activeTab === 'record'" class="screen record-screen safe-padding-top">
      <header class="page-header">
        <button class="plain-icon dark" type="button" aria-label="返回首页" @click="activeTab = 'home'">
          <van-icon name="arrow-left" />
        </button>
        <h1>{{ state.editRecordId ? '修改体重' : '记录体重' }}</h1>
        <button class="plain-icon dark" type="button" aria-label="切换单位" @click="isKG = !isKG">
          <van-icon name="exchange" />
        </button>
      </header>

      <main class="record-content">
        <div class="field-label">选择日期</div>
        <button class="date-select" type="button" @click="state.showCalendar = true">
          <van-icon name="calendar-o" />
          <span>{{ formatFullDate(dayjs(state.date, 'YYYY/MM/DD').toDate()) }}</span>
          <em>{{ todayLabel }}</em>
          <van-icon name="arrow-down" />
        </button>

        <div class="record-value">
          <strong>{{ state.weightInput || '0' }}</strong>
          <span>{{ isKG ? 'kg' : '斤' }}</span>
        </div>

        <div class="weight-scale" aria-hidden="true">
          <span v-for="tick in 23" :key="tick" :class="{ major: tick % 5 === 0 }"></span>
        </div>
        <div class="scale-labels">
          <span>{{ isKG ? '55.5' : '111' }}</span>
          <span>{{ isKG ? '56.0' : '112' }}</span>
          <span>{{ isKG ? '56.5' : '113' }}</span>
          <span>{{ isKG ? '57.0' : '114' }}</span>
          <span>{{ isKG ? '57.5' : '115' }}</span>
          <span>{{ isKG ? '58.0' : '116' }}</span>
        </div>

        <div class="keypad">
          <button v-for="key in keypadItems" :key="key" type="button" @click="handleKeypadTap(key)">
            <van-icon v-if="key === 'back'" name="clear" />
            <span v-else>{{ key }}</span>
          </button>
        </div>

        <label class="note-box">
          <span>备注（可选）</span>
          <textarea v-model="state.tips" maxlength="100" rows="3" placeholder="记录一下今天的状态吧..." />
          <em>{{ state.tips.length }}/100</em>
        </label>

        <button class="save-button" type="button" :disabled="!canSaveRecord" @click="saveRecord">
          保存记录
        </button>
      </main>
    </section>

    <section v-else-if="activeTab === 'stats'" class="screen stats-screen safe-padding-top">
      <header class="page-header">
        <button class="plain-icon dark" type="button" aria-label="返回首页" @click="activeTab = 'home'">
          <van-icon name="arrow-left" />
        </button>
        <h1>体重趋势</h1>
        <button class="plain-icon dark" type="button" aria-label="选择日期" @click="state.showCalendar = true">
          <van-icon name="calendar-o" />
        </button>
      </header>

      <main class="stats-content">
        <div class="range-tabs">
          <button
            v-for="item in rangeItems"
            :key="item.name"
            type="button"
            :class="{ active: range === item.name }"
            @click="range = item.name"
          >
            {{ item.text }}
          </button>
        </div>

        <article class="panel stats-chart-card">
          <div class="panel-header">
            <h2>体重趋势（{{ isKG ? 'kg' : '斤' }}）</h2>
            <div class="legend">
              <span class="high">最高 {{ formatRecordWeight(statsSummary.high, 1) }}</span>
              <span class="low">最低 {{ formatRecordWeight(statsSummary.low, 1) }}</span>
            </div>
          </div>
          <div v-if="chartPoints.length" class="large-chart">
            <svg viewBox="0 0 300 128" role="img" aria-label="体重趋势图">
              <line v-for="line in [32, 56, 80, 104]" :key="line" x1="18" x2="286" :y1="line" :y2="line" class="grid-line" />
              <polyline :points="chartLinePoints" class="trend-line" />
              <g v-for="point in chartPoints" :key="point.date">
                <circle :cx="point.x" :cy="point.y" r="4" :class="['point-dot', point.highlight]" />
                <text :x="point.x" :y="point.y - 9" :class="['point-label', point.highlight]" text-anchor="middle">
                  {{ formatRecordWeight(point.value, 1) }}
                </text>
                <text :x="point.x" y="122" class="axis-label" text-anchor="middle">
                  {{ point.label }}
                </text>
              </g>
            </svg>
          </div>
          <van-empty v-else description="暂无趋势数据" />
        </article>

        <article class="record-list-panel">
          <h2>体重记录</h2>
          <van-empty v-if="trendRecords.length === 0 && !loading" description="暂无记录" />
          <button v-for="record in trendRecords" :key="record._id || String(record.date)" class="record-row" type="button" @click="openRecordAction(record)">
            <span>{{ formatRecordDate(record.date) }} <em>{{ formatRecordWeekday(record.date) }}</em></span>
            <strong>{{ formatRecordWeight(record.weight, 1) }} {{ isKG ? 'kg' : '斤' }}</strong>
            <van-icon name="arrow" />
          </button>
        </article>
      </main>
    </section>

    <section v-else class="screen profile-screen safe-padding-top">
      <header class="profile-header">
        <h1>我的</h1>
      </header>

      <main class="profile-content">
        <article class="profile-card">
          <div class="profile-avatar">
            <van-icon name="contact-o" />
          </div>
          <div>
            <strong>Lily</strong>
            <span>ID: 12345678</span>
          </div>
          <van-icon name="edit" />
        </article>

        <FamilySelector v-model="currentFamilyId" :active-color="themeColor" class="family-panel" />

        <button class="goal-card" type="button" @click="openTargetDialog">
          <div class="goal-title">
            <span><van-icon name="aim" /> 目标体重</span>
            <strong>{{ formatRecordWeight(targetWeight, 1) }} {{ isKG ? 'kg' : '斤' }}</strong>
            <van-icon name="arrow" />
          </div>
          <div class="progress-track">
            <i :style="{ width: `${goalProgress}%` }"></i>
          </div>
          <div class="goal-meta">
            <span>已减重 {{ formatRecordWeight(lostWeight, 1) }} {{ isKG ? 'kg' : '斤' }}</span>
            <span>进度 {{ formatNumber(goalProgress, 0) }}%</span>
          </div>
        </button>

        <section class="settings-block">
          <h2>设置</h2>
          <button class="setting-row" type="button" @click="handleSettingToast">
            <span><van-icon name="bell" /> 提醒设置</span>
            <em>每天 08:00</em>
            <van-icon name="arrow" />
          </button>
          <button class="setting-row" type="button">
            <span><van-icon name="exchange" /> 单位设置</span>
            <em>{{ isKG ? 'kg' : '斤' }}</em>
            <van-switch v-model="isKG" size="20" />
          </button>
          <button class="setting-row" type="button" @click="openHeightDialog">
            <span><van-icon name="manager-o" /> 身高设置</span>
            <em>{{ heightCm }} cm</em>
            <van-icon name="arrow" />
          </button>
          <button class="setting-row" type="button" @click="handleSettingToast">
            <span><van-icon name="upgrade" /> 数据备份</span>
            <em>云端备份</em>
            <van-icon name="arrow" />
          </button>
          <button class="setting-row" type="button" @click="handleSettingToast">
            <span><van-icon name="info-o" /> 关于我们</span>
            <em>V1.0.0</em>
            <van-icon name="arrow" />
          </button>
        </section>
      </main>
    </section>

    <nav class="weight-tabbar safe-padding-bottom">
      <button
        v-for="item in tabItems"
        :key="item.name"
        type="button"
        :class="{ active: activeTab === item.name }"
        @click="activeTab = item.name"
      >
        <van-icon :name="item.icon" />
        <span>{{ item.text }}</span>
      </button>
    </nav>

    <van-calendar
      v-model:show="state.showCalendar"
      :min-date="new Date(2015, 0, 1)"
      :max-date="new Date()"
      :color="themeColor"
      @confirm="handleCalendarConfirm"
    />

    <van-action-sheet v-model:show="showRecordActions" title="体重记录">
      <div class="record-actions">
        <button type="button" @click="editSelectedRecord">编辑记录</button>
        <button class="danger" type="button" @click="removeSelectedRecord">删除记录</button>
      </div>
    </van-action-sheet>

    <van-dialog v-model:show="showTargetDialog" title="目标体重" show-cancel-button @confirm="confirmTarget">
      <van-field v-model="state.targetDraft" type="number" input-align="center" :label="isKG ? 'kg' : '斤'" placeholder="请输入目标体重" />
    </van-dialog>

    <van-dialog v-model:show="showHeightDialog" title="身高设置" show-cancel-button @confirm="confirmHeight">
      <van-field v-model="state.heightDraft" type="number" input-align="center" label="cm" placeholder="请输入身高" />
    </van-dialog>
  </div>
</template>

<style lang="scss" scoped>
.weight-tracker {
  min-height: 100vh;
  background: #f5f8fc;
  color: #172033;
  overflow-x: hidden;
}

.screen {
  min-height: 100vh;
  padding-bottom: calc(86px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

button {
  border: 0;
  font: inherit;
  color: inherit;
  background: none;
}

.plain-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  font-size: 20px;

  &.dark {
    color: #111827;
  }
}

.home-hero {
  min-height: 176px;
  padding: calc(18px + env(safe-area-inset-top)) 20px 28px;
  background: linear-gradient(145deg, #0867ff 0%, #44a8ff 100%);
  color: #fff;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  box-sizing: border-box;
}

.greeting {
  display: flex;
  align-items: center;
  gap: 12px;

  h1 {
    margin: 0 0 4px;
    font-size: 18px;
    line-height: 1.25;
    font-weight: 700;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.82);
  }
}

.avatar,
.profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #fff;
  color: #1976ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 0 8px 18px rgba(22, 91, 202, 0.18);
}

.home-content {
  padding: 0 16px 24px;
  margin-top: -34px;
}

.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.metric-card,
.panel,
.summary-card,
.profile-card,
.goal-card,
.settings-block,
.record-list-panel {
  border: 1px solid rgba(202, 213, 225, 0.72);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 30px rgba(30, 64, 111, 0.08);
}

.metric-card {
  min-height: 144px;
  padding: 18px 14px;
  box-sizing: border-box;
}

.metric-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #556070;
  font-size: 12px;
}

.current-card {
  strong {
    display: block;
    margin-top: 14px;
    font-size: clamp(42px, 13vw, 58px);
    line-height: 1;
    color: #1976ff;
    font-family: "DIN Alternate", sans-serif;
  }

  p {
    margin: 10px 0 0;
    font-size: 12px;
    color: #6b7280;

    span {
      color: #172033;
      font-weight: 700;
    }
  }
}

.bmi-card {
  display: flex;
  align-items: center;
  justify-content: center;
}

.bmi-ring {
  width: 104px;
  height: 104px;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, #fff 0 58%, transparent 60%),
    conic-gradient(#1fb56b 0 28%, #1976ff 28% var(--bmi-percent), #f1604d var(--bmi-percent) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  span,
  em {
    font-size: 12px;
    color: #6b7280;
    font-style: normal;
  }

  strong {
    font-size: 28px;
    line-height: 1.1;
  }

  em {
    color: #21a868;
  }
}

.primary-action,
.save-button {
  width: 100%;
  height: 52px;
  margin: 18px 0;
  border-radius: 26px;
  background: linear-gradient(135deg, #1f7dff, #0f64eb);
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 12px 22px rgba(25, 118, 255, 0.26);

  &:disabled {
    opacity: 0.55;
    box-shadow: none;
  }
}

.panel,
.record-list-panel {
  padding: 14px;
  margin-top: 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  span {
    color: #6b7280;
    font-size: 12px;
  }
}

.mini-chart,
.large-chart {
  height: 150px;
  margin-top: 8px;

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
}

.grid-line {
  stroke: #e5ebf3;
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.trend-line {
  fill: none;
  stroke: #1976ff;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.point-dot {
  fill: #fff;
  stroke: #1976ff;
  stroke-width: 2.2;

  &.high {
    stroke: #f04438;
  }

  &.low {
    stroke: #16a34a;
  }
}

.point-label,
.axis-label {
  font-size: 10px;
  fill: #475569;
}

.point-label.high {
  fill: #f04438;
}

.point-label.low {
  fill: #16a34a;
}

.axis-label {
  fill: #798291;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.summary-card {
  min-height: 104px;
  padding: 14px 8px;
  text-align: center;
  box-sizing: border-box;

  span,
  em {
    display: block;
    color: #6b7280;
    font-size: 12px;
    font-style: normal;
  }

  strong {
    display: block;
    margin: 10px 0 4px;
    font-size: 24px;
  }
}

.page-header,
.profile-header {
  height: 58px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;

  h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
}

.record-content,
.stats-content,
.profile-content {
  padding: 12px 16px 24px;
}

.field-label {
  margin-bottom: 8px;
  color: #3f4958;
  font-size: 13px;
}

.date-select {
  width: 100%;
  height: 48px;
  border: 1px solid #dce5ef;
  border-radius: 8px;
  background: #fff;
  color: #1976ff;
  display: grid;
  grid-template-columns: 24px 1fr auto 20px;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  box-sizing: border-box;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  em {
    color: #94a3b8;
    font-size: 12px;
    font-style: normal;
  }
}

.record-value {
  margin: 24px 0 16px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;

  strong {
    color: #1976ff;
    font-size: clamp(64px, 20vw, 88px);
    line-height: 1;
    font-family: "DIN Alternate", sans-serif;
  }

  span {
    color: #556070;
    font-size: 18px;
  }
}

.weight-scale {
  height: 24px;
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 8px;
  color: #b6c0cf;

  span {
    width: 1px;
    height: 10px;
    background: currentColor;
  }

  .major {
    height: 18px;
    background: #1976ff;
  }
}

.scale-labels {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  color: #556070;
  font-size: 11px;
  text-align: center;
  margin: 4px 0 20px;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;

  button {
    height: 52px;
    border: 1px solid #dfe7f1;
    border-radius: 8px;
    background: #fff;
    font-size: 24px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(30, 64, 111, 0.04);

    &:active {
      background: #eef5ff;
    }
  }
}

.note-box {
  display: block;
  margin-top: 18px;

  span {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    color: #3f4958;
  }

  textarea {
    width: 100%;
    min-height: 78px;
    border: 1px solid #dce5ef;
    border-radius: 8px;
    resize: none;
    padding: 12px;
    box-sizing: border-box;
    outline: none;
    color: #172033;
    background: #fff;
  }

  em {
    display: block;
    margin-top: -24px;
    padding-right: 12px;
    text-align: right;
    color: #94a3b8;
    font-size: 12px;
    font-style: normal;
    pointer-events: none;
  }
}

.range-tabs {
  height: 36px;
  padding: 3px;
  border-radius: 8px;
  background: #e9eef6;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;

  button {
    border-radius: 8px;
    color: #475569;

    &.active {
      color: #fff;
      background: #1976ff;
      font-weight: 700;
      box-shadow: 0 6px 12px rgba(25, 118, 255, 0.22);
    }
  }
}

.legend {
  display: flex;
  gap: 10px;
  white-space: nowrap;

  .high::before,
  .low::before {
    content: '';
    width: 5px;
    height: 5px;
    display: inline-block;
    margin-right: 4px;
    border-radius: 50%;
    vertical-align: 1px;
  }

  .high::before {
    background: #f04438;
  }

  .low::before {
    background: #16a34a;
  }
}

.record-list-panel {
  h2 {
    margin: 0 0 12px;
    font-size: 15px;
  }
}

.record-row {
  width: 100%;
  min-height: 42px;
  display: grid;
  grid-template-columns: 1fr auto 18px;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #edf1f7;
  text-align: left;

  &:last-child {
    border-bottom: 0;
  }

  span {
    font-size: 13px;
    color: #3f4958;

    em {
      margin-left: 8px;
      color: #8792a2;
      font-style: normal;
    }
  }

  strong {
    color: #1976ff;
  }
}

.profile-header {
  justify-content: center;
  color: #fff;
  background: linear-gradient(145deg, #0867ff 0%, #44a8ff 100%);
}

.profile-content {
  background: linear-gradient(180deg, #44a8ff 0, #f5f8fc 162px);
}

.profile-card {
  min-height: 96px;
  display: grid;
  grid-template-columns: 58px 1fr 24px;
  align-items: center;
  gap: 12px;
  padding: 16px;
  box-sizing: border-box;

  strong,
  span {
    display: block;
  }

  strong {
    margin-bottom: 6px;
    font-size: 20px;
  }

  span {
    color: #6b7280;
    font-size: 12px;
  }
}

.family-panel {
  margin-top: 14px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 12px 30px rgba(30, 64, 111, 0.08);
}

.goal-card {
  width: 100%;
  margin-top: 14px;
  padding: 16px;
  text-align: left;
  box-sizing: border-box;
}

.goal-title,
.goal-meta {
  display: grid;
  grid-template-columns: 1fr auto 16px;
  align-items: center;
  gap: 8px;
}

.goal-title {
  span {
    color: #172033;
    font-weight: 600;

    .van-icon {
      color: #1976ff;
      margin-right: 6px;
    }
  }

  strong {
    color: #556070;
    font-size: 14px;
  }
}

.progress-track {
  height: 6px;
  margin: 16px 0 12px;
  border-radius: 999px;
  background: #e8edf5;
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    min-width: 4px;
    border-radius: inherit;
    background: linear-gradient(90deg, #1976ff, #1fb56b);
  }
}

.goal-meta {
  grid-template-columns: 1fr auto;
  color: #6b7280;
  font-size: 12px;
}

.settings-block {
  margin-top: 18px;
  padding: 14px 0;

  h2 {
    margin: -2px 16px 10px;
    font-size: 14px;
    color: #3f4958;
  }
}

.setting-row {
  width: 100%;
  min-height: 46px;
  padding: 0 16px;
  display: grid;
  grid-template-columns: 1fr auto 18px;
  align-items: center;
  gap: 10px;
  text-align: left;
  border-top: 1px solid #edf1f7;

  span {
    color: #243041;

    .van-icon {
      color: #1976ff;
      margin-right: 8px;
    }
  }

  em {
    color: #7d8795;
    font-size: 13px;
    font-style: normal;
  }
}

.weight-tabbar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 10px;
  height: 62px;
  padding: 6px 10px;
  border: 1px solid rgba(202, 213, 225, 0.82);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.96);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  z-index: 5;
  box-sizing: border-box;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(14px);

  button {
    border-radius: 22px;
    color: #758195;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 11px;

    .van-icon {
      font-size: 20px;
    }

    &.active {
      color: #1976ff;
      background: #eef5ff;
      font-weight: 700;
    }
  }
}

.record-actions {
  padding: 8px 16px calc(16px + env(safe-area-inset-bottom));

  button {
    width: 100%;
    height: 48px;
    border-radius: 8px;
    font-weight: 600;

    &:active {
      background: #f5f8fc;
    }
  }

  .danger {
    color: #ee0a24;
  }
}

@media (min-width: 560px) {
  .weight-tracker {
    max-width: 430px;
    margin: 0 auto;
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
  }

  .weight-tabbar {
    left: calc(50% - 203px);
    right: calc(50% - 203px);
  }
}
</style>
