use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{new_id, TursoDb};

#[tauri::command]
pub async fn db_usage_record_add(
    state: State<'_, TursoDb>,
    target_id: String,
    target_type: String,
    action_type: String,
    description: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();

    let data_val = data.unwrap_or_else(|| {
        json!({
            "description": description.unwrap_or_default()
        }).to_string()
    });

    conn.execute(
        "INSERT INTO usage_records (id, target_id, target_type, action_type, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        (id.clone(), target_id, target_type, action_type, data_val),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({ "code": 0, "data": { "id": id } }))
}

#[tauri::command]
pub async fn db_usage_record_list(
    state: State<'_, TursoDb>,
    target_id: String,
    target_type: Option<String>,
    action_type: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let mut conditions = vec!["target_id = ?1".to_string()];
    let mut params: Vec<TursoValue> = vec![TursoValue::Text(target_id)];
    let mut param_idx = 2;

    if let Some(ref tt) = target_type {
        conditions.push(format!("target_type = ?{}", param_idx));
        params.push(TursoValue::Text(tt.clone()));
        param_idx += 1;
    }
    if let Some(ref at) = action_type {
        conditions.push(format!("action_type = ?{}", param_idx));
        params.push(TursoValue::Text(at.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!("SELECT * FROM usage_records WHERE {} ORDER BY updated_at DESC", where_clause);

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(super::merge_row(&val));
    }

    Ok(json!({ "code": 0, "data": items }))
}

fn row_to_json(row: &turso::Row) -> Result<JsonValue, String> {
    let mut map = serde_json::Map::new();
    for i in 0..8 {
        if let Ok(val) = row.get_value(i as usize) {
            let key = match i {
                0 => "id",
                1 => "remote_id",
                2 => "sync_status",
                3 => "updated_at",
                4 => "target_id",
                5 => "target_type",
                6 => "action_type",
                7 => "data",
                _ => continue,
            };
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
