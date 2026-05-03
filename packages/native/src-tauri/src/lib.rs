// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use log::LevelFilter;
use tauri_plugin_log::{Target, TargetKind};

mod command;
use command::*;

mod db;
use db::*;

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
                .level(LevelFilter::Info)
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
        .setup(|app| {
            tauri::async_runtime::block_on(async {
                if let Err(e) = db::init(app.handle()).await {
                    log::error!("Failed to initialize database: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Original commands
            greet,
            save_to_pictures,
            upload_token,
            upload_file,
            download_apk,
            open_apk,
            check_update,
            get_file_info,
            // Legacy KV cache
            db_set_cache,
            db_get_cache,
            db_get_all_cache_info,
            db_delete_cache,
            // Photo CRUD
            db_photo_list,
            db_photo_add,
            db_photo_update,
            db_photo_delete,
            db_photo_restore,
            db_photo_check_duplicate,
            db_photo_list_info,
            db_photo_add_album,
            db_photo_remove_album,
            db_photo_set_albums,
            db_photos_set_albums,
            // Album CRUD
            db_album_list,
            db_album_get,
            db_album_create,
            db_album_update,
            db_album_update_cover,
            // Asset Category CRUD
            db_asset_category_list,
            db_asset_category_create,
            db_asset_category_delete,
            // Asset CRUD
            db_asset_list,
            db_asset_create,
            db_asset_update,
            db_asset_delete,
            db_asset_stats,
            // Memorial CRUD
            db_memorial_list,
            db_memorial_create,
            db_memorial_update,
            db_memorial_delete,
            db_memorial_covers,
            // Family CRUD
            db_family_list,
            db_family_add,
            db_family_update,
            db_family_delete,
            // Weight CRUD
            db_weight_list,
            db_weight_add,
            db_weight_update,
            db_weight_delete,
            // Blood Pressure CRUD
            db_bp_list,
            db_bp_add,
            db_bp_update,
            db_bp_delete,
            // Usage Record
            db_usage_record_add,
            db_usage_record_list,
            // Sync
            db_get_pending_sync,
            db_mark_synced,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
