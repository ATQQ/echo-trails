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

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Lazyload)
app.use(ImagePreview)

login().then(() => {
  app.mount('#app')
})
