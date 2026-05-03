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
    let mut params: Vec<TursoValue> = vec![TursoValue::Integer(if is_delete.unwrap_or(false) { 1 } else { 0 })];
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
        conditions.push(format!("last_modified >= ?{}", param_idx));
        params.push(TursoValue::Text(sd.clone()));
        param_idx += 1;
    }

    if let Some(ref ed) = end_date {
        conditions.push(format!("last_modified <= ?{}", param_idx));
        params.push(TursoValue::Text(ed.clone()));
        param_idx += 1;
    }

    // Album filter via junction table
    if let Some(ref aid) = album_id {
        conditions.push(format!(
            "id IN (SELECT photo_id FROM photo_albums WHERE album_id = ?{})",
            param_idx
        ));
        params.push(TursoValue::Text(aid.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    let where_clause = conditions.join(" AND ");

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM photos WHERE {}", where_clause);
    let mut count_rows = conn.query(&count_sql, params.clone()).await.map_err(|e| e.to_string())?;
    let total: i64 = if let Some(row) = count_rows.next().await.map_err(|e| e.to_string())? {
        row.get_value(0).map_err(|e| e.to_string())?.as_integer().copied().unwrap_or(0)
    } else {
        0
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
        sets.push(format!("data = ?{}", param_idx));
        params.push(TursoValue::Text(d.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    params.push(TursoValue::Text(id.clone()));
    let sql = format!("UPDATE photos SET {} WHERE id = ?{}", sets.join(", "), param_idx);
    conn.execute(&sql, params).await.map_err(|e| e.to_string())?;

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
pub async fn db_photo_delete(
    state: State<'_, TursoDb>,
    ids: Vec<String>,
) -> Result<(), String> {
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
pub async fn db_photo_restore(
    state: State<'_, TursoDb>,
    ids: Vec<String>,
) -> Result<(), String> {
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
    let mut params: Vec<TursoValue> = vec![TursoValue::Integer(if is_delete.unwrap_or(false) { 1 } else { 0 })];
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
        conditions.push(format!("last_modified >= ?{}", param_idx));
        params.push(TursoValue::Text(sd.clone()));
        param_idx += 1;
    }
    if let Some(ref ed) = end_date {
        conditions.push(format!("last_modified <= ?{}", param_idx));
        params.push(TursoValue::Text(ed.clone()));
        param_idx += 1;
    }
    if let Some(ref aid) = album_id {
        conditions.push(format!(
            "id IN (SELECT photo_id FROM photo_albums WHERE album_id = ?{})",
            param_idx
        ));
        params.push(TursoValue::Text(aid.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    let where_clause = conditions.join(" AND ");

    // Count and total size from data JSON
    let sql = format!(
        "SELECT COUNT(*), COALESCE(SUM(json_extract(data, '$.size')), 0) FROM photos WHERE {}",
        where_clause
    );
    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let count = row.get_value(0).map_err(|e| e.to_string())?.as_integer().copied().unwrap_or(0);
        let total_size = row.get_value(1).map_err(|e| e.to_string())?.as_integer().copied().unwrap_or(0);
        Ok(json!({
            "data": [{
                "title": format!("{}", count),
                "value": format!("{}", total_size),
                "label": "photos"
            }]
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
    conn.execute(
        "DELETE FROM photo_albums WHERE photo_id = ?1 AND album_id = ?2",
        (photo_id, album_id),
    )
    .await
    .map_err(|e| e.to_string())?;
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
    conn.execute("DELETE FROM photo_albums WHERE photo_id = ?1", (photo_id.clone(),))
        .await
        .map_err(|e| e.to_string())?;
    // Insert new
    for aid in album_ids {
        conn.execute(
            "INSERT OR IGNORE INTO photo_albums (photo_id, album_id) VALUES (?1, ?2)",
            (photo_id.clone(), aid),
        )
        .await
        .map_err(|e| e.to_string())?;
    }
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
        conn.execute("DELETE FROM photo_albums WHERE photo_id = ?1", (pid.clone(),))
            .await
            .map_err(|e| e.to_string())?;
        for aid in &album_ids {
            conn.execute(
                "INSERT OR IGNORE INTO photo_albums (photo_id, album_id) VALUES (?1, ?2)",
                (pid.clone(), aid.clone()),
            )
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
