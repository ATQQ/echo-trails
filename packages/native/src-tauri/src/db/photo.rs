use std::collections::HashSet;

use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_photo_list(
    state: State<'_, TursoDb>,
    page: Option<i64>,
    page_size: Option<i64>,
    liked_mode: Option<bool>,
    album_id: Option<String>,
    is_delete: Option<bool>,
    type_filter: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(30);
    let offset = (page - 1) * page_size;

    let mut conditions = vec!["deleted = ?1".to_string()];
    let mut params: Vec<TursoValue> = vec![TursoValue::Integer(if is_delete.unwrap_or(false) {
        1
    } else {
        0
    })];

    if liked_mode.unwrap_or(false) {
        let param_idx = params.len() + 1;
        conditions.push(format!("is_liked = ?{}", param_idx));
        params.push(TursoValue::Integer(1));
    }

    if let Some(ref t) = type_filter {
        let param_idx = params.len() + 1;
        conditions.push(format!("type LIKE ?{}", param_idx));
        params.push(TursoValue::Text(format!("{}%", t)));
    }

    if let Some(ref sd) = start_date {
        if !sd.is_empty() {
            let param_idx = params.len() + 1;
            conditions.push(format!("last_modified >= ?{}", param_idx));
            params.push(TursoValue::Text(sd.clone()));
        }
    }

    if let Some(ref ed) = end_date {
        if !ed.is_empty() {
            let param_idx = params.len() + 1;
            conditions.push(format!("last_modified <= ?{}", param_idx));
            params.push(TursoValue::Text(ed.clone()));
        }
    }

    let where_clause = conditions.join(" AND ");

    if let Some(aid) = album_id {
        let related_photo_ids = get_album_photo_id_set(&conn, &aid).await?;
        let sql = format!(
            "SELECT * FROM photos WHERE {} ORDER BY last_modified DESC",
            where_clause
        );
        let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
        let mut matched = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let val = row_to_json(&row)?;
            let item = merge_row(&val);
            if photo_matches_album(&item, &aid, &related_photo_ids) {
                matched.push(item);
            }
        }

        let total = matched.len() as i64;
        let items: Vec<JsonValue> = matched
            .into_iter()
            .skip(offset as usize)
            .take(page_size as usize)
            .collect();

        return Ok(json!({ "data": items, "total": total }));
    }

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM photos WHERE {}", where_clause);
    let total: i64 = {
        let mut count_rows = conn
            .query(&count_sql, params.clone())
            .await
            .map_err(|e| e.to_string())?;
        if let Some(row) = count_rows.next().await.map_err(|e| e.to_string())? {
            row.get_value(0)
                .map_err(|e| e.to_string())?
                .as_integer()
                .copied()
                .unwrap_or(0)
        } else {
            0
        }
    };

    // Fetch page
    let sql = format!(
        "SELECT * FROM photos WHERE {} ORDER BY last_modified DESC LIMIT {} OFFSET {}",
        where_clause, page_size, offset
    );
    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_row(&val));
    }

    Ok(json!({ "data": items, "total": total }))
}

async fn get_album_photo_id_set(
    conn: &turso::Connection,
    album_id: &str,
) -> Result<HashSet<String>, String> {
    let mut photo_ids = HashSet::new();
    let mut rows = conn
        .query(
            "SELECT photo_id FROM photo_albums WHERE album_id = ?1",
            (album_id.to_string(),),
        )
        .await
        .map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let photo_id = row
            .get_value(0)
            .map_err(|e| e.to_string())?
            .as_text()
            .map_or("", |v| v)
            .to_string();
        if !photo_id.is_empty() {
            photo_ids.insert(photo_id);
        }
    }

    Ok(photo_ids)
}

