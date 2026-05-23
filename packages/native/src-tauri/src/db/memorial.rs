use serde_json::{json, Value as JsonValue};
use tauri::State;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_memorial_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT * FROM memorials WHERE deleted = 0 ORDER BY updated_at DESC",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        items.push(merge_row(&val));
    }

    Ok(json!({ "data": items }))
}

#[tauri::command]
pub async fn db_memorial_create(
    state: State<'_, TursoDb>,
    id: Option<String>,
    data: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mid = id.unwrap_or_else(new_id);

    conn.execute(
        "INSERT INTO memorials (id, data) VALUES (?1, ?2)",
        (mid.clone(), data),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM memorials WHERE id = ?1", (mid,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Failed to create memorial".to_string())
    }
}

#[tauri::command]
pub async fn db_memorial_update(
    state: State<'_, TursoDb>,
    id: String,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    if let Some(d) = data {
        let mut merged_data = get_memorial_data(&conn, &id)
            .await
            .unwrap_or_else(|_| json!({}));
        if let Ok(incoming) = serde_json::from_str::<JsonValue>(&d) {
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
        conn.execute(
            "UPDATE memorials SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (merged_data.to_string(), id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        // No data provided, nothing to update
    }

    let mut rows = conn
        .query("SELECT * FROM memorials WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Memorial not found".to_string())
    }
}

#[tauri::command]
pub async fn db_memorial_delete(state: State<'_, TursoDb>, id: String) -> Result<(), String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE memorials SET deleted = 1, updated_at = datetime('now') WHERE id = ?1",
        (id,),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_memorial_covers() -> Result<JsonValue, String> {
    let covers = vec![
        "/memorial-covers/pink-clouds.jpg",
        "/memorial-covers/minimal-leaves.jpg",
        "/memorial-covers/flower-closeup.jpg",
        "/memorial-covers/sunset-beach.jpg",
        "/memorial-covers/misty-forest.jpg",
        "/memorial-covers/gift-celebration.jpg",
        "/memorial-covers/road-trip-car.jpg",
        "/memorial-covers/party-lights.jpg",
        "/memorial-covers/starry-night.jpg",
        "/memorial-covers/books-coffee.jpg",
        "/memorial-covers/abstract-gradient.jpg",
    ];
    Ok(json!({ "data": covers }))
}

async fn get_memorial_data(conn: &turso::Connection, id: &str) -> Result<JsonValue, String> {
    let mut rows = conn
        .query("SELECT data FROM memorials WHERE id = ?1", (id,))
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
        Err("Memorial not found".to_string())
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
