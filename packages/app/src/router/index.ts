import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AlbumView from '../views/AlbumView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'album',
      component: AlbumView,
      meta: {
        keepAlive: true,
        nav: true,
        componentName: 'AlbumView'
      }
    },
    {
      path: '/home',
      name: 'home',
      component: HomeView,
      meta: {
        keepAlive: true,
        nav: true,
        componentName: 'HomeView'
      }
    },
    {
      path: '/discovery',
      name: 'discovery',
      component: () => import('../views/DiscoveryView.vue'),
      meta: {
        keepAlive: true,
        nav: true,
        componentName: 'DiscoveryView'
      }
    },
    {
      path: '/weight-record',
      name: 'weight',
      component: () => import('../views/WeightView.vue'),
      meta: {
        keepAlive: false,
        nav: false,
        componentName: 'WeightView'
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
      path: '/set',
      name: 'set',
      component: () => import('../views/SetView.vue'),
      meta: {
        keepAlive: false,
        nav: false,
        componentName: 'SetView'
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
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: {
        keepAlive: false,
        componentName: 'LoginView',
        nav: false
      }
    },
    {
      path: '/delete',
      name: 'delete',
      component: () => import('../views/DeleteView.vue'),
      meta: {
        keepAlive: false,
        componentName: 'DeleteView',
        nav: false
      }
    },
    {
      path: '/manage',
      name: 'manage',
      component: () => import('../views/ManageView.vue'),
      meta: {
        keepAlive: false,
        componentName: 'ManageView',
        nav: false
      }
    },
    {
      path: '/manage/accounts',
      name: 'manage-accounts',
      component: () => import('../views/AccountListView.vue'),
      meta: {
        keepAlive: false,
        componentName: 'AccountListView',
        nav: false
      }
    }
  ],
})

export default router
