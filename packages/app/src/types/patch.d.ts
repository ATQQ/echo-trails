import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    keepAlive?: boolean
    componentName?: string
    nav?: boolean
  }
}
