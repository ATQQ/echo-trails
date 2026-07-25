use serde::Serialize;
use std::fs;
use std::io::Write;

#[cfg(target_os = "android")]
use jni::objects::JValue;

#[derive(Serialize)]
pub struct FileInfo {
    last_modified: i64,
    creation_time: i64,
    size: u64,
    width: u32,
    height: u32,
    file_type: Option<String>,
    md5: Option<String>,
}

#[derive(Serialize, Default)]
pub struct LivePhotoInfo {
    pub video_path: String,
    pub content_id: String,
    pub duration: i64,
    pub video_size: i64,
}

#[tauri::command]
pub async fn save_to_pictures(app_handle: tauri::AppHandle, file_name: String, data: Vec<u8>) -> Result<String, String> {
    #[cfg(target_os = "android")]
    let pictures_dir = std::path::PathBuf::from("/storage/emulated/0/Pictures");

    #[cfg(not(target_os = "android"))]
    let pictures_dir = {
        use tauri::Manager;
        app_handle
            .path()
            .picture_dir()
            .map_err(|e| format!("获取图片目录失败: {}", e))?
    };

    if !pictures_dir.exists() {
        fs::create_dir_all(&pictures_dir).map_err(|e| format!("创建图片目录失败: {}", e))?;
    }

    let file_path = pictures_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    let mut file = fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {}", e))?;
    file.write_all(&data)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    let _ = &app_handle;
    Ok(file_path_str)
}

#[tauri::command]
pub async fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    #[cfg(target_os = "android")]
    {
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        
        let context = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };
        // let class = env.get_object_class(&context).map_err(|e| e.to_string())?;
        // Update to use FileHelper
        // Use ClassLoader to find the class, as find_class often fails for app classes in JNI threads
        let class_loader = env.call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;
        
        let class_name = env.new_string("com/echo_trails/app/FileHelper").map_err(|e| e.to_string())?;
        
        let class_obj = env.call_method(
            class_loader, 
            "loadClass", 
            "(Ljava/lang/String;)Ljava/lang/Class;", 
            &[JValue::Object(&class_name)]
        ).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;

        let class: jni::objects::JClass = class_obj.into();
        
        let path_jstr = env.new_string(&file_path).map_err(|e| e.to_string())?;
        
        // 调用 Java 方法获取文件信息
        // 使用 getFileInfoWithContext 以支持 Content URI
        let result = env.call_static_method(
            class,
            "getFileInfoWithContext",
            "(Landroid/content/Context;Ljava/lang/String;)Lcom/echo_trails/app/FileInfo;",
            &[JValue::Object(&context), JValue::Object(&path_jstr)]
        ).map_err(|e| e.to_string())?;
        
        let file_info_obj = result.l().map_err(|e| e.to_string())?;
        
        if file_info_obj.is_null() {
             return Err(format!("Failed to get file info for path: {}", file_path));
        }

        // 获取字段
        let last_modified = env.get_field(&file_info_obj, "lastModified", "J")
            .map_err(|e| e.to_string())?
            .j()
            .map_err(|e| e.to_string())?;
            
        let creation_time = env.get_field(&file_info_obj, "creationTime", "J")
            .map_err(|e| e.to_string())?
            .j()
            .map_err(|e| e.to_string())?;

        let size = env.get_field(&file_info_obj, "size", "J")
            .map_err(|e| e.to_string())?
            .j()
            .map_err(|e| e.to_string())?;

        let width = env.get_field(&file_info_obj, "width", "I")
            .map_err(|e| e.to_string())?
            .i()
            .map_err(|e| e.to_string())?;

        let height = env.get_field(&file_info_obj, "height", "I")
            .map_err(|e| e.to_string())?
            .i()
            .map_err(|e| e.to_string())?;

        let file_type_obj = env.get_field(&file_info_obj, "fileType", "Ljava/lang/String;")
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;
        
        let file_type: Option<String> = if !file_type_obj.is_null() {
            Some(env.get_string(&file_type_obj.into())
                .map_err(|e| e.to_string())?
                .into())
        } else {
            None
        };

        let md5_obj = env.get_field(&file_info_obj, "md5", "Ljava/lang/String;")
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;

        let md5: Option<String> = if !md5_obj.is_null() {
            Some(env.get_string(&md5_obj.into())
                .map_err(|e| e.to_string())?
                .into())
        } else {
            None
        };

        Ok(FileInfo {
            last_modified,
            creation_time,
            size: size as u64,
            width: width as u32,
            height: height as u32,
            file_type,
            md5
        })
    }

    #[cfg(not(target_os = "android"))]
    {
        use crate::command::common::calculate_md5;
        let metadata = std::fs::metadata(&file_path).map_err(|e| e.to_string())?;
        let modified = metadata.modified().map_err(|e| e.to_string())?
            .duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?
            .as_millis() as i64;
            
        let created = metadata.created().map_err(|e| e.to_string())?
             .duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?
             .as_millis() as i64;

        let path = std::path::Path::new(&file_path);
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let file_type = match extension.as_str() {
            "jpg" | "jpeg" => Some("image/jpeg".to_string()),
            "png" => Some("image/png".to_string()),
            "gif" => Some("image/gif".to_string()),
            "webp" => Some("image/webp".to_string()),
            "mp4" => Some("video/mp4".to_string()),
            "mov" => Some("video/quicktime".to_string()),
            "avi" => Some("video/x-msvideo".to_string()),
            "mkv" => Some("video/x-matroska".to_string()),
            "webm" => Some("video/webm".to_string()),
            _ => None,
        };
        
        // Calculate MD5
        let md5 = calculate_md5(path).ok();

        // Desktop platform width/height fetching logic can be added here if needed
        // For now returning 0
        Ok(FileInfo {
            last_modified: modified,
            creation_time: created,
            size: metadata.len(),
            width: 0,
            height: 0,
            file_type,
            md5
        })
    }
}

