use log::info;
use serde::Serialize;
use serde_json::{json, Value as JsonValue};
use tauri::Manager;
use turso::{Builder, Database};

pub mod album;
pub mod asset;
pub mod blood_pressure;
pub mod family;
pub mod memorial;
pub mod photo;
pub mod sync;
pub mod usage_record;
pub mod weight;

// Re-export all commands so they're accessible via `use db::*`
pub use album::*;
pub use asset::*;
pub use blood_pressure::*;
pub use family::*;
pub use memorial::*;
pub use photo::*;
pub use sync::*;
pub use usage_record::*;
pub use weight::*;

#[derive(Serialize)]
pub struct CacheInfo {
    pub key: String,
    pub size: usize,
}

pub struct TursoDb(pub Database);

pub async fn init(app: &tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let db_path = app_dir.join("echo_trails.db");
    let db_path_str = db_path.to_string_lossy().to_string();

    info!("Initializing Turso database at {}", db_path_str);

    let db = Builder::new_local(&db_path_str)
        .build()
        .await
        .map_err(|e| format!("Failed to build local db: {}", e))?;

    let conn = db.connect().map_err(|e| e.to_string())?;

    // Legacy KV cache table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv_cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Photos
    conn.execute(
        "CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            is_liked INTEGER DEFAULT 0,
            type TEXT,
            last_modified TEXT,
            md5 TEXT,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_deleted ON photos(deleted)", ())
        .await
        .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_last_modified ON photos(last_modified)", ())
        .await
        .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_md5 ON photos(md5)", ())
        .await
        .map_err(|e| e.to_string())?;

    // Photo-Album junction
    conn.execute(
        "CREATE TABLE IF NOT EXISTS photo_albums (
            photo_id TEXT NOT NULL,
            album_id TEXT NOT NULL,
            PRIMARY KEY (photo_id, album_id)
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Albums
    conn.execute(
        "CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Asset categories
    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_categories (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Assets
    conn.execute(
        "CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Memorials
    conn.execute(
        "CREATE TABLE IF NOT EXISTS memorials (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Families
    conn.execute(
        "CREATE TABLE IF NOT EXISTS families (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            family_id TEXT UNIQUE,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Weights
    conn.execute(
        "CREATE TABLE IF NOT EXISTS weights (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            family_id TEXT,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_weights_family ON weights(family_id)", ())
        .await
        .map_err(|e| e.to_string())?;

    // Blood pressures
    conn.execute(
        "CREATE TABLE IF NOT EXISTS blood_pressures (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0,
            family_id TEXT,
            date TEXT,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_bp_family ON blood_pressures(family_id)", ())
        .await
        .map_err(|e| e.to_string())?;

    // Usage records
    conn.execute(
        "CREATE TABLE IF NOT EXISTS usage_records (
            id TEXT PRIMARY KEY,
            remote_id TEXT,
            sync_status TEXT DEFAULT 'local',
            updated_at TEXT DEFAULT (datetime('now')),
            target_id TEXT,
            target_type TEXT,
            action_type TEXT,
            data TEXT NOT NULL DEFAULT '{}'
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_target ON usage_records(target_id)", ())
        .await
        .map_err(|e| e.to_string())?;

    // Sync log
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            synced_at TEXT,
            sync_batch TEXT,
            status TEXT DEFAULT 'pending',
            error TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )",
        (),
    )
    .await
    .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status)", ())
        .await
        .map_err(|e| e.to_string())?;

    app.manage(TursoDb(db));

    info!("Database initialized with all tables");
    Ok(())
}

// ==================== Helper functions ====================

/// Generate a new UUID v4 string
pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Get current datetime string in SQLite format
pub fn now_str() -> String {
    chrono_now()
}

fn chrono_now() -> String {
    // Use a simple format that SQLite understands
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Fallback: just use the epoch seconds formatted
    // SQLite's datetime('now') is UTC, so we match that
    format!("{}", now)
}

/// Merge a database row's fixed columns with the `data` JSON column.
/// The `data` JSON fields are spread to the top level.
/// `id` is also aliased as `_id` for MongoDB compatibility.
pub fn merge_row(row: &JsonValue) -> JsonValue {
    let mut result = row.clone();
    if let Some(data_str) = row.get("data").and_then(|v| v.as_str()) {
        if let Ok(data_json) = serde_json::from_str::<JsonValue>(data_str) {
            if let Some(obj) = data_json.as_object() {
                for (k, v) in obj {
                    result[k] = v.clone();
                }
            }
        }
    }
    // Remove the raw data field
    if let Some(obj) = result.as_object_mut() {
        obj.remove("data");
        // Alias id as _id for MongoDB compatibility
        if let Some(id_val) = obj.get("id").cloned() {
            obj.insert("_id".to_string(), id_val);
        }
    }
    result
}

/// Extract fixed-column fields from a JSON value for INSERT/UPDATE.
/// Returns (fixed_columns_json, data_json) where fixed_columns are the fields
/// that map to actual SQL columns, and data_json is everything else serialized.
pub fn split_data(input: &JsonValue, fixed_keys: &[&str]) -> (serde_json::Map<String, JsonValue>, String) {
    let mut fixed = serde_json::Map::new();
    let mut data_map = serde_json::Map::new();

    if let Some(obj) = input.as_object() {
        for (k, v) in obj {
            if fixed_keys.contains(&k.as_str()) {
                fixed.insert(k.clone(), v.clone());
            } else {
                data_map.insert(k.clone(), v.clone());
            }
        }
    }

    let data_str = serde_json::to_string(&data_map).unwrap_or_else(|_| "{}".to_string());
    (fixed, data_str)
}

/// Convert a turso Value to serde_json::Value
pub fn turso_value_to_json(val: &turso::Value) -> JsonValue {
    match val {
        turso::Value::Null => JsonValue::Null,
        turso::Value::Integer(i) => json!(*i),
        turso::Value::Real(f) => json!(*f),
        turso::Value::Text(s) => JsonValue::String(s.clone()),
        turso::Value::Blob(b) => json!(b),
    }
}

// ==================== Legacy KV cache commands ====================

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
        (key, value),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_get_cache(
    state: tauri::State<'_, TursoDb>,
    key: String,
) -> Result<Option<String>, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT value FROM kv_cache WHERE key = ?1", (key,))
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row.get_value(0).map_err(|e| e.to_string())?;
        if let Some(text) = val.as_text() {
            return Ok(Some(text.to_string()));
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn db_get_all_cache_info(
    state: tauri::State<'_, TursoDb>,
) -> Result<Vec<CacheInfo>, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT key, LENGTH(value) as size FROM kv_cache",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let key = row.get_value(0).map_err(|e| e.to_string())?;
        let size = row.get_value(1).map_err(|e| e.to_string())?;

        if let (Some(k), Some(s)) = (key.as_text(), size.as_integer()) {
            result.push(CacheInfo {
                key: k.to_string(),
                size: (*s as usize) * 2,
            });
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn db_delete_cache(
    state: tauri::State<'_, TursoDb>,
    key: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM kv_cache WHERE key = ?1", (key,))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
