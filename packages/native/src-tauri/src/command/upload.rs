use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct UploadTokenResponse {
    url: String,
    code: i32,
    message: Option<String>,
}

#[tauri::command]
pub async fn upload_token(key: String) -> Result<UploadTokenResponse, String> {
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
