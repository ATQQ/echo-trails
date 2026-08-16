import { useLocalStorage } from '@vueuse/core'
import { watch, type Ref } from 'vue'

// 模块级单例：跨组件共享同一个 vConsole 实例与开关状态
let vConsoleInstance: any = null
let initialized = false
let enabledRef: Ref<boolean> | null = null

const POSITION_KEY = 'debug.vconsole.position'

interface SwitchPosition {
  left: number
  top: number
}

function clampToViewport(
  left: number,
  top: number,
  width: number,
  height: number
): SwitchPosition {
  return {
    left: Math.min(Math.max(left, 0), Math.max(window.innerWidth - width, 0)),
    top: Math.min(Math.max(top, 0), Math.max(window.innerHeight - height, 0)),
  }
}

function applyPosition(el: HTMLElement, pos: SwitchPosition) {
  el.style.left = `${pos.left}px`
  el.style.top = `${pos.top}px`
  el.style.right = 'auto'
  el.style.bottom = 'auto'
}

function savePosition(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  try {
    localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({ left: rect.left, top: rect.top })
    )
  } catch {}
}

function restorePosition(el: HTMLElement) {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    if (!raw) return
    const pos = JSON.parse(raw) as Partial<SwitchPosition>
    if (typeof pos.left !== 'number' || typeof pos.top !== 'number') return
    applyPosition(el, clampToViewport(pos.left, pos.top, el.offsetWidth, el.offsetHeight))
  } catch {}
}

/**
 * 让 vConsole 悬浮按钮支持拖动（Pointer Events，PC/移动端通用）
 * - 点击（位移 < 5px）保持原有开/关面板行为
 * - 拖动后位置持久化到 localStorage，重新打开时恢复
 */
function makeSwitchDraggable(container: HTMLElement) {
  const switchEl = container.querySelector<HTMLElement>('.vc-switch')
  if (!switchEl) return

  // 让 pointermove 接管触摸拖动，避免移动端拖动时触发页面滚动
  switchEl.style.touchAction = 'none'

  restorePosition(switchEl)

  // 视口尺寸变化时把悬浮按钮拉回可见区域
  const onResize = () => {
    if (!switchEl.isConnected) {
      window.removeEventListener('resize', onResize)
      return
    }
    if (switchEl.style.left) {
      applyPosition(
        switchEl,
        clampToViewport(
          parseFloat(switchEl.style.left),
          parseFloat(switchEl.style.top),
          switchEl.offsetWidth,
          switchEl.offsetHeight
        )
      )
    }
  }
  window.addEventListener('resize', onResize)

  let dragging = false
  let moved = false
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0

  const onPointerDown = (e: PointerEvent) => {
    // 仅响应主键/触摸，避免影响其它交互
    if (e.button !== 0) return
    dragging = true
    moved = false
    startX = e.clientX
    startY = e.clientY
    const rect = switchEl.getBoundingClientRect()
    originLeft = rect.left
    originTop = rect.top
    e.preventDefault()
    switchEl.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    // 位移阈值：区分点击与拖动
    if (!moved && Math.hypot(dx, dy) < 5) return
    moved = true
    const pos = clampToViewport(
      originLeft + dx,
      originTop + dy,
      switchEl.offsetWidth,
      switchEl.offsetHeight
    )
    applyPosition(switchEl, pos)
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    try {
      switchEl.releasePointerCapture(e.pointerId)
    } catch {}
    if (moved) {
      savePosition(switchEl)
      // 吞掉拖动结束时的一次 click，避免误开面板
      switchEl.addEventListener(
        'click',
        (ev) => {
          ev.stopPropagation()
          ev.preventDefault()
        },
        { capture: true, once: true }
      )
    }
  }

  switchEl.addEventListener('pointerdown', onPointerDown)
  switchEl.addEventListener('pointermove', onPointerMove)
  switchEl.addEventListener('pointerup', onPointerUp)
  switchEl.addEventListener('pointercancel', onPointerUp)
}

async function syncVConsole() {
  if (enabledRef?.value) {
    if (!vConsoleInstance) {
      try {
        const VConsole = (await import('vconsole')).default
        vConsoleInstance = new VConsole()
        const container = document.getElementById('__vconsole')
        if (container) {
          makeSwitchDraggable(container)
        }
      } catch (e) {
        console.error('[vConsole] 加载失败', e)
      }
    }
  } else if (vConsoleInstance) {
    try {
      vConsoleInstance.destroy()
    } catch {}
    vConsoleInstance = null
  }
}

/**
 * vConsole 调试控制台开关
 * - DEV 环境默认开启，production 默认关闭
 * - 开关状态持久化到 localStorage('debug.vconsole')
 * - 切换即时生效：开则动态 import 并实例化，关则 destroy
 */
export function useVConsole() {
  if (!enabledRef) {
    enabledRef = useLocalStorage<boolean>('debug.vconsole', !!import.meta.env.DEV)
  }
  if (!initialized) {
    initialized = true
    watch(enabledRef, syncVConsole, { immediate: true })
  }
  return { enabled: enabledRef }
}
