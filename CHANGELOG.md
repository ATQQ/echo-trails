# Changelog
## 0.9.1

### Feature
- 新增体重记录时间展示并优化趋势图排序
- 为导航和网格项新增自定义内联 SVG 图标支持

### Bug Fixes
- 修复多场景下加载屏无法正常隐藏的问题

## 0.9.0

### Feature
- 添加回收站功能及桌面端优化

### Bug Fixes
- 适配安卓Tauri WebView的安全区域内边距

### Refactor
- add preload cache and safe-area padding

### Other
- 调整相册页面小卡片网格布局适配不同屏幕

## 0.8.6

### Feature
- 实现文件选择、批量操作与上传管理功能
- 替换文件图标为自定义文件夹图标
- add file preview function for drive files

### Bug Fixes
- update z-index and improve macOS drag region support

## 0.8.5

### Refactor
- 重构APK下载校验逻辑，优化缓存处理

### Build
- add version check for release workflow
- 为版本校验步骤添加bash shell指定

## 0.8.4

### Bug Fixes
- 检查安装包可用性后再提示更新

### Build
- 修复更新产物文件名导致的404问题

### Chore
- 更新依赖版本并调整版本检查源顺序

## 0.8.3

### Feature
- 新增四象限待办与云盘文件管理功能

### Bug Fixes
- 兼容非安全上下文环境生成UUID

### Documentation
- update README support feature checklist

### Build
- add Release workflow for multi-platform builds

## 0.8.2

### Chore
- simplify release workflow and update tauri configuration

## 0.8.2-beta.0

### Feature
- add desktop app support and refine cross-platform logic
- add responsive layout support for desktop and large screens
- add keyboard and mouse wheel shortcuts, improve desktop interaction
- add audio browsing and playback feature
- add local video cache support
- 实现桌面端自动更新功能，重构更新逻辑
- add vConsole debug switch and auth store
- add clear all cache support and improve config switching flow
- add Kite configuration files and update deployment scripts
- enhance desktop build support for Linux and update workflows

### Bug Fixes
- 调整本地开发IP与桌面端相册页面样式
- 拦截非输入元素的Backspace键防止误触发后退
- 在独立 job 中基于 main 创建 APK MD5 PR
- 用 BMP ICO 修 Windows 构建，Linux updater 改用 AppImage

### Refactor
- add desktop layout support and responsive design
- 优化页面样式与组件配置
- 统一复用添加按钮组件并优化桌面端样式
- 实现相册网格响应式布局
- 重构桌面端布局适配逻辑
- 优化桌面端布局与开发配置
- 改用ref让currentMode成为响应式变量

### Build
- 移除aab包的上传配置
- add desktop build scripts and improve release workflow

### Chore
- update build scripts and workflows for improved desktop support

### Other
- style & refactor: 优化侧边栏折叠状态适配与弹窗样式
- 重构侧边导航适配与页面布局

## 0.8.1

### Bug Fixes
- 修复照片上传后列表不立即展示的问题

### Refactor
- 简化 EXIF 处理逻辑并优化照片/视频上传进度展示

## 0.8.0

### Feature
- 新增「相册文件夹」分类能力
- 优化相册分类详情页布局与交互
- 相册分类支持长按多选批量删除/移出
- 移除体重滑动微调功能并优化相册文件夹页面
- 新增 Live Photo 支持，预览时可播放关联视频
- 优化 Live Photo 列表标识、预览标签与交互
- Live Photo 标签点击播放/暂停，暂停时保留当前帧
- 新增并发下载队列，优化相册解析和错误处理
- 优化上传重复文件提示的遮罩颜色并支持点击临时预览
- 图片和视频重复时添加全部取消功能
- 新增免扫码登录、优化时间解析与下载目录
- 纪念日样式优化
- 优化相册与文件夹编辑弹窗交互

### Bug Fixes
- 修复本地相册分类表缺失
- 修复 Live Photo 预览缩放误触与视频对齐问题
- 修复动态照片标签点击无法暂停的问题
- 完善 showOnAlbumHome 在服务端与 Rust 侧的持久化

