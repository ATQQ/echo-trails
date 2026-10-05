use log::info;
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::command::common::{
    calculate_md5, compare_version, emit_progress, remove_file, stream_download,
};
use crate::ota::compiled_native_hash;

#[cfg(target_os = "android")]
use jni::objects::JValue;

#[tauri::command]
pub async fn download_apk(
    app_handle: tauri::AppHandle,
    url: String,
    version: String,
    md5: Option<String>,
    file_size: Option<u64>,
) -> Result<String, String> {
    let cache_dir = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?;

    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    let file_name = format!("echo-trails-{}.apk", version);
    let file_path = cache_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    let progress_total = file_size.filter(|size| *size > 0);
    let expected_md5 = md5
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if file_path.exists() {
        // 有 MD5 且校验通过才复用缓存；否则删除重下，避免半截文件残留。
        if let Some(expected) = expected_md5 {
            match calculate_md5(&file_path) {
                Ok(current_md5) if current_md5.eq_ignore_ascii_case(expected) => {
                    emit_progress(&app_handle, 100, 100, "exists");
                    return Ok(file_path_str);
                }
                _ => remove_file(&file_path),
            }
        } else {
            remove_file(&file_path);
        }
    }

    const MAX_DOWNLOAD_ATTEMPTS: u8 = 2;
    let mut last_error: Option<String> = None;
    for attempt in 0..MAX_DOWNLOAD_ATTEMPTS {
        if attempt > 0 {
            remove_file(&file_path);
            emit_progress(&app_handle, 0, 0, "retrying");
        }
        if let Err(error) = stream_download(
            &app_handle,
            &url,
            &file_path,
            progress_total,
            expected_md5.is_none(),
            "downloaded file is not an APK",
        )
        .await
        {
            last_error = Some(error);
            continue;
        }
        let Some(expected) = expected_md5 else {
            return Ok(file_path_str);
        };
        match calculate_md5(&file_path) {
            Ok(current_md5) if current_md5.eq_ignore_ascii_case(expected) => {
                return Ok(file_path_str);
            }
            Ok(current_md5) => {
                let actual_size = std::fs::metadata(&file_path)
                    .map(|meta| meta.len())
                    .unwrap_or(0);
                remove_file(&file_path);
                last_error = Some(format!(
                    "MD5 mismatch: expected {}, got {} ({} bytes)",
                    expected, current_md5, actual_size
                ));
            }
            Err(error) => {
                remove_file(&file_path);
                last_error = Some(error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "MD5 mismatch".to_string()))
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

#[derive(Debug, Deserialize, Clone)]
struct WebPackageInfo {
    #[serde(default)]
    version: String,
    #[serde(rename = "downloadUrl", default)]
    download_url: String,
    #[serde(default)]
    md5: String,
    #[serde(rename = "fileSize", default)]
    file_size: u64,
}

#[derive(Debug, Deserialize, Clone)]
struct VersionInfo {
    version: String,
    #[serde(rename = "downloadUrl", default)]
    download_url: String,
    #[serde(rename = "forceUpdate", default)]
    force_update: bool,
    #[serde(default)]
    description: String,
    #[serde(default)]
    md5: String,
    #[serde(rename = "fileSize", default)]
    file_size: u64,
    #[serde(rename = "nativeHash", default)]
    native_hash: String,
    #[serde(rename = "webPackage", default)]
    web_package: Option<WebPackageInfo>,
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
    #[serde(rename = "fileSize")]
    pub file_size: u64,
    /// none / web（离线包热更新） / apk（原生安装包更新）
    #[serde(rename = "updateKind")]
    pub update_kind: String,
}

fn no_update(current_version: String) -> UpdateInfo {
    UpdateInfo {
        has_update: false,
        latest_version: current_version.clone(),
        current_version,
        description: String::new(),
        download_url: String::new(),
        force_update: false,
        md5: String::new(),
        file_size: 0,
        update_kind: "none".to_string(),
    }
}

/// 对客户端展示/比较的“产品版本”：优先 webPackage.version，其次壳版本。
fn web_version(info: &VersionInfo) -> &str {
    info.web_package
        .as_ref()
        .map(|pkg| pkg.version.as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(info.version.as_str())
}

/// 更新决策：nativeHash 匹配时优先热更新离线包，否则回退原生安装包。
fn decide_update(
    current_web: &str,
    local_shell_version: &str,
    local_native_hash: &str,
    latest: &VersionInfo,
    web_ready: bool,
    apk_ready: bool,
) -> UpdateInfo {
    let product_latest = web_version(latest);
    let hash_match = !latest.native_hash.is_empty() && latest.native_hash == local_native_hash;
    let web_pkg = latest
        .web_package
        .as_ref()
        .filter(|pkg| !pkg.version.is_empty() && !pkg.download_url.is_empty());
    let newer_web = compare_version(product_latest, current_web) > 0;
    let newer_shell = compare_version(&latest.version, local_shell_version) > 0;

    if newer_web && hash_match {
        if let Some(pkg) = web_pkg {
            if web_ready {
                return UpdateInfo {
                    has_update: true,
                    current_version: current_web.to_string(),
                    latest_version: pkg.version.clone(),
                    description: latest.description.clone(),
                    download_url: pkg.download_url.clone(),
                    force_update: latest.force_update,
                    md5: pkg.md5.clone(),
                    file_size: pkg.file_size,
                    update_kind: "web".to_string(),
                };
            }
        }
    }

    if newer_shell && !latest.download_url.is_empty() && apk_ready {
        return UpdateInfo {
            has_update: true,
            current_version: current_web.to_string(),
            latest_version: latest.version.clone(),
            description: latest.description.clone(),
            download_url: latest.download_url.clone(),
            force_update: latest.force_update,
            md5: latest.md5.clone(),
            file_size: latest.file_size,
            update_kind: "apk".to_string(),
        };
    }

    no_update(current_web.to_string())
}

const DEFAULT_VERSION_URLS: &[&str] = &[
    // 首选：photo 域名的 version.json（含 nativeHash / webPackage，权威更新清单）
    "https://photo.sugarat.top/version.json",
    // 回退：GitHub Release 上的 latest.json（tauri updater 标准格式 + android 扩展字段）
    "https://github.com/ATQQ/echo-trails/releases/latest/download/latest.json",
    // 再回退：仓库 main 分支的 version.json / update.json（兼容旧客户端）
    "https://raw.githubusercontent.com/ATQQ/echo-trails/main/packages/app/public/version.json",
    "https://raw.githubusercontent.com/ATQQ/echo-trails/main/packages/app/public/update.json",
    "https://cdn.jsdelivr.net/gh/ATQQ/echo-trails@main/packages/app/public/version.json",
    "https://cdn.jsdelivr.net/gh/ATQQ/echo-trails@main/packages/app/public/update.json",
];

fn version_urls(preferred: Option<String>) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(url) = preferred {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            urls.push(trimmed.to_string());
        }
    }
    for url in DEFAULT_VERSION_URLS {
        if !urls.iter().any(|existing| existing == url) {
            urls.push((*url).to_string());
        }
    }
    urls
}

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
pub async fn check_update<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    current_version: String,
    platform: String,
    version_url: Option<String>,
) -> Result<UpdateInfo, String> {
    // 以本机实际生效的 Web 版本为准（含已启用的离线包）：
    // 只信前端上报时，离线包自报版本一旦落后于清单版本就会反复“启用 → 重载”。
    let current_version = crate::ota::effective_web_version(&app, &current_version);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let mut found_latest: Option<VersionInfo> = None;

    for url in version_urls(version_url.clone()) {
        let fetch_url = format!("{}?t={}", url, chrono::Utc::now().timestamp_millis());
        match client
            .get(&fetch_url)
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

                        if let Some(latest_info) = extract_platform_latest(&data, &platform) {
                            // 以第一个可解析的来源为准；资源可用性在下面统一探测。
                            found_latest = Some(latest_info);
                            break;
                        }
                    }
                    Err(_) => continue,
                }
            }
            Err(_) => continue,
        }
    }

    let Some(latest_info) = found_latest else {
        return Ok(no_update(current_version));
    };

    let product_latest = web_version(&latest_info);
    let hash_match = !latest_info.native_hash.is_empty()
        && latest_info.native_hash == compiled_native_hash();
    let newer_web = compare_version(product_latest, &current_version) > 0;
    let newer_shell = compare_version(&latest_info.version, env!("CARGO_PKG_VERSION")) > 0;

    let mut web_ready = false;
    if newer_web && hash_match {
        if let Some(pkg) = latest_info
            .web_package
            .as_ref()
            .filter(|pkg| !pkg.version.is_empty() && !pkg.download_url.is_empty())
        {
            web_ready = is_download_available(&client, &pkg.download_url).await;
        }
    }

    let mut apk_ready = true;
    if newer_shell && !latest_info.download_url.is_empty() {
        apk_ready = is_download_available(&client, &latest_info.download_url).await;
    }

    Ok(decide_update(
        &current_version,
        env!("CARGO_PKG_VERSION"),
        compiled_native_hash(),
        &latest_info,
        web_ready,
        apk_ready,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> VersionInfo {
        VersionInfo {
            version: "0.2.7".into(),
            download_url: "https://example.com/a.apk".into(),
            force_update: false,
            description: "notes".into(),
            md5: "apkmd5".into(),
            file_size: 10,
            native_hash: "hash-1".into(),
            web_package: Some(WebPackageInfo {
                version: "0.2.8".into(),
                download_url: "https://example.com/a.zip".into(),
                md5: "webmd5".into(),
                file_size: 3,
            }),
        }
    }

    #[test]
    fn matching_native_hash_uses_web_package() {
        let info = decide_update("0.2.7", "0.2.7", "hash-1", &sample(), true, true);
        assert_eq!(info.update_kind, "web");
        assert_eq!(info.latest_version, "0.2.8");
        assert_eq!(info.download_url, "https://example.com/a.zip");
        assert_eq!(info.md5, "webmd5");
    }

    #[test]
    fn native_hash_mismatch_uses_apk_when_apk_is_newer() {
        let mut latest = sample();
        latest.version = "0.2.9".into();
        latest.native_hash = "hash-2".into();
        let info = decide_update("0.2.8", "0.2.7", "hash-1", &latest, true, true);
        assert_eq!(info.update_kind, "apk");
        assert_eq!(info.latest_version, "0.2.9");
    }

    #[test]
    fn web_only_release_does_not_loop_old_apk() {
        let info = decide_update("0.2.8", "0.2.7", "hash-1", &sample(), true, true);
        assert!(!info.has_update);
        assert_eq!(info.update_kind, "none");
    }

    #[test]
    fn unavailable_web_package_falls_back_to_none() {
        let info = decide_update("0.2.7", "0.2.7", "hash-1", &sample(), false, true);
        assert!(!info.has_update);
    }
}
