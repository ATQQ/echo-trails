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
        nav: true,
        componentName: 'HomeView'
      }
    },
    {
      path: '/album',
      name: 'album',
      component: () => import('../views/AlbumView.vue'),
      meta: {
        keepAlive: true,
        nav: true,
        componentName: 'AlbumView'
      }
    },
    {
      path: '/like',
      name: 'like',
      component: () => import('../views/LikeView.vue'),
      meta: {
        keepAlive: true,
        nav: true,
        componentName: 'LikeView'
      }
    },
    {
      path: '/album/:albumId',
      name: 'album-photo',
      component: () => import('../views/AlbumPhotoView.vue'),
      meta: {
        keepAlive: false,
        componentName: 'AlbumPhotoView',
        nav: false
      }
    },
  ],
})

export default router
