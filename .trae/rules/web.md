---
alwaysApply: false
description: 编写前端Web相关页面时，请参照如下代码规则
---


## 顶部的安全区
如果使用`van-nav-bar`组件+fixed+placeholder，需要追加样式
```css
.van-nav-bar__placeholder>:deep(.van-nav-bar--fixed){
  padding-top: var(--safe-area-top);
}
```
如果是其它内容，请添加class `safe-padding-top`

## 底部的导航

使用实现的组件 `BottomActions.vue`