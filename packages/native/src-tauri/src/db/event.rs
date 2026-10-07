use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

fn merge_event_row(row: &JsonValue) -> JsonValue {
    merge_row(row)
}

fn merge_record_row(row: &JsonValue) -> JsonValue {
    merge_row(row)
}

// ==================== 事件定义 ====================

#[tauri::command]
pub async fn db_event_list(
    state: State<'_, TursoDb>,
    family_id: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let family_id = family_id.unwrap_or_else(|| "default".to_string());
    let mut rows = conn
        .query(
            // sortOrder 升序为主，缺省为 0；同一序号回退到创建时间，保证顺序稳定
            "SELECT * FROM events WHERE deleted = 0 AND family_id = ?1 \
             ORDER BY COALESCE(json_extract(data, '$.sortOrder'), 0) ASC, \
             json_extract(data, '$.createdAt') ASC",
            (family_id,),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_event_row(&val));
    }
    Ok(json!({ "code": 0, "data": items }))
}

#[tauri::command]
pub async fn db_event_create(
    state: State<'_, TursoDb>,
    family_id: Option<String>,
    name: String,
    emoji: Option<String>,
    unit: Option<String>,
    default_amount: Option<f64>,
    sort_order: Option<i64>,
) -> Result<JsonValue, String> {
    if name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();
    let family_id = family_id.unwrap_or_else(|| "default".to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let data = json!({
        "name": name,
        "emoji": emoji.unwrap_or_default(),
        "unit": unit.unwrap_or_default(),
        "defaultAmount": default_amount,
        "sortOrder": sort_order.unwrap_or(0),
        "createdAt": now,
    })
    .to_string();

    conn.execute(
        "INSERT INTO events (id, family_id, data) VALUES (?1, ?2, ?3)",
        vec![
            TursoValue::Text(id.clone()),
            TursoValue::Text(family_id),
            TursoValue::Text(data),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM events WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_event_row(&val) }))
    } else {
        Err("Failed to create event".to_string())
    }
}

#[tauri::command]
pub async fn db_event_update(
    state: State<'_, TursoDb>,
    id: String,
    name: Option<String>,
    emoji: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT data FROM events WHERE id = ?1 AND deleted = 0",
            (id.clone(),),
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut existing = match rows.next().await.map_err(|e| e.to_string())? {
        Some(row) => {
            let data_str = row
                .get_value(0)
                .map_err(|e| e.to_string())?
                .as_text()
                .map_or("{}", |v| v)
                .to_string();
            serde_json::from_str::<JsonValue>(&data_str).unwrap_or(json!({}))
        }
        None => return Err("Event not found".to_string()),
    };

    if let Some(obj) = existing.as_object_mut() {
        if let Some(n) = name {
            obj.insert("name".to_string(), json!(n));
        }
        if let Some(e) = emoji {
            obj.insert("emoji".to_string(), json!(e));
        }
        // 按 key 合并：能区分「字段没传」与「显式清空成 '' / null」
        if let Some(raw) = data {
            if let Ok(JsonValue::Object(patch)) = serde_json::from_str::<JsonValue>(&raw) {
                for (key, value) in patch {
                    obj.insert(key, value);
                }
            }
        }
    }

    conn.execute(
        "UPDATE events SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
        (existing.to_string(), id.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM events WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_event_row(&val) }))
    } else {
        Err("Event not found".to_string())
    }
}

