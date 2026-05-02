use log::info;
use tauri::Manager;
use turso::{Builder, Database};

pub struct TursoDb(pub Database);

pub async fn init(app: &tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    
    let db_path = app_dir.join("echo_trails.db");
    let db_path_str = db_path.to_string_lossy().to_string();
    
    info!("Initializing Turso database at {}", db_path_str);
    
    // =========================================================================
    // Future Cloud Sync Example
    // When you are ready to sync with Turso Cloud, uncomment the block below 
    // and comment out the `new_local` block.
    // =========================================================================
    /*
    use turso::sync::Builder as SyncBuilder;
    let db = SyncBuilder::new_remote(&db_path_str)
        .with_remote_url("libsql://your-database.turso.io")
        .with_auth_token("your-token")
        .build()
        .await
        .map_err(|e| format!("Failed to build remote db: {}", e))?;
    */
    
    // Current Local-only database
    let db = Builder::new_local(&db_path_str)
        .build()
        .await
        .map_err(|e| format!("Failed to build local db: {}", e))?;
        
    // Create cache table if not exists
    let conn = db.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv_cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        ()
    ).await.map_err(|e| e.to_string())?;
    
    app.manage(TursoDb(db));
    
    Ok(())
}

#[tauri::command]
pub async fn db_set_cache(
    state: tauri::State<'_, TursoDb>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO kv_cache (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        (key, value)
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_get_cache(
    state: tauri::State<'_, TursoDb>,
    key: String,
) -> Result<Option<String>, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn.query("SELECT value FROM kv_cache WHERE key = ?1", (key,)).await.map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row.get_value(0).map_err(|e| e.to_string())?;
        if let Some(text) = val.as_text() {
            return Ok(Some(text.to_string()));
        }
    }
    
    Ok(None)
}
