import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        keepAlive: true,
        componentName: 'HomeView'
      }
    },
    {
      path: '/album',
      name: 'album',
      component: () => import('../views/AlbumView.vue'),
      meta: {
        keepAlive: true,
        componentName: 'AlbumView'
      }
    },
  ],
})

export default router
