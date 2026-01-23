#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn calculate_md5(file_path: &std::path::Path) -> Result<String, String> {
    let mut file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
    let mut buffer = [0; 8192];
    let mut context = md5::Context::new();
    
    loop {
        let count = std::io::Read::read(&mut file, &mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        context.consume(&buffer[..count]);
    }
    
    let digest = context.compute();
    Ok(format!("{:x}", digest))
}
