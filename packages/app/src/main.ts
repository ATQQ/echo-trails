import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Lazyload } from 'vant';
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Lazyload)
app.mount('#app')
