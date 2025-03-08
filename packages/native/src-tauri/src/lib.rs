// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use std::fs;
use std::io::Write;

#[tauri::command]
async fn save_to_pictures(file_name: String, data: Vec<u8>) -> Result<String, String> {
    // 系统图片目录 /storage/emulated/0/Pictures
    let pictures_dir = "/storage/emulated/0/Pictures";
    
    // 构建完整的文件路径
    let file_path = format!("{}/{}", pictures_dir, file_name);
    
    // 写入文件
    let mut file = fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {}", e))?;
    file.write_all(&data).map_err(|e| format!("写入文件失败: {}", e))?;
    
    // 返回保存的文件路径
    Ok(file_path)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .invoke_handler(tauri::generate_handler![save_to_pictures])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
