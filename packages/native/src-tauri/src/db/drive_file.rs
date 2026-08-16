use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

const DRIVE_TABLE: &str = "drive_files";

fn merge_drive_row(row: &JsonValue) -> JsonValue {
    let mut val = merge_row(row);
    if let Some(obj) = val.as_object_mut() {
        // 固定列 snake_case → 前端 camelCase
        if let Some(parent) = obj.remove("parent_id") {
            obj.insert("parentId".to_string(), parent);
        }
        if let Some(kind) = obj.get("kind").cloned() {
            obj.insert("kind".to_string(), kind);
        }
        let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        obj.insert("name".to_string(), json!(name));
        let provider = obj
            .get("provider")
            .and_then(|v| v.as_str())
            .unwrap_or("bitiful")
            .to_string();
        obj.insert("provider".to_string(), json!(provider));
    }
    val
}

async fn get_row_by_id(
    conn: &turso::Connection,
    id: &str,
) -> Result<Option<JsonValue>, String> {
    let mut rows = conn
        .query(&format!("SELECT * FROM {} WHERE id = ?1", DRIVE_TABLE), (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(row_to_json(&row)?))
    } else {
        Ok(None)
    }
}

async fn build_breadcrumb(
    conn: &turso::Connection,
    parent_id: &str,
) -> Result<Vec<JsonValue>, String> {
    let mut chain: Vec<JsonValue> = Vec::new();
    let mut current = parent_id.to_string();
    // 防环：上限 50 层
    for _ in 0..50 {
        if current.is_empty() {
            break;
        }
        let row = match get_row_by_id(conn, &current).await? {
            Some(v) => v,
            None => break,
        };
        let deleted = row.get("deleted").and_then(|v| v.as_i64()).unwrap_or(0) != 0;
        let kind = row.get("kind").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if deleted || kind != "folder" {
            break;
        }
        let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let data = row.get("data").and_then(|v| v.as_str()).unwrap_or("{}");
        let data_json: JsonValue = serde_json::from_str(data).unwrap_or(json!({}));
        let name = data_json
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        chain.insert(0, json!({ "id": id, "name": name }));
        current = row
            .get("parent_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
    }
    Ok(chain)
}

// 收集文件夹自身及其所有后代 id（递归软删除用）
async fn collect_descendant_ids(
    conn: &turso::Connection,
    root_id: &str,
) -> Result<Vec<String>, String> {
    let mut ids = vec![root_id.to_string()];
    let mut frontier = vec![root_id.to_string()];
    for _ in 0..50 {
        if frontier.is_empty() {
            break;
        }
        let mut params: Vec<TursoValue> = Vec::new();
        let placeholders = frontier
            .iter()
            .map(|id| {
                params.push(TursoValue::Text(id.clone()));
                format!("?{}", params.len())
            })
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT id FROM {} WHERE deleted = 0 AND parent_id IN ({})",
            DRIVE_TABLE, placeholders
        );
        let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
        let mut next = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let id = row
                .get_value(0)
                .map_err(|e| e.to_string())?
                .as_text()
                .map_or("".to_string(), |v| v.to_string());
            if !id.is_empty() {
                next.push(id);
            }
        }
        ids.extend(next.iter().cloned());
        frontier = next;
    }
    Ok(ids)
}

#[tauri::command]
pub async fn db_drive_file_list(
    state: State<'_, TursoDb>,
    parent_id: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let parent = parent_id.unwrap_or_default();

    let mut rows = conn
        .query(
            &format!(
                "SELECT * FROM {} WHERE deleted = 0 AND parent_id = ?1 ORDER BY kind ASC, updated_at DESC",
                DRIVE_TABLE
            ),
            (parent.clone(),),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_drive_row(&val));
    }

    let breadcrumb = build_breadcrumb(&conn, &parent).await?;

    Ok(json!({ "code": 0, "data": { "items": items, "breadcrumb": breadcrumb } }))
}

