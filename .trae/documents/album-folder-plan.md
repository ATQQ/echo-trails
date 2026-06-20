# 相册文件夹（Album Folder）功能实现计划

## 1. Summary

为相册应用新增「相册文件夹 / 分类」能力：在 `Album` 上加一个可选的 `folderId` 字段，新建 `album_folders` 实体，承载文件夹的名称、描述、封面、创建时间等元数据。AlbumView 顶部新增「文件夹」区块，点击文件夹进入「文件夹详情页」展示该文件夹下的相册列表（沿用 `AllAlbumView` 的小卡片网格样式）。新增文件夹的增/改/删与相册的加入/移出能力，与现有「标签」能力完全解耦。

## 2. Current State Analysis

- **前端** ([packages/app/src](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src))：Vue 3 + TS + Pinia + Vant
  - 相册主页：[AlbumView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AlbumView.vue) 展示大卡片、`allSmall`（小卡片网格）、`tagGroups`（横向滚动）
  - 全部相册：[AllAlbumView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AllAlbumView.vue) —— 搜索 + 标签筛选 + 3 列小卡片网格
  - 相册详情：[AlbumPhotoView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AlbumPhotoView.vue) 通过 `PhotoList` 渲染照片
  - 编辑弹窗：[EditAlbumCard.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/components/EditAlbumCard/EditAlbumCard.vue) + [AlbumEditModal.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/components/EditAlbumCard/AlbumEditModal.vue)
  - 服务层（统一远端/本地）: [service/index.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/service/index.ts) 路由 `isLocalMode()` 决定走 API 还是 `local/*`
  - 本地实现: [service/local/index.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/service/local/index.ts) 通过 `invoke` 调 Tauri 命令
  - 路由: [router/index.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/router/index.ts)
  - 跨页面事件: [lib/albumEvents.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/lib/albumEvents.ts) 用 `CustomEvent('albums-changed')` 广播
  - 类型: [types/index.d.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/types/index.d.ts) 定义 `Album` interface
  - 弹窗返回键处理: [lib/router.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/lib/router.ts) 的 `preventBack`

- **原生 (Tauri, Rust)** ([packages/native/src-tauri/src/db/album.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/db/album.rs))
  - Turso (SQLite-compatible) 持久化
  - 表结构：[packages/native/src-tauri/src/db/mod.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/db/mod.rs) `albums(id, remote_id, sync_status, updated_at, deleted, data TEXT)`
  - 已有 `db_album_list/get/create/update/update_cover`，需要在 lib.rs 注册新命令
  - 同步走 [db/sync.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/db/sync.rs) 的 `db_get_pending_sync`

