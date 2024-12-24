export enum UploadStatus {
  PENDING,
  UPLOADING,
  SUCCESS,
  ERROR,
}

export const isTauri = !!window.__TAURI__
