use serde_json::{json, Value as JsonValue};
use tauri::State;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_album_folder_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT * FROM album_folders WHERE deleted = 0 ORDER BY updated_at DESC",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_row(&val));
    }

    Ok(json!({ "code": 0, "data": items }))
}

#[tauri::command]
pub async fn db_album_folder_get(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT * FROM album_folders WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Ok(json!({ "code": 1, "message": "Album folder not found" }))
    }
}

#[tauri::command]
pub async fn db_album_folder_create(
    state: State<'_, TursoDb>,
    name: String,
    description: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let folder_id = new_id();

    let data_val = data.unwrap_or_else(|| {
        json!({
            "name": name,
            "description": description.unwrap_or_default(),
        })
        .to_string()
    });

    conn.execute(
        "INSERT INTO album_folders (id, data) VALUES (?1, ?2)",
        (folder_id.clone(), data_val),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM album_folders WHERE id = ?1", (folder_id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Err("Failed to retrieve created album folder".to_string())
    }
}

#[tauri::command]
pub async fn db_album_folder_update(
    state: State<'_, TursoDb>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    if let Some(d) = data {
        conn.execute(
            "UPDATE album_folders SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (d, id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        let mut existing = get_album_folder_data(&conn, &id).await?;
        if let Some(n) = name {
            existing["name"] = json!(n);
        }
        if let Some(d) = description {
            existing["description"] = json!(d);
        }
        conn.execute(
            "UPDATE album_folders SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (existing.to_string(), id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    let mut rows = conn
        .query("SELECT * FROM album_folders WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Ok(json!({ "code": 1, "message": "Album folder not found" }))
    }
}

#[tauri::command]
pub async fn db_album_folder_delete(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    // 把该文件夹下相册的 folderId 置空
    let mut album_rows = conn
        .query("SELECT id, data FROM albums WHERE deleted = 0", ())
        .await
        .map_err(|e| e.to_string())?;

    let mut album_ids: Vec<String> = Vec::new();
    while let Some(row) = album_rows.next().await.map_err(|e| e.to_string())? {
        let album_id = row
            .get_value(0)
            .ok()
            .and_then(|v| v.as_text().map(|v| v.to_string()))
            .unwrap_or_default();
        let data_str = row
            .get_value(1)
            .ok()
            .and_then(|v| v.as_text().map(|v| v.to_string()))
            .unwrap_or_else(|| "{}".to_string());
        let data_json: JsonValue =
            serde_json::from_str(&data_str).unwrap_or_else(|_| json!({}));
        let fid = data_json
            .get("folderId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !album_id.is_empty() && fid == id {
            album_ids.push(album_id);
        }
    }

    for album_id in &album_ids {
        let mut existing = get_album_data(&conn, album_id).await?;
        if let Some(obj) = existing.as_object_mut() {
            obj.remove("folderId");
        }
        conn.execute(
            "UPDATE albums SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (existing.to_string(), album_id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    // 软删文件夹
    conn.execute(
        "UPDATE album_folders SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({ "code": 0 }))
}

async fn get_album_folder_data(
    conn: &turso::Connection,
    id: &str,
) -> Result<JsonValue, String> {
    let mut rows = conn
        .query("SELECT data FROM album_folders WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let data_str = row
            .get_value(0)
            .map_err(|e| e.to_string())?
            .as_text()
            .map_or("{}", |v| v)
            .to_string();
        serde_json::from_str(&data_str).map_err(|e| e.to_string())
    } else {
        Err("Album folder not found".to_string())
    }
}

async fn get_album_data(conn: &turso::Connection, id: &str) -> Result<JsonValue, String> {
    let mut rows = conn
        .query("SELECT data FROM albums WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let data_str = row
            .get_value(0)
            .map_err(|e| e.to_string())?
            .as_text()
            .map_or("{}", |v| v)
            .to_string();
        serde_json::from_str(&data_str).map_err(|e| e.to_string())
    } else {
        Err("Album not found".to_string())
    }
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
