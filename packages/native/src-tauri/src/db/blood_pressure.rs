use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_bp_list(
    state: State<'_, TursoDb>,
    family_id: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(50);
    let offset = (page - 1) * page_size;

    let mut conditions = vec!["deleted = 0".to_string()];
    let mut params: Vec<TursoValue> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref fid) = family_id {
        conditions.push(format!("family_id = ?{}", param_idx));
        params.push(TursoValue::Text(fid.clone()));
        param_idx += 1;
    }
    if let Some(ref st) = start_time {
        conditions.push(format!("date >= ?{}", param_idx));
        params.push(TursoValue::Text(st.clone()));
        param_idx += 1;
    }
    if let Some(ref et) = end_time {
        conditions.push(format!("date <= ?{}", param_idx));
        params.push(TursoValue::Text(et.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        "SELECT * FROM blood_pressures WHERE {} ORDER BY date DESC LIMIT {} OFFSET {}",
        where_clause, page_size, offset
    );

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_row(&val));
    }

    Ok(json!({ "code": 0, "data": items }))
}

#[tauri::command]
pub async fn db_bp_add(
    state: State<'_, TursoDb>,
    family_id: String,
    sbp: i64,
    dbp: i64,
    heart_rate: i64,
    blood_oxygen: Option<i64>,
    arm: Option<String>,
    date: String,
    note: Option<String>,
    operator: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();

    let data_val = data.unwrap_or_else(|| {
        json!({
            "sbp": sbp,
            "dbp": dbp,
            "heartRate": heart_rate,
            "bloodOxygen": blood_oxygen,
            "arm": arm,
            "date": date,
            "note": note.unwrap_or_default(),
            "operator": operator.unwrap_or_default(),
            "familyId": family_id
        }).to_string()
    });

    conn.execute(
        "INSERT INTO blood_pressures (id, family_id, date, data) VALUES (?1, ?2, ?3, ?4)",
        (id.clone(), family_id, date, data_val),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM blood_pressures WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Err("Failed to create blood pressure record".to_string())
    }
}

#[tauri::command]
pub async fn db_bp_update(
    state: State<'_, TursoDb>,
    id: String,
    data: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    // Update fixed columns from data JSON if present
    let parsed: JsonValue = serde_json::from_str(&data).unwrap_or(json!({}));
    let mut sets = vec!["data = ?1".to_string(), "updated_at = datetime('now')".to_string()];
    let mut params: Vec<TursoValue> = vec![TursoValue::Text(data.clone())];
    let mut param_idx = 2;

    if let Some(fid) = parsed.get("familyId").and_then(|v| v.as_str()) {
        sets.push(format!("family_id = ?{}", param_idx));
        params.push(TursoValue::Text(fid.to_string()));
        param_idx += 1;
    }
    if let Some(d) = parsed.get("date").and_then(|v| v.as_str()) {
        sets.push(format!("date = ?{}", param_idx));
        params.push(TursoValue::Text(d.to_string()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    params.push(TursoValue::Text(id.clone()));
    let sql = format!("UPDATE blood_pressures SET {} WHERE id = ?{}", sets.join(", "), param_idx);
    conn.execute(&sql, params).await.map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM blood_pressures WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Err("Record not found".to_string())
    }
}

#[tauri::command]
pub async fn db_bp_delete(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE blood_pressures SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
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
                4 => "deleted",
                5 => "family_id",
                6 => "date",
                7 => "data",
                _ => continue,
            };
            map.insert(key.to_string(), super::turso_value_to_json(&val));
        }
    }
    Ok(JsonValue::Object(map))
}
