import 'vant/es/toast/style';
import 'vant/es/image-preview/style'
import 'vant/es/notify/style'
import 'vant/es/dialog/style'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Lazyload, ImagePreview } from 'vant';
import App from './App.vue'
import router from './router'
import { goLogin, login } from './lib/login';
import { isTauri } from './constants';
import { PromiseWithResolver } from './lib/util';
import { attachConsole } from '@tauri-apps/plugin-log'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Lazyload)
app.use(ImagePreview)

async function presetTauriMode() {
  const { promise, resolve } = PromiseWithResolver()
  if (!isTauri) {
    resolve({})
    return promise
  }
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
            .safe-padding-bottom {
              padding-bottom: constant(safe-area-inset-bottom); /* 兼容 iOS < 11.2 */
              padding-bottom: env(safe-area-inset-bottom); /* 兼容 iOS >= 11.2 */
            }
            .van-popup{
              padding-top: calc(8px + constant(safe-area-inset-top));
              padding-top: calc(8px + env(safe-area-inset-top));
              padding-bottom: 8px;
            }
            .van-dialog {
              padding: 0;
            }

            .van-toast{
              padding: 10px;
            }
          `
  } else {
    style.textContent = `
            .safe-padding-top {
              padding-top: 30px;
            }
            .safe-padding-bottom {
              padding-bottom: 16px;
            }
            .van-popup{
              padding-top: 38px;
            }
            .van-dialog {
              padding: 0;
            }

            .van-toast{
              padding: 10px;
            }
          `
  }
  document.head.appendChild(style)

  // TODO：其它开关
  if (import.meta.env.DEV) {
    // 动态插入vsconsole
    const vconsole = document.createElement('script');
    vconsole.src = 'https://unpkg.com/vconsole@latest/dist/vconsole.min.js';
    document.body.appendChild(vconsole);
    vconsole.onload = () => {
      resolve({})
      new window.VConsole();
    }
    vconsole.onerror = () => {
      resolve({})
      alert('vconsole加载失败')
    }
  } else {
    resolve({})
  }

  // TODO: 夜间模式适配
  // TODO: 桥获取真实高度

  // log
  // 启用 TargetKind::Webview 后，这个函数将把日志打印到浏览器控制台
  if(isTauri && import.meta.env.DEV){
    await attachConsole();
  }

  return promise
}

presetTauriMode().then(() => {
  login().then(() => {
    app.mount('#app')
  }).catch(() => {
    goLogin()
  })
})


