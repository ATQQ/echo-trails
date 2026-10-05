use futures_util::StreamExt;
use serde::Serialize;
use std::io::{Read, Write};
use std::time::Duration;
use tauri::Emitter;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn calculate_md5(file_path: &std::path::Path) -> Result<String, String> {
    let mut file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
    let mut buffer = [0; 8192];
    let mut context = md5::Context::new();

    loop {
        let count = Read::read(&mut file, &mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        context.consume(&buffer[..count]);
    }

    let digest = context.compute();
    Ok(format!("{:x}", digest))
}

/// 版本号比较（按 `.` 拆分，缺失段补 0）。
pub(crate) fn compare_version(v1: &str, v2: &str) -> i32 {
    let parts1: Vec<u32> = v1.split('.').filter_map(|s| s.parse().ok()).collect();
    let parts2: Vec<u32> = v2.split('.').filter_map(|s| s.parse().ok()).collect();
    let len = parts1.len().max(parts2.len());
    for i in 0..len {
        let n1 = parts1.get(i).copied().unwrap_or(0);
        let n2 = parts2.get(i).copied().unwrap_or(0);
        if n1 > n2 {
            return 1;
        }
        if n1 < n2 {
            return -1;
        }
    }
    0
}

#[derive(Clone, Serialize)]
pub(crate) struct ProgressPayload {
    progress: u64,
    total: u64,
    status: String,
}

pub(crate) fn emit_progress<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    progress: u64,
    total: u64,
    status: &str,
) {
    let _ = app_handle.emit(
        "download-progress",
        ProgressPayload {
            progress,
            total,
            status: status.to_string(),
        },
    );
}

pub(crate) fn remove_file(file_path: &std::path::Path) {
    let _ = std::fs::remove_file(file_path);
}

/// APK / zip 都以 `PK` 开头，用于粗略拦截 HTML 错误页等坏包。
fn is_archive_magic(file_path: &std::path::Path) -> Result<bool, String> {
    let mut file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
    let mut magic = [0u8; 4];
    let count = file.read(&mut magic).map_err(|e| e.to_string())?;
    Ok(count >= 2 && magic[0] == b'P' && magic[1] == b'K')
}

/// 流式下载并上报进度，可选校验 Content-Length。
pub(crate) async fn stream_download<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    url: &str,
    file_path: &std::path::Path,
    progress_total: Option<u64>,
    verify_content_length: bool,
    invalid_archive_error: &str,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(url)
        .header("Accept-Encoding", "identity")
        .header("Accept", "application/vnd.android.package-archive,*/*")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("download HTTP {}", res.status()));
    }

    let encoded = res
        .headers()
        .get(reqwest::header::CONTENT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .map(|value| !value.eq_ignore_ascii_case("identity"))
        .unwrap_or(false);
    let header_len = res.content_length();
    let total_size = progress_total
        .or(if encoded { None } else { header_len })
        .unwrap_or(0);
    let mut file = std::fs::File::create(file_path).map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(item) = stream.next().await {
        let chunk = match item {
            Ok(bytes) => bytes,
            Err(error) => {
                drop(file);
                remove_file(file_path);
                return Err(error.to_string());
            }
        };
        if let Err(error) = file.write_all(&chunk) {
            drop(file);
            remove_file(file_path);
            return Err(error.to_string());
        }
        downloaded += chunk.len() as u64;
        emit_progress(app_handle, downloaded, total_size, "downloading");
    }

    if let Err(error) = file.flush().and_then(|_| file.sync_all()) {
        drop(file);
        remove_file(file_path);
        return Err(error.to_string());
    }
    drop(file);

    if verify_content_length && !encoded {
        if let Some(len) = header_len {
            if downloaded != len {
                remove_file(file_path);
                return Err(format!(
                    "incomplete download: got {} bytes, expected {}",
                    downloaded, len
                ));
            }
        }
    }
    if !is_archive_magic(file_path)? {
        remove_file(file_path);
        return Err(invalid_archive_error.to_string());
    }
    Ok(())
}
