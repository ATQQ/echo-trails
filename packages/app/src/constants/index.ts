export enum UploadStatus {
  PENDING,
  UPLOADING,
  SUCCESS,
  ERROR,
  DUPLICATE,
  PARSING,
}

export const isTauri = !!window.__TAURI__

export const OFFLINE_USERNAME = 'local'
