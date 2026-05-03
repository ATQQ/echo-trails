export enum UploadStatus {
  PENDING,
  UPLOADING,
  SUCCESS,
  ERROR,
  DUPLICATE,
}

export const isTauri = !!window.__TAURI__

export const OFFLINE_USERNAME = 'local'
