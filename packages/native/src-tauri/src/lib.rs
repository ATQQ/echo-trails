// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use log::LevelFilter;
use tauri_plugin_log::{Target, TargetKind};

mod command;
use command::*;

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_to_pictures,
            upload_token,
            upload_file,
            download_apk,
            open_apk,
            get_file_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
