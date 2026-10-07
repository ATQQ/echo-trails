import { onBeforeUnmount, onMounted, ref, watch, unref, type Ref } from 'vue';
import Sortable from 'sortablejs';

export interface UseEventSortableOptions {
  /** 拖动排序结束：按 DOM 里的新顺序回传事件 id */
  onReorder: (orderedIds: string[]) => void;
  /** 触摸端长按但没移动就松手：打开管理菜单 */
  onLongPress?: (id: string) => void;
  /** 可拖动元素选择器，默认按 data-event-id 取 */
  itemSelector?: string;
  /** 关闭排序（例如列表为空时） */
  disabled?: Ref<boolean> | (() => boolean);
}

/**
 * 把原型里验证过的拖拽收尾逻辑封装成 composable：
 * - delay 260ms / 仅触摸端长按触发 / forceFallback + fallbackOnBody 跟手
 * - 拖拽结束后只挡一次「幽灵 click」，下一次 pointerdown 自动解除
 * - 每次渲染后清掉没有归属的 `.sortable-fallback` 克隆，避免卡片卡在屏幕里
 */
export function useEventSortable(
  getContainer: () => HTMLElement | null,
  options: UseEventSortableOptions,
) {
  const itemSelector = options.itemSelector ?? '[data-event-id]';

  /** 拖拽结束时置为 true，用来吞掉浏览器/Sortable 补发的那一次点击 */
  const dragEndGuard = ref(false);

  let sortable: Sortable | null = null;
  let dragPick: { id: string; moved: boolean } | null = null;
  let downPoint: { x: number; y: number } | null = null;
  let lastPointerType = 'mouse';
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  const sortableActive = () => !!(Sortable as unknown as { active?: Sortable }).active;
  const isDisabled = () =>
    typeof options.disabled === 'function' ? options.disabled() : !!unref(options.disabled);

  /** 兜底清理：拖拽克隆挂在 body 上，任何异常路径下都要能被移除 */
  function cleanupOrphanDrag() {
    if (sortableActive()) return;
    forceRemoveDragArtifacts();
  }

  /** 无视拖拽状态，强制移除克隆与 body 上的拖拽标记 */
  function forceRemoveDragArtifacts() {
    document.querySelectorAll('.sortable-fallback').forEach((node) => node.parentNode?.removeChild(node));
    document.body.classList.remove('is-dragging');
  }

  function flushAfterDrag() {
    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => {
      cleanupTimer = null;
      cleanupOrphanDrag();
    }, 60);
  }

  // SortableJS 在触屏 fallback 模式下会用内部标记吞掉拖拽后的第一次 click。
  // 如果浏览器没补发那次 click，标记就会留下把用户下一次真实点击吃掉。
  // 主动派发一个不冒泡到业务逻辑的 click，让它把标记消费掉。
  function flushSortableClickSwallow() {
    try {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } catch {
      const evt = document.createEvent('MouseEvents');
      evt.initEvent('click', true, true);
      document.dispatchEvent(evt);
    }
  }

  function markDragEnd() {
    dragEndGuard.value = true;
    if (lastPointerType !== 'mouse') flushSortableClickSwallow();
  }

  function applyOrderFromDom(el: HTMLElement) {
    const ids = Array.from(el.querySelectorAll<HTMLElement>(itemSelector))
      .map((node) => node.dataset.eventId || '')
      .filter(Boolean);
    if (ids.length) options.onReorder(ids);
  }

  function destroy(force = false) {
    if (!sortable) return;
    const active = (Sortable as unknown as { active?: Sortable }).active;
    // 正常刷新时拖动中不销毁实例；强制卸载时仍然收尾，避免克隆留在 body 上
    if (!force && active && active === sortable) return;
    try {
      sortable.destroy();
    } catch {
      /* 已经销毁过就忽略 */
    }
    sortable = null;
    if (force) forceRemoveDragArtifacts();
  }

  function init() {
    destroy();
    const el = getContainer();
    if (!el || isDisabled()) return;
    if (!el.querySelector(itemSelector)) return;

    sortable = Sortable.create(el, {
      draggable: itemSelector,
      animation: 220,
      // 回弹曲线：让让位的卡片带一点过冲，避免生硬
      easing: 'cubic-bezier(.34,1.56,.64,1)',
      delay: 260,
      delayOnTouchOnly: true,
      touchStartThreshold: 3,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 2,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      fallbackClass: 'sortable-fallback',
      onChoose: (evt) => {
        const item = evt.item as HTMLElement;
        dragPick = { id: item.dataset.eventId || '', moved: false };
        try {
          navigator.vibrate?.(12);
        } catch {
          /* 部分环境不支持震动 */
        }
      },
      onStart: () => {
        document.body.classList.add('is-dragging');
        // fallback 克隆挂在 body 上，补上作用域类让内部样式与设计令牌生效
        document.querySelector('.sortable-fallback')?.classList.add('ev-scope');
      },
      onUnchoose: () => {
        const picked = dragPick;
        dragPick = null;
        document.body.classList.remove('is-dragging');
        if (picked) {
          // 触摸端长按原地松手 = 打开管理菜单；鼠标端保持单击即记录
          if (!picked.moved && lastPointerType !== 'mouse' && picked.id) {
            const id = picked.id;
            window.setTimeout(() => options.onLongPress?.(id), 0);
          }
          if (lastPointerType !== 'mouse' || picked.moved) markDragEnd();
        }
        flushAfterDrag();
      },
      onEnd: (evt) => {
        document.body.classList.remove('is-dragging');
        applyOrderFromDom(evt.from as HTMLElement);
        if (evt.oldIndex !== evt.newIndex) markDragEnd();
        flushAfterDrag();
      },
    });
  }

  function onPointerDown(e: PointerEvent) {
    lastPointerType = e.pointerType || 'mouse';
    // 下一次按下就解除幽灵 click 拦截，用户后面真正想点的操作不受影响
    dragEndGuard.value = false;
    downPoint = { x: e.clientX, y: e.clientY };
  }

  // 用真实位移判断「这次到底是点击还是拖动」，比 Sortable 的 onStart 更准
  function onPointerMove(e: PointerEvent) {
    if (!dragPick || dragPick.moved || !downPoint) return;
    if (Math.abs(e.clientX - downPoint.x) > 8 || Math.abs(e.clientY - downPoint.y) > 8) {
      dragPick.moved = true;
    }
  }

  // 兜底：手指 / 鼠标离开后若还有残留克隆或未落地的状态，强制清干净，避免卡片卡死
  function onPointerRelease() {
    window.setTimeout(() => {
      if (dragPick) {
        dragPick = null;
        document.body.classList.remove('is-dragging');
      }
      if (sortableActive()) return;
      if (document.querySelector('.sortable-fallback')) cleanupOrphanDrag();
    }, 400);
  }

  onMounted(() => {
    init();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    ['pointerup', 'touchend', 'pointercancel', 'touchcancel'].forEach((type) =>
      document.addEventListener(type, onPointerRelease, true),
    );
  });

  onBeforeUnmount(() => {
    if (cleanupTimer) clearTimeout(cleanupTimer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    ['pointerup', 'touchend', 'pointercancel', 'touchcancel'].forEach((type) =>
      document.removeEventListener(type, onPointerRelease, true),
    );
    destroy(true);
  });

  // 容器元素变化（手机网格 <-> 桌面左栏、列表从空到有）时重建实例
  watch(getContainer, () => init(), { flush: 'post' });

  return {
    dragEndGuard,
    refresh: init,
    cleanup: cleanupOrphanDrag,
  };
}
