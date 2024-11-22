import type { Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

export function preventBack(value: Ref<boolean>){
  onBeforeRouteLeave((to, from, next) => {
    if (value.value) {
      value.value = false;
      next(false);
    } else {
      next();
    }
  });
}