### Chore
- 更新安卓应用版本下载链接至新 CDN 域名

## 0.7.10

### Feature
- 最近趋势增加图表工具条
- 隐藏最近趋势工具条并改为图标入口
- 启用 Rust release 符号裁剪
- 验证精简 Tauri HTTP 插件默认特性

### Bug Fixes
- 优化新版体重页默认家人与趋势图
- 优化纪念日预览文字可读性
- 修复纪念日预览顶部工具条不可点击

### Performance
- 压缩 release APK 内 native so
- 开启 release 资源瘦身
- 精简 native S3 presign HTTP client
- 移除 native aws-sdk-s3 预签名依赖

## 0.7.9

### Feature
- 调整体重入口、趋势数据与记录弹窗布局
- 完善资产与纪念日本地模式，内置封面本地化

### Bug Fixes
- 优化视频预览工具栏交互与倍速控制
- 统一视频预览顶部工具栏为白色
- 收紧视频预览顶部工具条样式
- 修复纪念日详情页全屏切换内容抖动
- 优化资产页底部菜单切换闪烁

## 0.7.8
### Feature
* 添加新的体重记录页
* 数据录入逻辑优化
* 全部相册支持标签筛选

## 0.7.7
### Feature
* 支持相册搜索
* 本地模式相册相关优化
* 删除照片优化
* 相册选择弹窗重构优化
* 体重录入优化

### Bugfixed
* 底部菜单遮挡问题
* 回收站导致页面白屏问题

## 0.7.6
### Feature
- 减小App 体积

## 0.7.5
### Feature
- 上传问题,本地模式初步支持

## 0.7.4
### Bug Fixes
- 修复上传进度显示异常，时间获取异常，首次访问图片闪烁等问题

## 0.7.3
### Feature
- 版本检查优化
- 图片预览优化

## 0.7.2
### Feature
- 血压支持本地缓存加载
- 支持横向滑动切换
- logo 调整

### Bug Fixes
- 修复相册排序与标签滑动冲突
- 缓存失效加载异常问题

## 0.7.1
### Feature
- 支持查看原图
- 封面链接样式优化
- 滚动优化
- 支持图片缓存清理
- 支持扫码登录
- 支持滚动位置保持

## 0.7.0
### Feature
- 支持日期筛选
- 上传性能优化
- 启动页优化
- 相册支持标签分组
- 相册编辑体验优化

### Bug Fixes
- 不同菜单内成员状态同步异常问题

## 0.6.5
### Feature
- 资产添加预览图支持
- 列表支持虚拟滚动
- 图片添加本地缓存支持
- 血压测量支持记录测量手臂


## 0.6.4
### Bug Fixes
- 不同菜单内成员状态同步异常问题

## 0.6.3
### Feature
- 支持批量重传功能
- 上传性能优化

## 0.6.2
### Feature
- 重复文件秒传支持

### Bug Fixes
- 人员选择异常
- 删除照片异常的映射问题

## 0.6.1

### Feature
- 血压记录中展示心率数据

### Bug Fixes
- 预览图片时间样式展示异常
- 体重数据无法删除

### Chore
- 系列展示优化

## 0.6.0

### Features
- 优化数据加载和缓存逻辑
- 底部导航支持自定义，移除固定的我喜欢入口
- 血压中显示星期，同时支持数据编辑
- 血压默认展示自定义视图
- 相册中支持展示农历

### Bug Fixes
- 修复空相册列表时顶部间距缺失问题
- 修复已删除图片未正确移除的问题

## 0.5.3

- 新增纪念日功能支持

## 0.5.2

- 血压录入支持添加描述
- 添加资产管理功能

## 0.5.1

- 血压输入添加智能解析,方便快捷录入

## 0.5.0

- 支持血压记录功能

## 0.4.1

- 上传功能优化

## 0.4.0

- 上传功能优化
- 缓存优化
- 相册支持排序和标签功能

## 0.3.2

- 支持上传视频

## 0.3.1

- 修复图片时间获取异常问题
- 优化版本升级逻辑

## 0.3.0

- 迁移体重记录页面
