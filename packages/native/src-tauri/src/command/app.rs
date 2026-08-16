use tauri::{Emitter, Manager};
use log::info;
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;
use std::io::Write;
use crate::command::common::calculate_md5;

#[cfg(target_os = "android")]
use jni::objects::JValue;

#[derive(Clone, Serialize)]
pub struct ProgressPayload {
    progress: u64,
    total: u64,
    status: String,
}

#[tauri::command]
pub async fn download_apk(app_handle: tauri::AppHandle, url: String, version: String, md5: Option<String>) -> Result<String, String> {
    let cache_dir = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?;
    
    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    let file_name = format!("echo-trails-{}.apk", version);
    let file_path = cache_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    if file_path.exists() {
        let has_md5 = md5.as_deref().map(|m| !m.is_empty()).unwrap_or(false);
        if has_md5 {
            // 有 MD5：校验缓存文件，匹配才直接复用
            let expected_md5 = md5.as_deref().unwrap();
            match calculate_md5(&file_path) {
                Ok(current_md5) => {
                    if current_md5.eq_ignore_ascii_case(expected_md5) {
                        let _ = app_handle.emit("download-progress", ProgressPayload {
                            progress: 100,
                            total: 100,
                            status: "exists".to_string(),
                        });
                        return Ok(file_path_str);
                    } else {
                        // MD5 不匹配（坏缓存），删除重新下载
                        let _ = std::fs::remove_file(&file_path);
                    }
                },
                Err(_) => {
                    let _ = std::fs::remove_file(&file_path);
                }
            }
        } else {
            // 无 MD5：缓存文件无法校验完整性（可能是上次中断的半截文件），删除重新下载
            let _ = std::fs::remove_file(&file_path);
        }
    }

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let total_size = res.content_length().unwrap_or(0);

    let mut file = std::fs::File::create(&file_path).map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(item) = stream.next().await {
        let chunk = match item {
            Ok(c) => c,
            Err(e) => {
                // 下载中断：清理半截文件，避免残留坏缓存导致后续无法重新下载
                drop(file);
                let _ = std::fs::remove_file(&file_path);
                return Err(e.to_string());
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            drop(file);
            let _ = std::fs::remove_file(&file_path);
            return Err(e.to_string());
        }
        downloaded += chunk.len() as u64;

        let _ = app_handle.emit("download-progress", ProgressPayload {
            progress: downloaded,
            total: total_size,
            status: "downloading".to_string(),
        });
    }

    // Verify MD5 after download
    if let Some(expected_md5) = &md5 {
        if !expected_md5.is_empty() {
             let current_md5 = calculate_md5(&file_path)?;
             if !current_md5.eq_ignore_ascii_case(expected_md5) {
                 let _ = std::fs::remove_file(&file_path);
                 return Err(format!("MD5 mismatch: expected {}, got {}", expected_md5, current_md5));
             }
        }
    }

    Ok(file_path_str)
}

#[tauri::command]
pub async fn open_apk(_app_handle: tauri::AppHandle, file_path: String) -> Result<(), String> {
    info!("Opening APK from: {}", file_path);
    #[cfg(target_os = "android")]
    {
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        
        // We need the context object. ndk_context provides it as a raw pointer.
        let context = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };
        
        // Use AppHelper
        // Use ClassLoader to find the class
        let class_loader = env.call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;
        
        let class_name = env.new_string("com/echo_trails/app/AppHelper").map_err(|e| e.to_string())?;
        
        let class_obj = env.call_method(
            class_loader, 
            "loadClass", 
            "(Ljava/lang/String;)Ljava/lang/Class;", 
            &[JValue::Object(&class_name)]
        ).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;

        let class: jni::objects::JClass = class_obj.into();
        
        // Convert file_path to JString
        let uri_str = env.new_string(&file_path).map_err(|e| e.to_string())?;
        
        env.call_static_method(
            class,
            "installApk",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[JValue::Object(&context), JValue::Object(&uri_str)]
        ).map_err(|e| e.to_string())?;
        
        Ok(())
    }
    
    #[cfg(not(target_os = "android"))]
    {
        use tauri_plugin_opener::OpenerExt;
        _app_handle.opener().open_path(file_path, None::<&str>).map_err(|e: tauri_plugin_opener::Error| e.to_string())?;
        Ok(())
    }
}

// ==================== Check Update ====================

#[derive(Debug, Deserialize)]
struct VersionInfo {
    version: String,
    #[serde(rename = "downloadUrl")]
    download_url: String,
    #[serde(rename = "forceUpdate", default)]
    force_update: bool,
    #[serde(default)]
    description: String,
    #[serde(default)]
    md5: String,
}

#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    #[serde(rename = "hasUpdate")]
    pub has_update: bool,
    #[serde(rename = "currentVersion")]
    pub current_version: String,
    #[serde(rename = "latestVersion")]
    pub latest_version: String,
    pub description: String,
    #[serde(rename = "downloadUrl")]
    pub download_url: String,
    #[serde(rename = "forceUpdate")]
    pub force_update: bool,
    pub md5: String,
}

fn compare_version(v1: &str, v2: &str) -> i32 {
    let parts1: Vec<u32> = v1.split('.').filter_map(|s| s.parse().ok()).collect();
    let parts2: Vec<u32> = v2.split('.').filter_map(|s| s.parse().ok()).collect();
    let len = parts1.len().max(parts2.len());
    for i in 0..len {
        let n1 = parts1.get(i).copied().unwrap_or(0);
        let n2 = parts2.get(i).copied().unwrap_or(0);
        if n1 > n2 { return 1; }
        if n1 < n2 { return -1; }
    }
    0
}

