/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_S3_PREFIX: string
  /** 更新清单 version.json 地址；缺省回退 https://photo.sugarat.top/version.json */
  readonly VITE_VERSION_URL?: string
  /** 构建时注入的产品版本；热更新离线包用它覆盖 package.json 版本 */
  readonly VITE_APP_VERSION?: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
