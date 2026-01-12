// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// use aws_sdk_s3::presigning::PresigningConfig;
// use aws_sdk_s3::primitives::ByteStream;
// use aws_sdk_s3::Client;
use log::LevelFilter;
use log::{debug, error, info, trace, warn};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::Write;
use std::time::Duration;
use tauri_plugin_log::{Target, TargetKind};
use tauri::Wry;
use tauri_plugin_store::StoreExt;
use serde_json::json;

// 用于返回上传令牌的响应结构体
#[derive(Serialize, Deserialize)]
struct UploadTokenResponse {
    url: String,
    code: i32,
    message: Option<String>,
}

#[tauri::command]
async fn save_to_pictures(file_name: String, data: Vec<u8>) -> Result<String, String> {
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
async fn upload_token(key: String) -> Result<UploadTokenResponse, String> {
    // 打印环境变量加载状态，用于调试
    // let s3_bucket = env::var("S3_BUCKET").unwrap_or_else(|_| "未设置".to_string());
    // let aws_region = env::var("AWS_REGION").unwrap_or_else(|_| "未设置".to_string());
    // let aws_access_key = env::var("AWS_ACCESS_KEY_ID").unwrap_or_else(|_| "未设置".to_string());
    // let aws_secret_key = env::var("AWS_SECRET_ACCESS_KEY").unwrap_or_else(|_| "未设置".to_string());

    // println!("S3_BUCKET: {}", s3_bucket);
    // println!("AWS_REGION: {}", aws_region);
    // println!(
    //     "AWS_ACCESS_KEY_ID: {}",
    //     if !aws_access_key.is_empty() && aws_access_key != "未设置" {
    //         "已设置"
    //     } else {
    //         "未设置"
    //     }
    // );
    // println!(
    //     "AWS_SECRET_ACCESS_KEY: {}",
    //     if !aws_secret_key.is_empty() && aws_secret_key != "未设置" {
    //         "已设置"
    //     } else {
    //         "未设置"
    //     }
    // );

    // // 检查key是否存在
    // if key.is_empty() {
    //     return Ok(UploadTokenResponse {
    //         url: String::new(),
    //         code: 1,
    //         message: Some("key is required".to_string()),
    //     });
    // }

    // // 获取S3桶名
    // let bucket = match env::var("S3_BUCKET") {
    //     Ok(bucket) => bucket,
    //     Err(_) => {
    //         return Ok(UploadTokenResponse {
    //             url: String::new(),
    //             code: 1,
    //             message: Some("S3_BUCKET 环境变量未设置".to_string()),
    //         });
    //     }
    // };

    // // 创建AWS配置
    // let config = aws_config::load_from_env().await;

    // // 创建S3客户端
    // let s3_client = Client::new(&config);

    // // 创建预签名URL的配置，过期时间为1小时
    // let presigning_config = match PresigningConfig::builder()
    //     .expires_in(Duration::from_secs(3600))
    //     .build()
    // {
    //     Ok(config) => config,
    //     Err(e) => {
    //         return Ok(UploadTokenResponse {
    //             url: String::new(),
    //             code: 1,
    //             message: Some(format!("创建预签名配置失败: {}", e)),
    //         });
    //     }
    // };

    // // 生成预签名URL
    // match s3_client
    //     .put_object()
    //     .bucket(bucket)
    //     .key(key)
    //     .presigned(presigning_config)
    //     .await
    // {
    //     Ok(presigned_request) => Ok(UploadTokenResponse {
    //         url: presigned_request.uri().to_string(),
    //         code: 0,
    //         message: None,
    //     }),
    //     Err(e) => Ok(UploadTokenResponse {
    //         url: String::new(),
    //         code: 1,
    //         message: Some(format!("生成预签名URL失败: {}", e)),
    //     }),
    // }

    return Ok(UploadTokenResponse {
        url: String::new(),
        code: 1,
        message: Some("key is required".to_string()),
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                ])
                .level(LevelFilter::Info) // 设置日志级别
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_to_pictures,
            upload_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