#[tauri::command]
pub async fn db_event_delete(state: State<'_, TursoDb>, id: String) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE events SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== 事件打卡记录 ====================

#[tauri::command]
pub async fn db_event_record_list(
    state: State<'_, TursoDb>,
    family_id: Option<String>,
    event_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(2000);
    let offset = (page - 1) * page_size;
    let family_id = family_id.unwrap_or_else(|| "default".to_string());

    let mut conditions = vec!["deleted = 0".to_string(), "family_id = ?1".to_string()];
    let mut params: Vec<TursoValue> = vec![TursoValue::Text(family_id)];
    let mut param_idx = 2;

    if let Some(ref eid) = event_id {
        conditions.push(format!("event_id = ?{}", param_idx));
        params.push(TursoValue::Text(eid.clone()));
        param_idx += 1;
    }
    if let Some(ref sd) = start_date {
        conditions.push(format!("date >= ?{}", param_idx));
        params.push(TursoValue::Text(sd.clone()));
        param_idx += 1;
    }
    if let Some(ref ed) = end_date {
        conditions.push(format!("date <= ?{}", param_idx));
        params.push(TursoValue::Text(ed.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        "SELECT * FROM event_records WHERE {} ORDER BY json_extract(data, '$.occurredAt') DESC LIMIT {} OFFSET {}",
        where_clause, page_size, offset
    );

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = record_row_to_json(&row)?;
        items.push(merge_record_row(&val));
    }
    Ok(json!({ "code": 0, "data": items }))
}

#[tauri::command]
pub async fn db_event_record_create(
    state: State<'_, TursoDb>,
    family_id: Option<String>,
    event_id: String,
    event_name: Option<String>,
    emoji: Option<String>,
    occurred_at: String,
    date: String,
    note: Option<String>,
    amount: Option<f64>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();
    let family_id = family_id.unwrap_or_else(|| "default".to_string());

    // 未显式传入快照时，从 events 表反查事件名与 emoji
    let mut name = event_name.unwrap_or_default();
    let mut emo = emoji.unwrap_or_default();
    if name.is_empty() || emo.is_empty() {
        if let Ok(mut rows) = conn
            .query(
                "SELECT data FROM events WHERE id = ?1 AND deleted = 0",
                (event_id.clone(),),
            )
            .await
        {
            if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
                if let Ok(val) = row.get_value(0) {
                    if let Some(data_str) = val.as_text() {
                        if let Ok(parsed) = serde_json::from_str::<JsonValue>(data_str) {
                            if name.is_empty() {
                                name = parsed
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                            }
                            if emo.is_empty() {
                                emo = parsed
                                    .get("emoji")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    let data_val = data.unwrap_or_else(|| {
        json!({
            "eventId": event_id,
            "eventName": name,
            "emoji": emo,
            "occurredAt": occurred_at,
            "date": date,
            "note": note.unwrap_or_default(),
            "amount": amount,
        })
        .to_string()
    });

    conn.execute(
        "INSERT INTO event_records (id, family_id, event_id, date, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        vec![
            TursoValue::Text(id.clone()),
            TursoValue::Text(family_id),
            TursoValue::Text(event_id),
            TursoValue::Text(date),
            TursoValue::Text(data_val),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM event_records WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = record_row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_record_row(&val) }))
    } else {
        Err("Failed to create event record".to_string())
    }
}

#[tauri::command]
pub async fn db_event_record_update(
    state: State<'_, TursoDb>,
    id: String,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT data FROM event_records WHERE id = ?1 AND deleted = 0",
            (id.clone(),),
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut existing = match rows.next().await.map_err(|e| e.to_string())? {
        Some(row) => {
            let data_str = row
                .get_value(0)
                .map_err(|e| e.to_string())?
                .as_text()
                .map_or("{}", |v| v)
                .to_string();
            serde_json::from_str::<JsonValue>(&data_str).unwrap_or(json!({}))
        }
        None => return Err("Event record not found".to_string()),
    };

    // 按 key 合并：能区分「字段没传」与「显式清空成 '' / null」
    if let Some(raw) = data {
        if let Ok(JsonValue::Object(patch)) = serde_json::from_str::<JsonValue>(&raw) {
            if let Some(obj) = existing.as_object_mut() {
                for (key, value) in patch {
                    obj.insert(key, value);
                }
            }
        }
    }

    conn.execute(
        "UPDATE event_records SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
        (existing.to_string(), id.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM event_records WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = record_row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_record_row(&val) }))
    } else {
        Err("Event record not found".to_string())
    }
}

#[tauri::command]
pub async fn db_event_record_delete(state: State<'_, TursoDb>, id: String) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE event_records SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn row_to_json(row: &turso::Row) -> Result<JsonValue, String> {
    // events 表共 7 列：id, remote_id, sync_status, updated_at, deleted, family_id, data
    let mut map = serde_json::Map::new();
    let keys = [
        "id",
        "remote_id",
        "sync_status",
        "updated_at",
        "deleted",
        "family_id",
        "data",
    ];
    for (i, key) in keys.iter().enumerate() {
        if let Ok(val) = row.get_value(i) {
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}

fn record_row_to_json(row: &turso::Row) -> Result<JsonValue, String> {
    // event_records 表共 9 列：id, remote_id, sync_status, updated_at, deleted, family_id, event_id, date, data
    let mut map = serde_json::Map::new();
    let keys = [
        "id",
        "remote_id",
        "sync_status",
        "updated_at",
        "deleted",
        "family_id",
        "event_id",
        "date",
        "data",
    ];
    for (i, key) in keys.iter().enumerate() {
        if let Ok(val) = row.get_value(i) {
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
