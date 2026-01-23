use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use log::{debug, error, info, trace, warn};

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

#[tauri::command]
pub async fn save_to_pictures(file_name: String, data: Vec<u8>) -> Result<String, String> {
    // 系统图片目录 /storage/emulated/0/Pictures
    let pictures_dir = "/storage/emulated/0/Pictures";

    // 构建完整的文件路径
    let file_path = format!("{}/{}", pictures_dir, file_name);

    // 写入文件
    let mut file = fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {}", e))?;
    file.write_all(&data)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    // 返回保存的文件路径
    Ok(file_path)
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
