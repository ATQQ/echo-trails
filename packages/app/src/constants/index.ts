export enum UploadStatus {
  PENDING,
  UPLOADING,
  SUCCESS,
  ERROR,
}

// TODO: 优化
export const isTauri = !!window.__TAURI__
