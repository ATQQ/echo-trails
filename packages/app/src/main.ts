import 'vant/es/toast/style';
import 'vant/es/image-preview/style'
import 'vant/es/notify/style'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Lazyload, ImagePreview } from 'vant';
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Lazyload)
app.use(ImagePreview)
app.mount('#app')
