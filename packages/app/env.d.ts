/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_S3_PREFIX: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