const DEFAULT_VERSION_URLS: &[&str] = &[
    // 首选：photo 域名的 update.json（APK 下载走 Bitiful CDN，国内访问快）
    // 注意：本地发版时 update.json 可能先于 APK 上传 CDN 到达，
    // 由 is_download_available 探测兜底，探测失败会自动回退后面的源
    "https://photo.sugarat.top/update.json",
    // 回退：GitHub Release 上的 latest.json（tauri updater 标准格式 + android 扩展字段）
    "https://github.com/ATQQ/echo-trails/releases/latest/download/latest.json",
    // 再回退：仓库 main 分支的 update.json（数组格式，兼容旧客户端）
    "https://raw.githubusercontent.com/ATQQ/echo-trails/main/packages/app/public/update.json",
    "https://cdn.jsdelivr.net/gh/ATQQ/echo-trails@main/packages/app/public/update.json",
];

// 从 JSON Value 中提取指定平台的最新版本信息。
// 兼容三种格式：
//   1. latest.json: 顶层 `<platform>` 是对象（单版本），例如 { android: {version, downloadUrl, ...} }
//   2. update.json: 顶层 `<platform>` 是数组（多版本历史，按版本降序），取最大版本
//   3. version.json: 顶层 `<platform>` 是对象（单版本）
// 同时兼容 { code, data } 包裹的响应。
fn extract_platform_latest(data: &serde_json::Value, platform: &str) -> Option<VersionInfo> {
    // 兼容 { code, data } 包裹
    let root = if let Some(code) = data.get("code").and_then(|v| v.as_f64()) {
        if code == 0.0 {
            data.get("data").unwrap_or(data)
        } else {
            return None;
        }
    } else {
        data
    };

    let platform_value = root.get(platform)?;

    if platform_value.is_object() {
        // latest.json / version.json: 对象格式
        serde_json::from_value::<VersionInfo>(platform_value.clone()).ok()
    } else if platform_value.is_array() {
        // update.json: 数组格式，取版本号最大的
        let versions: Vec<VersionInfo> = serde_json::from_value(platform_value.clone()).ok()?;
        versions.into_iter().max_by(|a, b| compare_version(&a.version, &b.version).cmp(&0))
    } else {
        None
    }
}

// 探测安装包资源是否已可下载（version.json 元数据可能先于 APK 构建上传到达，此时 download_url 会 404）
// 优先发 HEAD 请求；若服务器不支持 HEAD（405/501）则回退为 Range GET 探测
async fn is_download_available(client: &reqwest::Client, download_url: &str) -> bool {
    // HEAD 探测：2xx 视为资源存在（client 已配置 3s 超时，且 reqwest 默认跟随重定向）
    match client.head(download_url).send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                return true;
            }
            // 服务器不支持 HEAD（405 Method Not Allowed / 501 Not Implemented），回退 GET 探测
            if status.as_u16() == 405 || status.as_u16() == 501 {
                return match client
                    .get(download_url)
                    .header("Range", "bytes=0-0")
                    .send()
                    .await
                {
                    // 2xx 或 206 Partial Content 均视为资源存在
                    Ok(range_resp) => {
                        range_resp.status().is_success() || range_resp.status().as_u16() == 206
                    }
                    Err(_) => false,
                };
            }
            // 其它状态（404/403 等）视为不可用
            false
        }
        // 网络错误 / 超时均视为不可用
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn check_update(current_version: String, platform: String) -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let mut found_latest: Option<VersionInfo> = None;

    for url in DEFAULT_VERSION_URLS {
        let fetch_url = format!("{}?t={}", url, chrono::Utc::now().timestamp_millis());
        match client.get(&fetch_url)
            .header("Cache-Control", "no-cache, no-store, must-revalidate")
            .header("Pragma", "no-cache")
            .send()
            .await
        {
            Ok(resp) => {
                if !resp.status().is_success() {
                    continue;
                }
                match resp.text().await {
                    Ok(text) => {
                        let data: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };

                        match extract_platform_latest(&data, &platform) {
                            Some(latest_info) => {
                                // 发现新版本：先探测安装包是否已可下载，可用才采用并停止轮询
                                if compare_version(&latest_info.version, &current_version) > 0 {
                                    if latest_info.download_url.is_empty() {
                                        // 无下载链接时保持原有行为：直接采用
                                        found_latest = Some(latest_info);
                                        break;
                                    }
                                    if is_download_available(&client, &latest_info.download_url).await {
                                        found_latest = Some(latest_info);
                                        break;
                                    }
                                    // 元数据先于安装包上传（资源尚不可下载），跳过该版本源继续尝试
                                    continue;
                                }
                                // 当前 URL 无新版本，作为兜底保存（继续尝试后续 URL）
                                if found_latest.is_none() {
                                    found_latest = Some(latest_info);
                                }
                            }
                            None => continue,
                        }
                    }
                    Err(_) => continue,
                }
            }
            Err(_) => continue,
        }
    }

    match found_latest {
        Some(latest_info) => {
            let has_update = compare_version(&latest_info.version, &current_version) > 0;
            Ok(UpdateInfo {
                has_update,
                current_version: current_version.clone(),
                latest_version: latest_info.version.clone(),
                description: latest_info.description.clone(),
                download_url: latest_info.download_url.clone(),
                force_update: latest_info.force_update,
                md5: latest_info.md5.clone(),
            })
        }
        None => {
            Ok(UpdateInfo {
                has_update: false,
                current_version: current_version.clone(),
                latest_version: current_version,
                description: String::new(),
                download_url: String::new(),
                force_update: false,
                md5: String::new(),
            })
        }
    }
}
