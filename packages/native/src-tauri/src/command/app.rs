use tauri::{Emitter, Manager};
use serde::Serialize;
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
pub async fn open_apk(app_handle: tauri::AppHandle, file_path: String) -> Result<(), String> {
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
        app_handle.opener().open_path(file_path, None::<&str>).await.map_err(|e| e.to_string())?;
        Ok(())
    }
}
