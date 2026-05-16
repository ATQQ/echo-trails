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
        // If MD5 is provided, verify it
        if let Some(expected_md5) = &md5 {
            if !expected_md5.is_empty() {
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
                            // MD5 mismatch, delete file
                            let _ = std::fs::remove_file(&file_path);
                        }
                    },
                    Err(_) => {
                        let _ = std::fs::remove_file(&file_path);
                    }
                }
            } else {
                // If md5 is empty string, skip check (or maybe we should check?)
                // Assuming empty means no check.
                let _ = app_handle.emit("download-progress", ProgressPayload {
                    progress: 100,
                    total: 100,
                    status: "exists".to_string(),
                });
                return Ok(file_path_str);
            }
        } else {
            let _ = app_handle.emit("download-progress", ProgressPayload {
                progress: 100,
                total: 100,
                status: "exists".to_string(),
            });
            return Ok(file_path_str);
        }
    }

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let total_size = res.content_length().unwrap_or(0);
    
    let mut file = std::fs::File::create(&file_path).map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
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

#[derive(Debug, Deserialize)]
struct PlatformVersions {
    #[serde(default)]
    android: Vec<VersionInfo>,
    #[serde(default)]
    macos: Vec<VersionInfo>,
    #[serde(default)]
    windows: Vec<VersionInfo>,
    #[serde(default)]
    linux: Vec<VersionInfo>,
    #[serde(default)]
    ios: Vec<VersionInfo>,
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
    "https://raw.githubusercontent.com/ATQQ/echo-trails/main/packages/app/public/update.json",
    "https://cdn.jsdelivr.net/gh/ATQQ/echo-trails@main/packages/app/public/update.json",
    "https://photo.sugarat.top/update.json",
];

#[tauri::command]
pub async fn check_update(current_version: String, platform: String) -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let mut version_config: Option<PlatformVersions> = None;

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
                        // 兼容 { code, data } 或直接返回 PlatformVersions
                        let config_data = if let Some(code) = data.get("code").and_then(|v| v.as_f64()) {
                            if code == 0.0 {
                                data.get("data").cloned().unwrap_or(data)
                            } else {
                                continue;
                            }
                        } else {
                            data
                        };

                        let config: PlatformVersions = match serde_json::from_value(config_data) {
                            Ok(c) => c,
                            Err(_) => continue,
                        };

                        let platform_versions = match platform.as_str() {
                            "android" => &config.android,
                            "macos" => &config.macos,
                            "windows" => &config.windows,
                            "linux" => &config.linux,
                            "ios" => &config.ios,
                            _ => continue,
                        };

                        if platform_versions.is_empty() {
                            continue;
                        }

                        let latest = platform_versions.iter()
                            .max_by(|a, b| compare_version(&a.version, &b.version).cmp(&0));

                        if let Some(latest_info) = latest {
                            if compare_version(&latest_info.version, &current_version) > 0 {
                                version_config = Some(config);
                                break;
                            }
                        }

                        if version_config.is_none() {
                            version_config = Some(config);
                        }
                    }
                    Err(_) => continue,
                }
            }
            Err(_) => continue,
        }
    }

    let config = match version_config {
        Some(c) => c,
        None => {
            return Ok(UpdateInfo {
                has_update: false,
                current_version: current_version.clone(),
                latest_version: current_version,
                description: String::new(),
                download_url: String::new(),
                force_update: false,
                md5: String::new(),
            });
        }
    };

    let platform_versions = match platform.as_str() {
        "android" => &config.android,
        "macos" => &config.macos,
        "windows" => &config.windows,
        "linux" => &config.linux,
        "ios" => &config.ios,
        _ => {
            return Err(format!("Unsupported platform: {}", platform));
        }
    };

    let latest = platform_versions.iter()
        .max_by(|a, b| compare_version(&a.version, &b.version).cmp(&0));

    match latest {
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
