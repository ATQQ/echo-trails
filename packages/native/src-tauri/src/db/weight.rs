use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_weight_list(
    state: State<'_, TursoDb>,
    family_id: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(30);
    let offset = (page - 1) * page_size;

    let mut conditions = vec!["deleted = 0".to_string()];
    let mut params: Vec<TursoValue> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref fid) = family_id {
        conditions.push(format!("family_id = ?{}", param_idx));
        params.push(TursoValue::Text(fid.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        "SELECT * FROM weights WHERE {} ORDER BY json_extract(data, '$.date') DESC LIMIT {} OFFSET {}",
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
pub async fn db_weight_add(
    state: State<'_, TursoDb>,
    weight: f64,
    date: String,
    tips: Option<String>,
    family_id: String,
    operator: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();

    let data_val = data.unwrap_or_else(|| {
        json!({
            "weight": weight,
            "date": date,
            "tips": tips.unwrap_or_default(),
            "operator": operator.unwrap_or_default(),
            "familyId": family_id
        }).to_string()
    });

    conn.execute(
        "INSERT INTO weights (id, family_id, data) VALUES (?1, ?2, ?3)",
        (id.clone(), family_id, data_val),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM weights WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Err("Failed to create weight record".to_string())
    }
}

#[tauri::command]
pub async fn db_weight_update(
    state: State<'_, TursoDb>,
    id: String,
    weight: Option<f64>,
    date: Option<String>,
    tips: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    if let Some(d) = data {
        conn.execute(
            "UPDATE weights SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (d, id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        let mut existing = get_weight_data(&conn, &id).await?;
        if let Some(w) = weight { existing["weight"] = json!(w); }
        if let Some(d) = date { existing["date"] = json!(d); }
        if let Some(t) = tips { existing["tips"] = json!(t); }
        conn.execute(
            "UPDATE weights SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (existing.to_string(), id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    let mut rows = conn
        .query("SELECT * FROM weights WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(json!({ "code": 0, "data": merge_row(&val) }))
    } else {
        Err("Weight record not found".to_string())
    }
}

#[tauri::command]
pub async fn db_weight_delete(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE weights SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_weight_data(conn: &turso::Connection, id: &str) -> Result<JsonValue, String> {
    let mut rows = conn
        .query("SELECT data FROM weights WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let data_str = row.get_value(0).map_err(|e| e.to_string())?.as_text().map_or("{}", |v| v).to_string();
        serde_json::from_str(&data_str).map_err(|e| e.to_string())
    } else {
        Err("Weight record not found".to_string())
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