#[tauri::command]
pub async fn db_drive_file_create_folder(
    state: State<'_, TursoDb>,
    name: String,
    parent_id: Option<String>,
) -> Result<JsonValue, String> {
    if name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();
    let parent = parent_id.unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();
    let data = json!({
        "name": name,
        "provider": "bitiful",
        "createdAt": now,
    })
    .to_string();

    conn.execute(
        &format!(
            "INSERT INTO {} (id, parent_id, kind, data) VALUES (?1, ?2, 'folder', ?3)",
            DRIVE_TABLE
        ),
        vec![
            TursoValue::Text(id.clone()),
            TursoValue::Text(parent),
            TursoValue::Text(data),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    match get_row_by_id(&conn, &id).await? {
        Some(val) => Ok(json!({ "code": 0, "data": merge_drive_row(&val) })),
        None => Err("Failed to create folder".to_string()),
    }
}

#[tauri::command]
pub async fn db_drive_file_create(
    state: State<'_, TursoDb>,
    key: String,
    name: String,
    size: Option<i64>,
    mime_type: Option<String>,
    parent_id: Option<String>,
) -> Result<JsonValue, String> {
    if key.is_empty() || name.is_empty() {
        return Err("key and name are required".to_string());
    }
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();
    let parent = parent_id.unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();
    let data = json!({
        "name": name,
        "key": key,
        "size": size.unwrap_or(0),
        "mimeType": mime_type.unwrap_or_default(),
        "provider": "bitiful",
        "createdAt": now,
    })
    .to_string();

    conn.execute(
        &format!(
            "INSERT INTO {} (id, parent_id, kind, data) VALUES (?1, ?2, 'file', ?3)",
            DRIVE_TABLE
        ),
        vec![
            TursoValue::Text(id.clone()),
            TursoValue::Text(parent),
            TursoValue::Text(data),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    match get_row_by_id(&conn, &id).await? {
        Some(val) => Ok(json!({ "code": 0, "data": merge_drive_row(&val) })),
        None => Err("Failed to create drive file".to_string()),
    }
}

#[tauri::command]
pub async fn db_drive_file_rename(
    state: State<'_, TursoDb>,
    id: String,
    name: String,
) -> Result<JsonValue, String> {
    if name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let row = match get_row_by_id(&conn, &id).await? {
        Some(v) => v,
        None => return Err("Drive file not found".to_string()),
    };
    let data_str = row.get("data").and_then(|v| v.as_str()).unwrap_or("{}");
    let mut data: JsonValue = serde_json::from_str(data_str).unwrap_or(json!({}));
    if let Some(obj) = data.as_object_mut() {
        obj.insert("name".to_string(), json!(name));
    }

    conn.execute(
        &format!(
            "UPDATE {} SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            DRIVE_TABLE
        ),
        (data.to_string(), id.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;

    match get_row_by_id(&conn, &id).await? {
        Some(val) => Ok(json!({ "code": 0, "data": merge_drive_row(&val) })),
        None => Err("Drive file not found".to_string()),
    }
}

#[tauri::command]
pub async fn db_drive_file_move(
    state: State<'_, TursoDb>,
    id: String,
    parent_id: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let parent = parent_id.unwrap_or_default();

    let row = match get_row_by_id(&conn, &id).await? {
        Some(v) => v,
        None => return Err("Drive file not found".to_string()),
    };

    // 文件夹移动时校验目标不是自身或其后代
    let kind = row.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    if kind == "folder" {
        if id == parent {
            return Err("cannot move to itself".to_string());
        }
        let descendants = collect_descendant_ids(&conn, &id).await?;
        if descendants.contains(&parent) {
            return Err("cannot move to its own descendant".to_string());
        }
    }

    conn.execute(
        &format!(
            "UPDATE {} SET parent_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            DRIVE_TABLE
        ),
        (parent, id.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;

    match get_row_by_id(&conn, &id).await? {
        Some(val) => Ok(json!({ "code": 0, "data": merge_drive_row(&val) })),
        None => Err("Drive file not found".to_string()),
    }
}

#[tauri::command]
pub async fn db_drive_file_delete(state: State<'_, TursoDb>, id: String) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let row = match get_row_by_id(&conn, &id).await? {
        Some(v) => v,
        None => return Err("Drive file not found".to_string()),
    };

    let kind = row.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    let ids = if kind == "folder" {
        collect_descendant_ids(&conn, &id).await?
    } else {
        vec![id]
    };

    let mut params: Vec<TursoValue> = Vec::new();
    let placeholders = ids
        .iter()
        .map(|v| {
            params.push(TursoValue::Text(v.clone()));
            format!("?{}", params.len())
        })
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "UPDATE {} SET deleted = 1, updated_at = datetime('now') WHERE id IN ({})",
        DRIVE_TABLE, placeholders
    );
    conn.execute(&sql, params).await.map_err(|e| e.to_string())?;

    Ok(())
}

fn row_to_json(row: &turso::Row) -> Result<JsonValue, String> {
    let mut map = serde_json::Map::new();
    let keys = [
        "id",
        "remote_id",
        "sync_status",
        "updated_at",
        "deleted",
        "parent_id",
        "kind",
        "data",
    ];
    for (i, key) in keys.iter().enumerate() {
        if let Ok(val) = row.get_value(i) {
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
