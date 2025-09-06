import { isTauri } from "@/constants";
import { showNotify } from "vant";
// import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
// 检查是否为Android平台，因为Android需要特殊处理文件路径权限
import { invoke } from '@tauri-apps/api/core';
import SparkMD5 from 'spark-md5';

export function generateFileKey(fileInfo: FileInfoItem) {
  // 年-月-日/时分/上传时间-文件名
  const year = fileInfo.date.getFullYear();
  const month = (fileInfo.date.getMonth() + 1).toString().padStart(2, '0');
  const day = fileInfo.date.getDate().toString().padStart(2, '0');
  const hour = fileInfo.date.getHours().toString().padStart(2, '0');
  const minute = fileInfo.date.getMinutes().toString().padStart(2, '0');
  const second = fileInfo.date.getSeconds().toString().padStart(2, '0');
  const uploadTime = new Date().getTime()
  const { operator = 'unknow', username = 'unknow' } = JSON.parse(localStorage.getItem('userInfo') || '{}')
  // 前缀/原图时间年-月-日/时分秒-上传时间戳-原文件名
  return `${import.meta.env.VITE_S3_PREFIX}/${username}/${operator}/${year}-${month}-${day}/${hour}-${minute}-${second}-${uploadTime}-${fileInfo.name}`
}


export function formatSize(
  size: number,
  pointLength?: number,
  units?: string[],
) {
  let unit
  units = units || ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  // eslint-disable-next-line no-cond-assign
  while ((unit = units.shift()) && size > 1024) {
    size /= 1024
  }
  return (
    (unit === 'B'
      ? size
      : size.toFixed(pointLength === undefined ? 2 : pointLength)) + unit!
  )
}

export function downloadFile(url: string, name: string) {
  if (isTauri) {
    // 添加保存到相册的功能
    // 创建一个函数来处理保存到相册
    const saveToGallery = async () => {
      try {
        // 使用Tauri的API保存到相册
        const response = await tauriFetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        // 保存到相册目录
        // TODO: 可以优化 使用 Rust 写入系统相册
        const filePath = await invoke('save_to_pictures', {
          fileName: name,
          data: Array.from(uint8Array)
        });
        // console.log('filePath', filePath);
        // await writeFile(name, uint8Array, { baseDir: BaseDirectory.Picture });
        showNotify?.({ type: 'success', message: '已保存到相册' });
      } catch (error) {
        console.error('保存到相册失败:', error);
        showNotify?.({ type: 'danger', message: '保存到相册失败' });
      }
    };
    saveToGallery()
  } else {
    const img = new Image()
    img.src = url
    img.onload = () => {
      const a = document.createElement('a')
      a.href = img.src
      a.download = name
      a.click()
    }
  }
}

export function getFileMd5Hash(file: File) {
  return new Promise((resolve, reject) => {
    const blobSlice = File.prototype.slice
    const chunkSize = 2097152 // Read in chunks of 2MB
    const chunks = Math.ceil(file.size / chunkSize)
    let currentChunk = 0
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()

    function loadNext() {
      const start = currentChunk * chunkSize
      const end = start + chunkSize >= file.size ? file.size : start + chunkSize

      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end))
    }
    fileReader.onload = function (e) {
      // console.log('read chunk nr', currentChunk + 1, 'of', chunks)
      spark.append(e?.target?.result as ArrayBuffer) // Append array buffer
      currentChunk += 1

      if (currentChunk < chunks) {
        loadNext()
      }
      else {
        // console.log('finished loading')
        const hashResult = spark.end()
        // console.info('computed hash', hashResult) // Compute hash
        resolve(hashResult)
      }
    }

    fileReader.onerror = function () {
      reject(new Error('oops, something went wrong.'))
    }

    loadNext()
  })
}
