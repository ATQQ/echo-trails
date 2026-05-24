use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use std::path::PathBuf;
use tokio::fs::File;
use tokio_util::codec::{BytesCodec, FramedRead};
use reqwest::{Body, Url};
use futures_util::StreamExt;
use tauri_plugin_fs::FsExt;
use tauri_plugin_fs::OpenOptions;
use tauri_plugin_fs::FilePath;
use super::s3_presign::{presign_put_object_url, PresignPutObjectParams};

#[derive(Serialize, Deserialize)]
pub struct UploadTokenResponse {
    url: String,
    code: i32,
    message: Option<String>,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    key: String,
    progress: u64,
    total: u64,
}

#[tauri::command]
pub async fn upload_token(
    key: String,
    bucket: String,
    region: String,
    endpoint: String,
    access_key: String,
    secret_key: String,
) -> Result<UploadTokenResponse, String> {
    // Validate inputs before generating the local S3 signature.
    if endpoint.is_empty() {
        return Err("Endpoint is empty. Please configure your S3 endpoint.".to_string());
    }
    if bucket.is_empty() {
        return Err("Bucket is empty. Please configure your S3 bucket.".to_string());
    }
    if access_key.is_empty() || secret_key.is_empty() {
        return Err("Access key or secret key is empty. Please configure your S3 credentials.".to_string());
    }

    let parsed_endpoint = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.clone()
    } else {
        format!("https://{}", endpoint)
    };

    // Validate URL format
    if Url::parse(&parsed_endpoint).is_err() {
        return Err(format!("Invalid endpoint URL: '{}'. Please check your S3 endpoint configuration.", parsed_endpoint));
    }

    let region_value = if region.is_empty() { "us-east-1".to_string() } else { region.clone() };
    let url = presign_put_object_url(
        PresignPutObjectParams {
            key: &key,
            bucket: &bucket,
            region: &region_value,
            endpoint: &parsed_endpoint,
            access_key: &access_key,
            secret_key: &secret_key,
            expires_seconds: 3600,
        },
        chrono::Utc::now(),
    )?;

    Ok(UploadTokenResponse {
        url,
        code: 0,
        message: None,
    })
}

#[tauri::command]
pub async fn upload_file(app: AppHandle, key: String, path: String, url: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // 尝试直接打开，如果失败则尝试通过 tauri_plugin_fs::FsExt 打开（利用其 Scope 能力处理 Resource/Content URI）
    let file = match File::open(&file_path).await {
        Ok(f) => f,
        Err(_) => {
             // 尝试通过 fs 插件打开文件（支持 scope 和 resource 协议）
             let mut opts = OpenOptions::new();
             opts.read(true);
             
             // 尝试解析为 URL (处理 content:// 等)，否则作为普通路径
             let file_path_wrapper: FilePath = match Url::parse(&path) {
                 Ok(url) if url.scheme() != "file" => url.into(),
                 _ => PathBuf::from(path.clone()).into(),
             };

             let fs_file = app.fs().open(file_path_wrapper, opts)
                .map_err(|e| format!("Failed to open file via fs plugin: {}", e))?;
             
             // 将 std::fs::File 转换为 tokio::fs::File
             File::from_std(fs_file)
        }
    };

    let file_size = file.metadata().await.map_err(|e| format!("Failed to get metadata: {}", e))?.len();

    let stream = FramedRead::new(file, BytesCodec::new());
    
    let mut uploaded = 0;
    let app_handle = app.clone();
    let key_clone = key.clone();
    
    let stream = stream.map(move |chunk| {
        let chunk = chunk.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let len = chunk.len() as u64;
        uploaded += len;
        
        // Emit progress
        let _ = app_handle.emit("upload://progress", ProgressPayload {
            key: key_clone.clone(),
            progress: uploaded,
            total: file_size,
        });
        
        Ok::<_, std::io::Error>(chunk.freeze())
    });

    let body = Body::wrap_stream(stream);

    let client = reqwest::Client::new();
    let res = client.put(&url)
        .header("Content-Length", file_size)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Upload request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Upload failed with status: {}", res.status()));
    }

    Ok(())
}
