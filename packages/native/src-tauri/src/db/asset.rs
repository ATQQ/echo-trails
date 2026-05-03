use serde_json::{json, Value as JsonValue};
use tauri::State;

use super::{merge_row, new_id, TursoDb};

// ==================== Asset Categories ====================

#[tauri::command]
pub async fn db_asset_category_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT * FROM asset_categories WHERE deleted = 0", ())
        .await
        .map_err(|e| e.to_string())?;

    let mut all = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row, "asset_categories")?;
        all.push(merge_row(&val));
    }

    // Build hierarchy: parent categories with sub-categories
    let mut result = Vec::new();
    for cat in &all {
        let parent_id = cat.get("parentId").and_then(|v| v.as_str()).unwrap_or("");
        if parent_id.is_empty() {
            let mut cat_with_subs = cat.clone();
            let cat_id = cat.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let subs: Vec<_> = all.iter()
                .filter(|s| s.get("parentId").and_then(|v| v.as_str()) == Some(cat_id))
                .cloned()
                .collect();
            cat_with_subs["subCategories"] = json!(subs);
            result.push(cat_with_subs);
        }
    }

    Ok(json!({ "data": result }))
}

#[tauri::command]
pub async fn db_asset_category_create(
    state: State<'_, TursoDb>,
    name: String,
    parent_id: Option<String>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();

    let data_val = data.unwrap_or_else(|| {
        let mut map = serde_json::Map::new();
        map.insert("name".to_string(), json!(name));
        if let Some(ref pid) = parent_id {
            map.insert("parentId".to_string(), json!(pid));
        }
        serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string())
    });

    conn.execute(
        "INSERT INTO asset_categories (id, data) VALUES (?1, ?2)",
        (id.clone(), data_val),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM asset_categories WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row, "asset_categories")?;
        Ok(json!({ "data": merge_row(&val) }))
    } else {
        Err("Failed to create category".to_string())
    }
}

#[tauri::command]
pub async fn db_asset_category_delete(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE asset_categories SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== Assets ====================

#[tauri::command]
pub async fn db_asset_list(
    state: State<'_, TursoDb>,
    category_id: Option<String>,
    sub_category_id: Option<String>,
    status: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let mut conditions = vec!["deleted = 0".to_string()];
    let mut params: Vec<turso::Value> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref cid) = category_id {
        conditions.push(format!("json_extract(data, '$.categoryId') = ?{}", param_idx));
        params.push(turso::Value::Text(cid.clone()));
        param_idx += 1;
    }
    if let Some(ref scid) = sub_category_id {
        conditions.push(format!("json_extract(data, '$.subCategoryId') = ?{}", param_idx));
        params.push(turso::Value::Text(scid.clone()));
        param_idx += 1;
    }
    if let Some(ref s) = status {
        conditions.push(format!("json_extract(data, '$.status') = ?{}", param_idx));
        params.push(turso::Value::Text(s.clone()));
        #[allow(unused_assignments)]
        { param_idx += 1; }
    }

    let where_clause = if conditions.is_empty() { "1=1".to_string() } else { conditions.join(" AND ") };
    let sql = format!("SELECT * FROM assets WHERE {} ORDER BY updated_at DESC", where_clause);

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row, "assets")?;
        let mut merged = merge_row(&val);
        // Compute costPerUse, costPerDay, daysHeld
        let price = merged.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let purchase_date = merged.get("purchaseDate").and_then(|v| v.as_str()).unwrap_or("");
        let usage_count = merged.get("usageCount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let calc_type = merged.get("calcType").and_then(|v| v.as_str()).unwrap_or("count").to_string();

        if let Ok(pd) = chrono::NaiveDate::parse_from_str(purchase_date, "%Y-%m-%d") {
            let days_held = (chrono::Local::now().date_naive() - pd).num_days().max(1) as f64;
            merged["daysHeld"] = json!(days_held);
            if days_held > 0.0 {
                merged["costPerDay"] = json!((price / days_held * 100.0).round() / 100.0);
            }
            if usage_count > 0.0 && calc_type == "count" {
                merged["costPerUse"] = json!((price / usage_count * 100.0).round() / 100.0);
            }
        }

        items.push(merged);
    }

    Ok(json!({ "data": items }))
}

#[tauri::command]
pub async fn db_asset_create(
    state: State<'_, TursoDb>,
    data: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let id = new_id();

    conn.execute(
        "INSERT INTO assets (id, data) VALUES (?1, ?2)",
        (id.clone(), data),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM assets WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row, "assets")?;
        Ok(merge_row(&val))
    } else {
        Err("Failed to create asset".to_string())
    }
}

#[tauri::command]
pub async fn db_asset_update(
    state: State<'_, TursoDb>,
    id: String,
    data: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE assets SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
        (data, id),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_asset_delete(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE assets SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_asset_stats(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT data FROM assets WHERE deleted = 0 AND json_extract(data, '$.status') = 'active'",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut total_value = 0.0f64;
    let mut total_daily_cost = 0.0f64;

    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let data_str = row.get_value(0).map_err(|e| e.to_string())?.as_text().map_or("{}", |v| v).to_string();
        if let Ok(data) = serde_json::from_str::<JsonValue>(&data_str) {
            let price = data.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0);
            total_value += price;

            let purchase_date = data.get("purchaseDate").and_then(|v| v.as_str()).unwrap_or("");
            if let Ok(pd) = chrono::NaiveDate::parse_from_str(purchase_date, "%Y-%m-%d") {
                let days = (chrono::Local::now().date_naive() - pd).num_days().max(1) as f64;
                if days > 0.0 {
                    total_daily_cost += price / days;
                }
            }
        }
    }

    Ok(json!({
        "data": {
            "totalValue": (total_value * 100.0).round() / 100.0,
            "dailyCost": (total_daily_cost * 100.0).round() / 100.0
        }
    }))
}

fn row_to_json(row: &turso::Row, table: &str) -> Result<JsonValue, String> {
    let mut map = serde_json::Map::new();
    let col_count = match table {
        "asset_categories" => 6,
        "assets" => 6,
        _ => 6,
    };
    for i in 0..col_count {
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
