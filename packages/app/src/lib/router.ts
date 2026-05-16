import { onActivated, onBeforeUnmount, onDeactivated, isRef } from "vue";
import { onBeforeRouteLeave } from "vue-router";

export type BackHandler = () => boolean;
const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler) {
  let registered = false;

  const register = () => {
    if (registered) return;
    handlers.push(handler);
    registered = true;
  };

  const unregister = () => {
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    registered = false;
  };

  register();

  onActivated(register);
  onDeactivated(unregister);
  onBeforeUnmount(unregister);

  return unregister;
}

export function executeBackHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const handler = handlers[i];
    if (handler()) return true;
  }
  return false;
}

export function preventBack(value: any, key = 'value') {
  let isActive = true;

  const handler = () => {
    if (!isActive) return false;

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

  onActivated(() => {
    isActive = true;
  });
  onDeactivated(() => {
    isActive = false;
  });

  onBeforeRouteLeave((to, from, next) => {
    if (handler()) {
      next(false);
    } else {
      next();
    }
  });
}
