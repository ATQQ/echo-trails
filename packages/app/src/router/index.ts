import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AlbumView from '../views/AlbumView.vue'
import { executeBackHandlers } from '../lib/router'

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
        // keepAlive: true,
        // nav: true,
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
      path: '/album/all',
      name: 'album-all',
      component: () => import('../views/AllAlbumView.vue'),
      meta: {
        keepAlive: true,
        nav: false,
        componentName: 'AllAlbumView'
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
      path: '/tool/s3-qr',
      name: 's3-qr',
      component: () => import('../views/tool/S3QrToolView.vue'),
      meta: {
        keepAlive: false,
        componentName: 'S3QrToolView',
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
      path: '/blood-pressure',
      name: 'blood-pressure',
      component: () => import('../views/BloodPressureView/BloodPressureView.vue'),
      meta: {
        keepAlive: false,
        nav: false,
        componentName: 'BloodPressureView'
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
    },
    {
      path: '/manage/cache',
      name: 'manage-cache',
      component: () => import('../views/CacheManageView.vue'),
      meta: {
        keepAlive: false,
        componentName: 'CacheManageView',
        nav: false
      }
    },
    {
      path: '/video',
      name: 'video',
      component: () => import('../views/VideoView.vue'),
      meta: {
        keepAlive: true,
        nav: false,
        componentName: 'VideoView'
      }
    },
    {
      path: '/memorial',
      name: 'memorial',
      component: () => import('../views/memorial/MemorialList.vue'),
      meta: {
        keepAlive: false,
        nav: false,
        componentName: 'MemorialList'
      }
    },
    {
      path: '/asset',
      name: 'asset',
      component: () => import('../views/asset/AssetLayout.vue'),
      redirect: '/asset/list',
      children: [
        {
          path: 'timeline',
          name: 'asset-timeline',
          component: () => import('../views/asset/AssetTimeline.vue'),
          meta: { nav: false }
        },
        {
          path: 'list',
          name: 'asset-list',
          component: () => import('../views/asset/AssetList.vue'),
          meta: { nav: false }
        },
        {
          path: 'stats',
          name: 'asset-stats',
          component: () => import('../views/asset/AssetStats.vue'),
          meta: { nav: false }
        },
        {
          path: 'manage',
          name: 'asset-manage',
          component: () => import('../views/asset/AssetManage.vue'),
          meta: { nav: false }
        }
      ]
    }
  ]
})

// 添加全局前置守卫，拦截路由跳转以处理弹窗后退
router.beforeEach((to, from, next) => {
  if (executeBackHandlers()) {
    next(false) // 有弹窗打开时拦截跳转，交由 handler 关闭弹窗
  } else {
    next()
  }
})

export default router