/// 解析 Apple Live Photo 配对信息
/// 给定一张静态图路径，返回同目录的 MOV/MP4 动态部分（若存在），以及 ContentIdentifier
#[tauri::command]
pub async fn parse_live_photo(file_path: String) -> Result<Option<LivePhotoInfo>, String> {
    #[cfg(target_os = "android")]
    {
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        let context = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };

        let class_loader = env.call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;
        let class_name = env.new_string("com/echo_trails/app/FileHelper").map_err(|e| e.to_string())?;
        let class_obj = env.call_method(
            class_loader,
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(&class_name)],
        ).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;
        let class: jni::objects::JClass = class_obj.into();

        let path_jstr = env.new_string(&file_path).map_err(|e| e.to_string())?;
        let result = env.call_static_method(
            class,
            "findLivePhotoVideo",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&context), JValue::Object(&path_jstr)],
        ).map_err(|e| e.to_string())?;

        let json_obj = result.l().map_err(|e| e.to_string())?;
        if json_obj.is_null() {
            println!("[LivePhoto:DEBUG] parse_live_photo null path={}", file_path);
            return Ok(None);
        }
        let json_str: String = env.get_string(&json_obj.into()).map_err(|e| e.to_string())?.into();
        println!("[LivePhoto:DEBUG] parse_live_photo path={} json={}", file_path, json_str);
        let parsed: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
        let video_path = parsed.get("videoPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if video_path.is_empty() {
            println!("[LivePhoto:DEBUG] parse_live_photo miss path={}", file_path);
            return Ok(None);
        }
        println!("[LivePhoto:DEBUG] parse_live_photo hit path={} video={}", file_path, video_path);
        Ok(Some(LivePhotoInfo {
            video_path,
            content_id: parsed.get("contentId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            duration: parsed.get("duration").and_then(|v| v.as_i64()).unwrap_or(0),
            video_size: parsed.get("videoSize").and_then(|v| v.as_i64()).unwrap_or(0),
        }))
    }

    #[cfg(not(target_os = "android"))]
    {
        // 桌面平台：同目录寻找同名 .mov/.mp4 文件
        let path = std::path::Path::new(&file_path);
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => return Ok(None),
        };
        let parent = match path.parent() {
            Some(p) => p,
            None => return Ok(None),
        };
        for ext in ["MOV", "mov", "MP4", "mp4"].iter() {
            let candidate = parent.join(format!("{}.{}", stem, ext));
            if candidate.exists() {
                let content_id = extract_quicktime_content_id(&candidate).unwrap_or_default();
                return Ok(Some(LivePhotoInfo {
                    video_path: candidate.to_string_lossy().to_string(),
                    content_id,
                    duration: 0,
                    video_size: std::fs::metadata(&candidate).map(|m| m.len() as i64).unwrap_or(0),
                }));
            }
        }
        Ok(None)
    }
}

#[cfg(not(target_os = "android"))]
fn extract_quicktime_content_id(path: &std::path::Path) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; 2 * 1024 * 1024];
    let n = file.read(&mut buf).ok()?;
    let key = b"com.apple.quicktime.content.identifier";
    let mut i = 0usize;
    let end = n.saturating_sub(key.len());
    while i <= end {
        if &buf[i..i + key.len()] == key {
            let mut p = i + key.len();
            while p < n && (buf[p] < 0x20 || buf[p] > 0x7E) { p += 1; }
            let start = p;
            while p < n && buf[p] >= 0x20 && buf[p] <= 0x7E { p += 1; }
            if p - start >= 8 {
                if let Ok(s) = std::str::from_utf8(&buf[start..p]) {
                    return Some(s.trim().to_string());
                }
            }
            return None;
        }
        i += 1;
    }
    None
}
