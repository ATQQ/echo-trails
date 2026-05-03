use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::TursoDb;

/// Get all records with pending sync status across all tables
#[tauri::command]
pub async fn db_get_pending_sync(
    state: State<'_, TursoDb>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let tables = [
        "photos", "albums", "asset_categories", "assets",
        "memorials", "families", "weights", "blood_pressures", "usage_records",
    ];

    let mut result = serde_json::Map::new();
    for table in tables {
        let sql = format!(
            "SELECT id, sync_status, updated_at, data FROM {} WHERE sync_status IN ('local', 'pending')",
            table
        );
        let mut rows = conn.query(&sql, ()).await.map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let mut map = serde_json::Map::new();
            for i in 0..4 {
                if let Ok(val) = row.get_value(i as usize) {
                    let key = match i {
                        0 => "id",
                        1 => "sync_status",
                        2 => "updated_at",
                        3 => "data",
                        _ => continue,
                    };
                    map.insert(key.to_string(), super::turso_value_to_json(&val));
                }
            }
            items.push(JsonValue::Object(map));
        }
        if !items.is_empty() {
            result.insert(table.to_string(), json!(items));
        }
    }

    Ok(json!({ "data": result }))
}

/// Mark records as synced
#[tauri::command]
pub async fn db_mark_synced(
    state: State<'_, TursoDb>,
    entity_type: String,
    entity_id: String,
    remote_id: Option<String>,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let valid_tables = [
        "photos", "albums", "asset_categories", "assets",
        "memorials", "families", "weights", "blood_pressures", "usage_records",
    ];
    if !valid_tables.contains(&entity_type.as_str()) {
        return Err(format!("Invalid entity type: {}", entity_type));
    }

    if let Some(rid) = remote_id {
        let sql = format!(
            "UPDATE {} SET sync_status = 'synced', remote_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            entity_type
        );
        conn.execute(&sql, (rid, entity_id.clone())).await.map_err(|e| e.to_string())?;
    } else {
        let sql = format!(
            "UPDATE {} SET sync_status = 'synced', updated_at = datetime('now') WHERE id = ?1",
            entity_type
        );
        conn.execute(&sql, (entity_id.clone(),)).await.map_err(|e| e.to_string())?;
    }

    // Log to sync_log
    conn.execute(
        "INSERT INTO sync_log (entity_type, entity_id, action, synced_at, status) VALUES (?1, ?2, 'sync', datetime('now'), 'success')",
        (entity_type, entity_id),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
