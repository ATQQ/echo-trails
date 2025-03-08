import type { Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

export function preventBack(value: any, key = 'value'){
  onBeforeRouteLeave((to, from, next) => {
    if (value[key]) {
      value[key] = false;
      next(false);
    } else {
      next();
    }
  });
}
