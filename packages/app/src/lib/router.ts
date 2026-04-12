import { onBeforeUnmount, isRef } from "vue";
import { onBeforeRouteLeave } from "vue-router";

export type BackHandler = () => boolean;
const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler) {
  handlers.push(handler);
  onBeforeUnmount(() => {
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  });
}

export function executeBackHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const handler = handlers[i];
    if (handler()) return true;
  }
  return false;
}

export function preventBack(value: any, key = 'value') {
  const handler = () => {
    const isShowing = isRef(value) ? value.value : value[key];
    if (isShowing) {
      if (isRef(value)) {
        value.value = false;
      } else {
        value[key] = false;
      }
      return true;
    }
    return false;
  };

  registerBackHandler(handler);

  onBeforeRouteLeave((to, from, next) => {
    if (handler()) {
      next(false);
    } else {
      next();
    }
  });
}
