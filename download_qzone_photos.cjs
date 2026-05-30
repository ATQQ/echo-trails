const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 辅助函数：下载图片并保留修改时间
function downloadImage(url, filepath, timeStr) {
  return new Promise((resolve, reject) => {
    // 自动将 HTTP 转换为 HTTPS，如果需要的话。但更安全的是根据 URL 的协议使用对应的模块。
    const client = url.startsWith('https') ? https : http;

    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filepath, timeStr).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败，状态码: ${res.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(filepath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();

        // 尝试修改文件的创建/修改时间
        if (timeStr) {
          try {
            // 如果传入的是 Date 对象直接使用，否则尝试解析
            const dateObj = timeStr instanceof Date ? timeStr : new Date(timeStr);
            const timestamp = dateObj.getTime();
            if (!isNaN(timestamp)) {
              fs.utimesSync(filepath, new Date(timestamp), new Date(timestamp));
            }
          } catch (e) {
            // 忽略时间修改错误
          }
        }
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => reject(err));
    });
  });
}

(async () => {
  console.log('🚀 正在启动浏览器...');
  console.log('（如果您遇到启动失败，请先运行 `bunx playwright install chromium` 安装浏览器）\n');

  const browser = await chromium.launch({ headless: false });

  const stateFile = path.join(process.cwd(), 'qzone_auth_state.json');
  let contextOptions = {};
  if (fs.existsSync(stateFile)) {
    console.log('🍪 找到历史登录凭证，尝试免扫码自动登录...');
    contextOptions.storageState = stateFile;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  const outDir = path.join(process.cwd(), 'qzone_photos_download-new-new');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let totalDownloaded = 0;
  const downloadedUrls = new Set();
  let hasSavedState = false;

  // ==== 并发下载队列 ====
  const CONCURRENCY_LIMIT = 2;
  const downloadQueue = [];
  let activeCount = 0;

  async function processQueue() {
    while (activeCount < CONCURRENCY_LIMIT && downloadQueue.length > 0) {
      const task = downloadQueue.shift();
      activeCount++;
      try {
        await task();
      } finally {
        activeCount--;
        processQueue();
      }
    }
  }

  // 监听并拦截 QQ 空间的网络请求，直接获取包含精确时间和原图的 JSON 数据
  page.on('response', async (response) => {
    const url = response.url();

    // 拦截相册照片列表 API
    if (url.includes('cgi_list_photo') || url.includes('fcg_list_photo')) {
      // 当成功获取相册数据时，说明用户已经处于登录有效状态，此时保存一次凭证即可
      if (!hasSavedState) {
        hasSavedState = true;
        try {
          await context.storageState({ path: stateFile });
          console.log('🍪 登录状态已保存，下次可免扫码。');
        } catch (e) {
          // 忽略保存错误
        }
      }
      try {
        const text = await response.text();
        // QQ 空间通常返回 JSONP 格式，如 _Callback({ ... })
        const jsonMatch = text.match(/_Callback\(([\s\S]*)\);?/);
        if (jsonMatch && jsonMatch[1]) {
          const data = JSON.parse(jsonMatch[1]);
          let photos = [];
          if (data.data) {
            if (Array.isArray(data.data.photoList)) {
              photos = photos.concat(data.data.photoList);
            }
            // 兼容某些接口数据在 rangeList 下的结构
            if (Array.isArray(data.data.rangeList)) {
              data.data.rangeList.forEach(range => {
                if (Array.isArray(range.photoList)) {
                  photos = photos.concat(range.photoList);
                }
              });
            }
          }

          if (photos.length > 0) {
            // 尝试获取当前相册名称，如果找不到则放入“未命名相册”
            const topic = data.data.topic || {};
            const albumName = topic.name || '未命名相册';
            const safeAlbumName = albumName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s_]/gi, '').trim() || '未命名相册';

            // 为当前相册创建专属目录
            const albumDir = path.join(outDir, safeAlbumName);
            if (!fs.existsSync(albumDir)) {
              fs.mkdirSync(albumDir, { recursive: true });
            }

            console.log(`\n📦 捕获到相册【${albumName}】的数据，共 ${photos.length} 张照片。开始下载到: ${safeAlbumName}/ ...`);

            for (const photo of photos) {
              // 获取最高清的 URL
              const photoUrl = photo.raw || photo.origin_url || photo.url || photo.pic;
              // 优先获取真实的拍摄时间（通常在 exif 中，格式可能是 YYYY:MM:DD HH:mm:ss）
              let exifTime = (photo.exif && photo.exif.originalTime) ? photo.exif.originalTime : '';
              if (exifTime && exifTime.includes(':') && exifTime.indexOf(':') === 4) {
                // 将 YYYY:MM:DD 转换为 YYYY-MM-DD 以便 Date 解析
                exifTime = exifTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
              }

              // 获取其他拍摄/上传时间作为 fallback
              let shootStr = photo.shoottime || '';
              const uploadStr = photo.uploadtime || '';

              // 如果 shoottime 只有日期或时间为 00:00:00，但 uploadtime 有具体时间，则借用 uploadtime 的时间部分以保留拍摄日期
              if (shootStr && (shootStr.includes('00:00:00') || !shootStr.includes(':')) && uploadStr && uploadStr.includes(':') && !uploadStr.includes('00:00:00')) {
                const datePart = shootStr.split(' ')[0];
                const timePart = uploadStr.split(' ')[1] || uploadStr;
                if (datePart && timePart) {
                  shootStr = `${datePart} ${timePart}`;
                }
              }

              const timeInfo = exifTime || shootStr || uploadStr || '';
              const timestamp = photo.uploadtime_stamp || photo.shoottime_stamp || photo.time;

              let safeTime = '';
              let actualDate = null;

              if (timeInfo) {
                // 优先使用组装好的精确字符串时间
                const parsedDate = new Date(timeInfo);
                if (!isNaN(parsedDate.getTime())) {
                   actualDate = parsedDate;
                }
              }

              // 如果字符串解析失败，再尝试使用时间戳
              if (!actualDate && timestamp) {
                const ms = timestamp.toString().length === 10 ? timestamp * 1000 : timestamp;
                actualDate = new Date(Number(ms));
              }

              if (actualDate && !isNaN(actualDate.getTime())) {
                 const pad = (n) => n.toString().padStart(2, '0');
                 safeTime = `${actualDate.getFullYear()}${pad(actualDate.getMonth() + 1)}${pad(actualDate.getDate())}_${pad(actualDate.getHours())}${pad(actualDate.getMinutes())}${pad(actualDate.getSeconds())}`;
              } else if (timeInfo) {
                 safeTime = timeInfo.replace(/[^0-9]/g, '');
              }

              const name = photo.name || photo.lloc || `photo_${Date.now()}`;

              if (photoUrl && !downloadedUrls.has(photoUrl)) {
                downloadedUrls.add(photoUrl);

                // 格式化文件名：时间_名称_随机数.jpg (防止万一同一秒多张图片覆盖)
                const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/gi, '_').substring(0, 30);
                const randomSuffix = Math.random().toString(36).substring(2, 6);
                const filename = `${safeTime ? safeTime + '_' : ''}${safeName}_${randomSuffix}.jpg`;
                const filepath = path.join(albumDir, filename);

                if (!fs.existsSync(filepath)) {
                  // 将下载任务放入队列
                  downloadQueue.push(async () => {
                    console.log(`⬇️ 正在下载: ${filename} (原时间信息: ${timeInfo}) | 队列剩余未完成: ${downloadQueue.length} 个`);
                    try {
                      // 将实际的 Date 对象传递给下载函数用于修改文件时间
                      await downloadImage(photoUrl, filepath, actualDate);
                      totalDownloaded++;
                    } catch (e) {
                      console.error(`❌ 下载失败: ${filename}`, e.message);
                    }
                  });
                } else {
                  console.log(`⏭️ 已存在，跳过: ${filename}`);
                }
              }
            }
            console.log(`✅ 当前批次处理完成，已加入下载队列。当前队列等待数: ${downloadQueue.length}，已成功下载总计 ${totalDownloaded} 张。\n`);
            // 触发队列消费
            processQueue();
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  });

  console.log('====================================================');
  console.log('请在弹出的浏览器中操作：');
  console.log('1. 扫码登录您的 QQ 空间');
  console.log('2. 登录后，手动点击进入您想要下载的【具体相册】');
  console.log('3. 向下滚动页面以触发加载，脚本会自动在后台捕获数据并下载照片');
  console.log('   (照片将保存在当前目录的 qzone_photos_download-new 文件夹中)');
  console.log('4. 全部完成后，您可以直接关闭浏览器或在终端按 Ctrl+C 结束脚本');
  console.log('====================================================\n');

  try {
    // 禁用超时时间（timeout: 0），防止因为网络慢或某些资源一直 pending 导致脚本直接崩溃
    await page.goto('https://user.qzone.qq.com/2655901404/photo', { timeout: 0 });
  } catch (e) {
    console.error('⚠️ 页面导航超时或出现异常，但不影响继续操作：', e.message);
  }

  // 保持脚本运行，直到用户手动关闭
  page.on('close', () => {
    console.log('👋 浏览器已关闭，脚本退出。');
    process.exit(0);
  });
})();