fn photo_matches_album(
    item: &JsonValue,
    album_id: &str,
    related_photo_ids: &HashSet<String>,
) -> bool {
    let photo_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if related_photo_ids.contains(photo_id) {
        return true;
    }

    item.get("albumId")
        .and_then(|v| v.as_array())
        .map(|ids| ids.iter().any(|id| id.as_str() == Some(album_id)))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn db_photo_add(
    state: State<'_, TursoDb>,
    id: Option<String>,
    is_liked: Option<bool>,
    type_: Option<String>,
    last_modified: Option<String>,
    md5: Option<String>,
    data: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let photo_id = id.unwrap_or_else(new_id);

    conn.execute(
        "INSERT INTO photos (id, is_liked, type, last_modified, md5, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            photo_id.clone(),
            if is_liked.unwrap_or(false) { 1 } else { 0 },
            type_.unwrap_or_default(),
            last_modified.unwrap_or_default(),
            md5.unwrap_or_default(),
            data,
        ),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Return the created photo
    let mut rows = conn
        .query("SELECT * FROM photos WHERE id = ?1", (photo_id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Failed to retrieve created photo".to_string())
    }
}

#[tauri::command]
pub async fn db_photo_update(
    state: State<'_, TursoDb>,
    id: String,
    is_liked: Option<bool>,
    type_: Option<String>,
    last_modified: Option<String>,
    md5: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    // Build dynamic SET clause
    let mut sets = vec!["updated_at = datetime('now')".to_string()];
    let mut params: Vec<TursoValue> = Vec::new();
    let mut param_idx = 1;

    if let Some(liked) = is_liked {
        sets.push(format!("is_liked = ?{}", param_idx));
        params.push(TursoValue::Integer(if liked { 1 } else { 0 }));
        param_idx += 1;
    }
    if let Some(ref t) = type_ {
        sets.push(format!("type = ?{}", param_idx));
        params.push(TursoValue::Text(t.clone()));
        param_idx += 1;
    }
    if let Some(ref lm) = last_modified {
        sets.push(format!("last_modified = ?{}", param_idx));
        params.push(TursoValue::Text(lm.clone()));
        param_idx += 1;
    }
    if let Some(ref m) = md5 {
        sets.push(format!("md5 = ?{}", param_idx));
        params.push(TursoValue::Text(m.clone()));
        param_idx += 1;
    }
    if let Some(ref d) = data {
        let mut merged_data = get_photo_data(&conn, &id)
            .await
            .unwrap_or_else(|_| json!({}));
        if let Ok(incoming) = serde_json::from_str::<JsonValue>(d) {
            if let (Some(existing_obj), Some(incoming_obj)) =
                (merged_data.as_object_mut(), incoming.as_object())
            {
                for (key, value) in incoming_obj {
                    existing_obj.insert(key.clone(), value.clone());
                }
            } else {
                merged_data = incoming;
            }
        }
        sets.push(format!("data = ?{}", param_idx));
        params.push(TursoValue::Text(merged_data.to_string()));
        param_idx += 1;
    }

    params.push(TursoValue::Text(id.clone()));
    let sql = format!(
        "UPDATE photos SET {} WHERE id = ?{}",
        sets.join(", "),
        param_idx
    );
    conn.execute(&sql, params)
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM photos WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Photo not found".to_string())
    }
}

#[tauri::command]
pub async fn db_photo_toggle_like(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT is_liked FROM photos WHERE id = ?1", (id.clone(),))
        .await
        .map_err(|e| e.to_string())?;

    let current = if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        row.get_value(0)
            .map_err(|e| e.to_string())?
            .as_integer()
            .copied()
            .unwrap_or(0)
    } else {
        return Err("Photo not found".to_string());
    };

    conn.execute(
        "UPDATE photos SET is_liked = ?1, updated_at = datetime('now') WHERE id = ?2",
        (if current == 0 { 1 } else { 0 }, id.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM photos WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Photo not found".to_string())
    }
}

#[tauri::command]
pub async fn db_photo_delete(state: State<'_, TursoDb>, ids: Vec<String>) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    for id in ids {
        conn.execute(
            "UPDATE photos SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
            (id,),
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn db_photo_restore(state: State<'_, TursoDb>, ids: Vec<String>) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    for id in ids {
        conn.execute(
            "UPDATE photos SET deleted = 0, updated_at = datetime('now') WHERE id = ?1",
            (id,),
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn db_photo_check_duplicate(
    state: State<'_, TursoDb>,
    md5: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT * FROM photos WHERE md5 = ?1 AND deleted = 0 LIMIT 1",
            (md5,),
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        let merged = merge_row(&val);
        Ok(json!({ "isDuplicate": true, "existingPhoto": merged }))
    } else {
        Ok(json!({ "isDuplicate": false, "existingPhoto": null }))
    }
}

#[tauri::command]
pub async fn db_photo_list_info(
    state: State<'_, TursoDb>,
    liked_mode: Option<bool>,
    album_id: Option<String>,
    is_delete: Option<bool>,
    type_filter: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let mut conditions = vec!["deleted = ?1".to_string()];
    let mut params: Vec<TursoValue> = vec![TursoValue::Integer(if is_delete.unwrap_or(false) {
        1
    } else {
        0
    })];
    let mut param_idx = 2;

    if liked_mode.unwrap_or(false) {
        conditions.push(format!("is_liked = ?{}", param_idx));
        params.push(TursoValue::Integer(1));
        param_idx += 1;
    }
    if let Some(ref t) = type_filter {
        conditions.push(format!("type LIKE ?{}", param_idx));
        params.push(TursoValue::Text(format!("{}%", t)));
        param_idx += 1;
    }
    if let Some(ref sd) = start_date {
        if !sd.is_empty() {
            conditions.push(format!("last_modified >= ?{}", param_idx));
            params.push(TursoValue::Text(sd.clone()));
            param_idx += 1;
        }
    }
    if let Some(ref ed) = end_date {
        if !ed.is_empty() {
            conditions.push(format!("last_modified <= ?{}", param_idx));
            params.push(TursoValue::Text(ed.clone()));
            param_idx += 1;
        }
    }
    if let Some(ref aid) = album_id {
        conditions.push(format!(
            "id IN (SELECT photo_id FROM photo_albums WHERE album_id = ?{})",
            param_idx
        ));
        params.push(TursoValue::Text(aid.clone()));
        #[allow(unused_assignments)]
        {
            param_idx += 1;
        }
    }

    let where_clause = conditions.join(" AND ");

    // Count and total size from data JSON
    let sql = format!(
        "SELECT COUNT(*), COALESCE(SUM(json_extract(data, '$.size')), 0) FROM photos WHERE {}",
        where_clause
    );
    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let count = row
            .get_value(0)
            .map_err(|e| e.to_string())?
            .as_integer()
            .copied()
            .unwrap_or(0);
        let total_size = row
            .get_value(1)
            .map_err(|e| e.to_string())?
            .as_integer()
            .copied()
            .unwrap_or(0);
        Ok(json!({
            "data": [
                { "title": "数量", "value": format!("{}", count) },
                {
                    "title": "总大小",
                    "value": format_size(total_size as f64),
                    "label": if count > 0 {
                        format!("平均大小：{}", format_size(total_size as f64 / count as f64))
                    } else {
                        "".to_string()
                    }
                }
            ]
        }))
    } else {
        Ok(json!({ "data": [] }))
    }
}

// ==================== Photo-Album junction commands ====================

#[tauri::command]
pub async fn db_photo_add_album(
    state: State<'_, TursoDb>,
    photo_id: String,
    album_id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO photo_albums (photo_id, album_id) VALUES (?1, ?2)",
        (photo_id, album_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_photo_remove_album(
    state: State<'_, TursoDb>,
    photo_id: String,
    album_id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let album_ids = get_photo_album_ids(&conn, &photo_id)
        .await?
        .into_iter()
        .filter(|aid| aid != &album_id)
        .collect::<Vec<_>>();
    conn.execute(
        "DELETE FROM photo_albums WHERE photo_id = ?1 AND album_id = ?2",
        (photo_id.clone(), album_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    update_photo_album_data(&conn, &photo_id, &album_ids).await?;
    Ok(())
}

#[tauri::command]
pub async fn db_photo_set_albums(
    state: State<'_, TursoDb>,
    photo_id: String,
    album_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    // Clear existing
    conn.execute(
        "DELETE FROM photo_albums WHERE photo_id = ?1",
        (photo_id.clone(),),
    )
    .await
    .map_err(|e| e.to_string())?;
    // Insert new
    for aid in &album_ids {
        conn.execute(
            "INSERT OR IGNORE INTO photo_albums (photo_id, album_id) VALUES (?1, ?2)",
            (photo_id.clone(), aid.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    update_photo_album_data(&conn, &photo_id, &album_ids).await?;
    Ok(())
}

#[tauri::command]
pub async fn db_photos_set_albums(
    state: State<'_, TursoDb>,
    photo_ids: Vec<String>,
    album_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    for pid in &photo_ids {
        let mut merged_album_ids = get_photo_album_ids(&conn, pid).await?;
        for aid in &album_ids {
            conn.execute(
                "INSERT OR IGNORE INTO photo_albums (photo_id, album_id) VALUES (?1, ?2)",
                (pid.clone(), aid.clone()),
            )
            .await
            .map_err(|e| e.to_string())?;
            if !merged_album_ids.contains(aid) {
                merged_album_ids.push(aid.clone());
            }
        }
        update_photo_album_data(&conn, pid, &merged_album_ids).await?;
    }
    Ok(())
}

async fn get_photo_album_ids(
    conn: &turso::Connection,
    photo_id: &str,
) -> Result<Vec<String>, String> {
    let mut album_ids = Vec::new();
    let mut rows = conn
        .query(
            "SELECT album_id FROM photo_albums WHERE photo_id = ?1",
            (photo_id.to_string(),),
        )
        .await
        .map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let album_id = row
            .get_value(0)
            .map_err(|e| e.to_string())?
            .as_text()
            .map_or("", |v| v)
            .to_string();
        if !album_id.is_empty() && !album_ids.contains(&album_id) {
            album_ids.push(album_id);
        }
    }

    let data = get_photo_data(conn, photo_id)
        .await
        .unwrap_or_else(|_| json!({}));
    if let Some(ids) = data.get("albumId").and_then(|v| v.as_array()) {
        for album_id in ids.iter().filter_map(|v| v.as_str()) {
            let album_id = album_id.to_string();
            if !album_id.is_empty() && !album_ids.contains(&album_id) {
                album_ids.push(album_id);
            }
        }
    }

    Ok(album_ids)
}

async fn get_photo_data(conn: &turso::Connection, id: &str) -> Result<JsonValue, String> {
    let mut rows = conn
        .query("SELECT data FROM photos WHERE id = ?1", (id,))
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
        Err("Photo not found".to_string())
    }
}

async fn update_photo_album_data(
    conn: &turso::Connection,
    photo_id: &str,
    album_ids: &[String],
) -> Result<(), String> {
    let mut data = get_photo_data(conn, photo_id)
        .await
        .unwrap_or_else(|_| json!({}));
    if let Some(obj) = data.as_object_mut() {
        obj.insert("albumId".to_string(), json!(album_ids));
    } else {
        data = json!({ "albumId": album_ids });
    }
    conn.execute(
        "UPDATE photos SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
        (data.to_string(), photo_id.to_string()),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn format_size(mut size: f64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let mut unit_idx = 0usize;
    while size > 1024.0 && unit_idx < units.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }
    if unit_idx == 0 {
        format!("{}{}", size.round() as i64, units[unit_idx])
    } else {
        format!("{:.2}{}", size, units[unit_idx])
    }
}

/// Helper: convert a turso Row to serde_json::Value
fn row_to_json(row: &turso::Row) -> Result<JsonValue, String> {
    let mut map = serde_json::Map::new();
    // We know our table structure: id, remote_id, sync_status, updated_at, deleted, is_liked, type, last_modified, md5, data
    // Iterate columns by index
    for i in 0..10 {
        if let Ok(val) = row.get_value(i as usize) {
            let key = match i {
                0 => "id",
                1 => "remote_id",
                2 => "sync_status",
                3 => "updated_at",
                4 => "deleted",
                5 => "is_liked",
                6 => "type",
                7 => "last_modified",
                8 => "md5",
                9 => "data",
                _ => continue,
            };
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
