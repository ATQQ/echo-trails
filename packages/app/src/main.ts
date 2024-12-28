import 'vant/es/toast/style';
import 'vant/es/image-preview/style'
import 'vant/es/notify/style'
import 'vant/es/dialog/style'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Lazyload, ImagePreview } from 'vant';
import App from './App.vue'
import router from './router'
import { login } from './lib/login';
import { isTauri } from './constants';

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Lazyload)
app.use(ImagePreview)

if (import.meta.env.DEV && isTauri) {
  // 动态插入vsconsole
  const vconsole = document.createElement('script');
  vconsole.src = 'https://unpkg.com/vconsole@latest/dist/vconsole.min.js';
  document.body.appendChild(vconsole);
  vconsole.onload = () => {
    new window.VConsole();
  }
}

if (isTauri) {
  // iOS
  const ua = navigator.userAgent.toLowerCase();
  const isIos = ua.indexOf('iphone') !== -1 || ua.indexOf('ipad') !== -1
  const style = document.createElement('style')
  if (isIos) {
    style.textContent = `
        .safe-padding-top {
          padding-top: constant(safe-area-inset-top); /* 兼容 iOS < 11.2 */
          padding-top: env(safe-area-inset-top); /* 兼容 iOS >= 11.2 */
        }
      `
  } else {
    style.textContent = `
        .safe-padding-top {
          padding-top: 30px;
        }
      `
  }
  document.head.appendChild(style)
}

login().then(() => {
  app.mount('#app')
})
