use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_family_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT * FROM families WHERE deleted = 0 ORDER BY updated_at DESC", ())
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        let merged = merge_row(&val);
        items.push(merged);
    }

    Ok(json!({ "code": 0, "data": items }))
}

#[tauri::command]
pub async fn db_family_add(
    state: State<'_, TursoDb>,
    name: String,
    family_id: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();
    let fid = family_id.unwrap_or_else(|| new_id());

    let data_val = data.unwrap_or_else(|| {
        json!({ "name": name }).to_string()
    });

    conn.execute(
        "INSERT INTO families (id, family_id, data) VALUES (?1, ?2, ?3)",
        (id.clone(), fid.clone(), data_val),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM families WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Err("Failed to create family".to_string())
    }
}

#[tauri::command]
pub async fn db_family_update(
    state: State<'_, TursoDb>,
    family_id: String,
    name: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut existing = get_family_data_by_fid(&conn, &family_id).await?;
    existing["name"] = json!(name);
    conn.execute(
        "UPDATE families SET data = ?1, updated_at = datetime('now') WHERE family_id = ?2",
        (existing.to_string(), family_id),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({ "code": 0 }))
}

#[tauri::command]
pub async fn db_family_delete(
    state: State<'_, TursoDb>,
    family_id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE families SET deleted = 1, updated_at = datetime('now') WHERE family_id = ?1",
        (family_id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_family_data_by_fid(conn: &turso::Connection, fid: &str) -> Result<JsonValue, String> {
    let mut rows = conn
        .query("SELECT data FROM families WHERE family_id = ?1", (fid,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let data_str = row.get_value(0).map_err(|e| e.to_string())?.as_text().map_or("{}", |v| v).to_string();
        serde_json::from_str(&data_str).map_err(|e| e.to_string())
    } else {
        Err("Family not found".to_string())
    }
}

fn row_to_json(row: &turso::Row) -> Result<JsonValue, String> {
    let mut map = serde_json::Map::new();
    for i in 0..7 {
        if let Ok(val) = row.get_value(i as usize) {
            let key = match i {
                0 => "id",
                1 => "remote_id",
                2 => "sync_status",
                3 => "updated_at",
                4 => "deleted",
                5 => "family_id",
                6 => "data",
                _ => continue,
            };
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