- **服务端 (Hono + Mongoose)** ([packages/server](file:///Users/sugar/Documents/fe/echo-trails/packages/server))
  - Mongoose Model: [packages/server/src/db/album.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/db/album.ts)
  - 路由: [packages/server/src/routers/album.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/routers/album.ts) `/album/create|list|info|update|update/cover`
  - 没有 Mongoose 迁移机制，依赖字段可空 + 默认值

## 3. Proposed Changes

### 3.1 数据模型

#### 服务端 (Mongoose)

- 新增 `AlbumFolder` 模型：[packages/server/src/db/albumFolder.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/db/albumFolder.ts)
  ```ts
  { name, description, coverKey, username, createdBy, updatedBy, createdAt, updatedAt, deleted }
  ```
- 修改 `Album` 模型：在 [packages/server/src/db/album.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/db/album.ts) 新增可选字段 `folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'AlbumFolder', required: false, default: null }`

#### 本地 (Turso / SQLite)

- 修改 [packages/native/src-tauri/src/db/mod.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/db/mod.rs) 在 `create_schema` 增加：
  - `CREATE TABLE IF NOT EXISTS album_folders (id TEXT PK, remote_id, sync_status, updated_at, deleted, data TEXT)`
  - `ALTER TABLE albums ADD COLUMN folder_id TEXT`（使用 `try/catch` 兼容已存在表）
- `albums` 表 data JSON 中追加 `folderId` 字段（通过 `merge_row` 自动展开）

### 3.2 Tauri 命令

新增 [packages/native/src-tauri/src/db/album_folder.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/db/album_folder.rs)：

- `db_album_folder_list` —— 返回所有未删除文件夹（不含 albumIds，由前端 join）
- `db_album_folder_get(id)`
- `db_album_folder_create(name, description, data)`
- `db_album_folder_update(id, name, description, data)`
- `db_album_folder_delete(id)` —— 同时把 `albums.data.folderId` 置 null

修改 [packages/native/src-tauri/src/db/album.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/db/album.rs)：
- `db_album_list` 返回时为每个 album 补 `folderId`（来自 data）
- `db_album_create/update` 接受 `folderId` 参数并写入 data
- 新增 `db_album_set_folder(id, folderId)`：单相册移动到/移出某个文件夹（folderId 为 null 表示移出）

在 [packages/native/src-tauri/src/lib.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/lib.rs) 注册新命令；在 [packages/native/src-tauri/src/db/sync.rs](file:///Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/src/db/sync.rs) 的 `tables`/`valid_tables` 数组加入 `album_folders`。

### 3.3 服务端路由

- 新增 [packages/server/src/routers/albumFolder.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/routers/albumFolder.ts)：
  - `GET /albumFolder/list` → 返回当前 username 下的所有文件夹 + 每个 folder 包含的 album 数（用 aggregate）
  - `POST /albumFolder/create`
  - `PUT /albumFolder/update`
  - `DELETE /albumFolder/delete`
  - `PUT /albumFolder/setAlbum` (body: `{ albumId, folderId | null }`) —— 移动单个相册
  - `PUT /albumFolder/setAlbums` (body: `{ albumIds, folderId | null }`) —— 批量设置
- 在 [packages/server/src/routers/index.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/routers/index.ts) 注册新路由
- 在 [packages/server/src/routers/album.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/routers/album.ts) `create/update` 接口接受 `folderId` 并持久化
- 在 [packages/server/src/routers/album.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/server/src/routers/album.ts) `list` 返回时补 `folderId` 字段

### 3.4 前端服务层

#### 统一入口 [packages/app/src/service/index.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/service/index.ts)

新增导出（按 `isLocalMode()` 路由）：
- `getAlbumFolders()` → `{ folders: AlbumFolder[] }`
- `createAlbumFolder(name, description)`
- `updateAlbumFolder(id, { name, description })`
- `deleteAlbumFolder(id)`
- `setAlbumFolder(albumId, folderId | null)`
- `setAlbumsFolder(albumIds, folderId | null)`

修改 `createAlbum/updateAlbum` 接受可选 `folderId`。

#### 本地实现 [packages/app/src/service/local/index.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/service/local/index.ts)

- 调 `invoke('db_album_folder_list/create/update/delete')`
- `setAlbumFolder` → 调 `invoke('db_album_set_folder', { id, folderId })`（这是 album.rs 中新加的便捷方法，内部写回 data.folderId）
- `mapAlbum` 输出加 `folderId` 字段

#### 类型扩展 [packages/app/src/types/index.d.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/types/index.d.ts)

```ts
interface AlbumFolder {
  _id: string
  name: string
  description: string
  cover?: string       // 前端派生：第一张关联相册的 cover
  coverKey?: string
  albumCount?: number  // 前端派生
  createdAt: string
}
```
给 `Album` 加 `folderId?: string | null`。

### 3.5 前端 UI

#### 主页 [packages/app/src/views/AlbumView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AlbumView.vue)

- 引入 `getAlbumFolders`，与 `getAlbums` 并行加载
- 在 `<van-empty>` 与 `<van-grid>` 大卡片之间新增「文件夹」section：
  - 横向滚动条样式（与现有 `tag-section` 相同的 `.horizontal-scroll`）
  - 文件夹卡片样式：与 `.scroll-item.portrait` 接近，但右下角小角标显示「N 个相册」
  - 卡片复用 [ImageCell](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/components/ImageCell/ImageCell.vue)
  - 点击 → `router.push({ name: 'album-folder', params: { folderId } })`
  - 长按 → 弹出 `FolderEditModal`（新增组件）进行编辑/删除
- 文件夹 section 顶部右侧「+」号按钮 → 弹出 `FolderEditModal` 新建
- 在「文件夹」section 的 section header 上点击「管理」/ 标题可跳转到「全部文件夹」页面（参考 `goToAllAlbums`）

#### 文件夹详情页 [packages/app/src/views/AlbumFolderView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AlbumFolderView.vue)（新建）

- 复用 [AllAlbumView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AllAlbumView.vue) 的 UI 结构（搜索 + 3 列小卡片网格）
- 数据源：根据 `folderId` 过滤 `getAlbums()` 的结果（也可以后端支持 query 参数，前端过滤更简单，不破坏现有接口）
- 顶部展示文件夹的描述（与 [AlbumPhotoView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AlbumPhotoView.vue) 类似的 `large-card` header）
- 编辑入口 `...` 按钮 → 弹出 `FolderEditModal` 编辑/删除
- 「管理相册」按钮 → 跳到「文件夹相册管理」页面（新建 [AlbumFolderManageView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AlbumFolderManageView.vue)）
  - 列出所有相册（包含未加入文件夹的）
  - 通过 `van-checkbox` 或右上角小图标切换：勾选 = 加入本文件夹，单选 + 互斥逻辑（一个相册只能在一个文件夹）
  - 底部「保存」→ 批量调 `setAlbumsFolder`

#### 弹窗组件 [packages/app/src/components/FolderEditCard/](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/components/FolderEditCard/)（新建）

- `FolderEditCard.vue` + `FolderEditModal.vue`，结构与 `EditAlbumCard/AlbumEditModal` 完全一致
- 字段：`name` (必填) + `description` (可选)
- 支持新建 / 编辑 / 删除（删除时 `showConfirmDialog` 二次确认 + 提示「文件夹内的相册将变为未分类」）

#### 全部文件夹列表（可选改进）

- 在 AlbumView 「文件夹」section 头部加「查看全部」入口，跳到 `AlbumFolderListView.vue`
- 沿用 `AllAlbumView` 样式（搜索 + 3 列文件夹卡片），支持搜索/编辑/删除

### 3.6 路由

修改 [packages/app/src/router/index.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/router/index.ts) 新增：

```ts
{ path: '/album-folder/:folderId', name: 'album-folder', component: () => import('../views/AlbumFolderView.vue'), meta: { keepAlive: false, nav: false } }
{ path: '/album-folder-manage/:folderId', name: 'album-folder-manage', component: () => import('../views/AlbumFolderManageView.vue'), meta: { keepAlive: false, nav: false } }
{ path: '/album-folders', name: 'album-folders', component: () => import('../views/AlbumFolderListView.vue'), meta: { keepAlive: true, nav: false } } // 可选
```

### 3.7 与现有能力解耦

- **标签**：Album.tags 字段不变；文件夹与标签是独立维度，前端不要用任何特殊 tag 前缀表示文件夹
- **大/小卡片样式**：文件夹卡片是新样式，不影响 `style: 'large' | 'small'` 逻辑
- **最近访问 [useRecentAlbums.ts](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/composables/useRecentAlbums.ts)**：保持只追踪相册，不追踪文件夹（避免污染）
- **`albumEvents` 事件**：[AlbumFolderView.vue](file:///Users/sugar/Documents/fe/echo-trails/packages/app/src/views/AlbumFolderView.vue) 在增/改/删后调用 `notifyAlbumsChanged('album-folder-view')` 触发主页刷新

### 3.8 兼容性

- `Album.folderId` 字段全部可选 + 默认 null，旧数据不受影响
- 服务端 `Album.find` 查询保持不变，只是在返回前多展开一个字段
- 本地 Turso 通过 `ALTER TABLE` + 异常忽略确保向前兼容

## 4. Assumptions & Decisions

1. **存储模型**：Folder 独立实体 + `Album.folderId` 单值字段（用户已确认）
2. **封面图**：自动取文件夹内第一个相册的 cover（用户已确认）
3. **UI 位置**：AlbumView 顶部独立「文件夹」区块（用户已确认）
4. **单选约束**：一个相册只能在文件夹列表中选中一次（通过 UI 限制 + 后端在 setAlbumFolder 时校验：若目标 folderId 非空，先把该 album 置空再设置；不强制但推荐）
5. **文件夹删除**：仅删除 folder 记录，关联 album 的 `folderId` 置 null（不级联删除相册）
6. **服务端 cover**：服务端不维护 folder 实体上的 cover 字段（仅 album 有 coverKey），folder 的 cover 由前端从关联 album 计算，避免额外同步逻辑
7. **标签与文件夹正交**：保留现有标签的所有能力，不做改动
8. **不引入嵌套文件夹**：仅一层（一级文件夹）

## 5. Verification Steps

1. **构建**
   - 后端：`cd packages/server && bun install`（如依赖变化）
   - 原生：`cd packages/native/src-tauri && cargo check` —— 确认 Rust 编译通过
   - 前端：用户自启 1420 端口，本地直接 `bun run dev` 验证

2. **手动测试用例**（按用户场景）
   - 新建文件夹「我的旅行」→ 主页顶部出现文件夹卡片
   - 长按文件夹 → 编辑/删除正常
   - 进入文件夹详情页 → 只展示加入该文件夹的相册
   - 「管理相册」→ 勾选 2 个相册保存 → 主页两个相册的 folderId 被设置；再次进入该文件夹详情页能看到
   - 把其中一个相册移到另一个文件夹 → 第一个文件夹详情页中该相册消失，第二个出现
   - 把相册从文件夹中移出（不勾选/单选空）→ 主页「未分类」中可见
   - 删除文件夹 → 提示「文件夹内相册将变为未分类」；确认后主页文件夹消失，相关相册仍在全部相册中
   - 在文件夹中给相册打标签 → 标签与文件夹各自显示
   - 远端模式（修改 .env）切到本地：所有 folder/album 数据正常读写

3. **回归**
   - 现有大卡片/全部相册/标签分组显示正常
   - 创建/编辑/删除普通相册功能不受影响
   - 照片的多相册关联、收藏、删除功能不受影响

4. **本地 + 远端模式兼容**（满足 AGENTS.md 要求「兼容远程和本地两种模式」）：所有接口在 `service/index.ts` 都做了 `isLocalMode()` 分支

## 6. Out of Scope

- 嵌套文件夹（仅支持一层）
- 文件夹级别的标签/封面自定义上传
- 文件夹分享/导出
- 文件夹排序自定义（沿用时间倒序，与相册保持一致）
