export enum UploadStatus {
  PENDING,
  UPLOADING,
  SUCCESS,
  ERROR,
  DUPLICATE,
}

export const isTauri = !!window.__TAURI__
