use serde_json::{json, Value as JsonValue};
use tauri::State;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_memorial_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT * FROM memorials WHERE deleted = 0 ORDER BY updated_at DESC", ())
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_row(&val));
    }

    Ok(json!({ "data": items }))
}

#[tauri::command]
pub async fn db_memorial_create(
    state: State<'_, TursoDb>,
    id: Option<String>,
    data: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mid = id.unwrap_or_else(new_id);

    conn.execute(
        "INSERT INTO memorials (id, data) VALUES (?1, ?2)",
        (mid.clone(), data),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM memorials WHERE id = ?1", (mid,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Failed to create memorial".to_string())
    }
}

#[tauri::command]
pub async fn db_memorial_update(
    state: State<'_, TursoDb>,
    id: String,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    if let Some(d) = data {
        conn.execute(
            "UPDATE memorials SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (d, id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        // No data provided, nothing to update
    }

    let mut rows = conn
        .query("SELECT * FROM memorials WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Memorial not found".to_string())
    }
}

#[tauri::command]
pub async fn db_memorial_delete(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE memorials SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_memorial_covers() -> Result<JsonValue, String> {
    // Return preset cover images (same as server)
    let covers = vec![
        "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800",
        "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800",
        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800",
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
        "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800",
        "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800",
        "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=800",
        "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=800",
        "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=800",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800",
        "https://images.unsplash.com/photo-1518173946687-a2fa81026e3a?w=800",
    ];
    Ok(json!({ "data": covers }))
}

fn row_to_json(row: &turso::Row) -> Result<JsonValue, String> {
    let mut map = serde_json::Map::new();
    for i in 0..6 {
        if let Ok(val) = row.get_value(i as usize) {
            let key = match i {
                0 => "id",
                1 => "remote_id",
                2 => "sync_status",
                3 => "updated_at",
                4 => "deleted",
                5 => "data",
                _ => continue,
            };
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
