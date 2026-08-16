use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

fn normalize_todo(mut val: JsonValue) -> JsonValue {
    if let Some(obj) = val.as_object_mut() {
        let quadrant = obj.get("quadrant").and_then(|v| v.as_i64()).unwrap_or(4);
        obj.insert("quadrant".to_string(), json!(quadrant));

        let completed = obj
            .get("completed")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| obj.get("completed").and_then(|v| v.as_i64()).map(|v| v != 0).unwrap_or(false));
        obj.insert("completed".to_string(), json!(completed));

        let title = obj.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        obj.insert("title".to_string(), json!(title));

        let note = obj.get("note").and_then(|v| v.as_str()).unwrap_or("").to_string();
        obj.insert("note".to_string(), json!(note));

        let due_date = obj.get("dueDate").and_then(|v| v.as_str()).unwrap_or("").to_string();
        obj.insert("dueDate".to_string(), json!(due_date));
    }
    val
}

fn merge_todo_row(row: &JsonValue) -> JsonValue {
    normalize_todo(merge_row(row))
}

#[tauri::command]
pub async fn db_todo_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT * FROM todos WHERE deleted = 0 ORDER BY completed ASC, updated_at DESC",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_todo_row(&val));
    }

    Ok(json!({ "code": 0, "data": items }))
}

#[tauri::command]
pub async fn db_todo_create(
    state: State<'_, TursoDb>,
    title: String,
    note: Option<String>,
    quadrant: Option<i64>,
    due_date: Option<String>,
) -> Result<JsonValue, String> {
    if title.trim().is_empty() {
        return Err("title is required".to_string());
    }
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();
    let quadrant_value = quadrant.unwrap_or(4);
    if !(1..=4).contains(&quadrant_value) {
        return Err("quadrant is invalid".to_string());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let data = json!({
        "title": title,
        "note": note.unwrap_or_default(),
        "dueDate": due_date.unwrap_or_default(),
        "createdAt": now,
        "completedAt": null,
    })
    .to_string();

    conn.execute(
        "INSERT INTO todos (id, completed, quadrant, data) VALUES (?1, 0, ?2, ?3)",
        vec![
            TursoValue::Text(id.clone()),
            TursoValue::Integer(quadrant_value),
            TursoValue::Text(data),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM todos WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_todo_row(&val) }))
    } else {
        Err("Failed to create todo".to_string())
    }
}

#[tauri::command]
pub async fn db_todo_update(
    state: State<'_, TursoDb>,
    id: String,
    title: Option<String>,
    note: Option<String>,
    quadrant: Option<i64>,
    due_date: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    // 读取现有 data 合并
    let mut rows = conn
        .query("SELECT data FROM todos WHERE id = ?1 AND deleted = 0", (id.clone(),))
        .await
        .map_err(|e| e.to_string())?;
    let existing = match rows.next().await.map_err(|e| e.to_string())? {
        Some(row) => {
            let data_str = row
                .get_value(0)
                .map_err(|e| e.to_string())?
                .as_text()
                .map_or("{}", |v| v)
                .to_string();
            serde_json::from_str::<JsonValue>(&data_str).unwrap_or(json!({}))
        }
        None => return Err("Todo not found".to_string()),
    };

    let mut merged = existing;
    if let Some(obj) = merged.as_object_mut() {
        if let Some(t) = title {
            obj.insert("title".to_string(), json!(t));
        }
        if let Some(n) = note {
            obj.insert("note".to_string(), json!(n));
        }
        if let Some(d) = due_date {
            obj.insert("dueDate".to_string(), json!(d));
        }
    }

    if let Some(q) = quadrant {
        if !(1..=4).contains(&q) {
            return Err("quadrant is invalid".to_string());
        }
        conn.execute(
            "UPDATE todos SET quadrant = ?1, data = ?2, updated_at = datetime('now') WHERE id = ?3",
            vec![
                TursoValue::Integer(q),
                TursoValue::Text(merged.to_string()),
                TursoValue::Text(id.clone()),
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE todos SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (merged.to_string(), id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    let mut rows = conn
        .query("SELECT * FROM todos WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_todo_row(&val) }))
    } else {
        Err("Todo not found".to_string())
    }
}

#[tauri::command]
pub async fn db_todo_toggle(state: State<'_, TursoDb>, id: String) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT completed, data FROM todos WHERE id = ?1 AND deleted = 0",
            (id.clone(),),
        )
        .await
        .map_err(|e| e.to_string())?;
    let (completed, data_str) = match rows.next().await.map_err(|e| e.to_string())? {
        Some(row) => {
            let completed = row
                .get_value(0)
                .map_err(|e| e.to_string())?
                .as_integer()
                .copied()
                .unwrap_or(0)
                != 0;
            let data_str = row
                .get_value(1)
                .map_err(|e| e.to_string())?
                .as_text()
                .map_or("{}", |v| v)
                .to_string();
            (completed, data_str)
        }
        None => return Err("Todo not found".to_string()),
    };

    let new_completed = !completed;
    let completed_at: JsonValue = if new_completed {
        json!(chrono::Utc::now().to_rfc3339())
    } else {
        json!(null)
    };
    let mut data: JsonValue = serde_json::from_str(&data_str).unwrap_or(json!({}));
    if let Some(obj) = data.as_object_mut() {
        obj.insert("completedAt".to_string(), completed_at);
    }

    conn.execute(
        "UPDATE todos SET completed = ?1, data = ?2, updated_at = datetime('now') WHERE id = ?3",
        vec![
            TursoValue::Integer(if new_completed { 1 } else { 0 }),
            TursoValue::Text(data.to_string()),
            TursoValue::Text(id.clone()),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM todos WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_todo_row(&val) }))
    } else {
        Err("Todo not found".to_string())
    }
}

#[tauri::command]
pub async fn db_todo_delete(state: State<'_, TursoDb>, id: String) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE todos SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
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
        "completed",
        "quadrant",
        "data",
    ];
    for (i, key) in keys.iter().enumerate() {
        if let Ok(val) = row.get_value(i) {
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
