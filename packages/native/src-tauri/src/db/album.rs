use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_album_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT * FROM albums WHERE deleted = 0 ORDER BY updated_at DESC", ())
        .await
        .map_err(|e| e.to_string())?;

    let mut albums = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        let mut merged = merge_row(&val);

        // Count photos in this album
        let album_id = merged.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let mut count_rows = conn
            .query(
                "SELECT COUNT(*) FROM photo_albums pa INNER JOIN photos p ON pa.photo_id = p.id WHERE pa.album_id = ?1 AND p.deleted = 0",
                (album_id.clone(),),
            )
            .await
            .map_err(|e| e.to_string())?;
        let count: i64 = if let Some(cr) = count_rows.next().await.map_err(|e| e.to_string())? {
            cr.get_value(0).map_err(|e| e.to_string())?.as_integer().copied().unwrap_or(0)
        } else {
            0
        };
        merged["count"] = json!(count);

        // Get cover from first photo if coverKey not set
        let cover_key = merged.get("coverKey").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if cover_key.is_empty() && count > 0 {
            let mut cover_rows = conn
                .query(
                    "SELECT p.id FROM photo_albums pa INNER JOIN photos p ON pa.photo_id = p.id WHERE pa.album_id = ?1 AND p.deleted = 0 ORDER BY p.last_modified DESC LIMIT 1",
                    (album_id,),
                )
                .await
                .map_err(|e| e.to_string())?;
            if let Some(cr) = cover_rows.next().await.map_err(|e| e.to_string())? {
                let photo_id = cr.get_value(0).map_err(|e| e.to_string())?.as_text().map_or("", |v| v).to_string();
                merged["coverKey"] = json!(photo_id);
            }
        }

        albums.push(merged);
    }

    // Split by style
    let mut large = Vec::new();
    let mut small = Vec::new();
    for album in albums {
        let style = album.get("style").and_then(|v| v.as_str()).unwrap_or("small");
        if style == "large" {
            large.push(album);
        } else {
            small.push(album);
        }
    }

    Ok(json!({ "data": { "large": large, "small": small } }))
}

#[tauri::command]
pub async fn db_album_get(
    state: State<'_, TursoDb>,
    id: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query("SELECT * FROM albums WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Album not found".to_string())
    }
}

#[tauri::command]
pub async fn db_album_create(
    state: State<'_, TursoDb>,
    id: Option<String>,
    name: String,
    description: Option<String>,
    style: Option<String>,
    tags: Option<Vec<String>>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let album_id = id.unwrap_or_else(new_id);
    let style_val = style.unwrap_or_else(|| "small".to_string());
    let tags_json = tags.map(|t| serde_json::to_string(&t).unwrap_or_else(|_| "[]".to_string())).unwrap_or_else(|| "[]".to_string());

    let data_val = data.unwrap_or_else(|| {
        json!({
            "name": name,
            "description": description.unwrap_or_default(),
            "tags": serde_json::from_str::<JsonValue>(&tags_json).unwrap_or(json!([]))
        }).to_string()
    });

    conn.execute(
        "INSERT INTO albums (id, data) VALUES (?1, ?2)",
        (album_id.clone(), data_val),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM albums WHERE id = ?1", (album_id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Failed to retrieve created album".to_string())
    }
}

#[tauri::command]
pub async fn db_album_update(
    state: State<'_, TursoDb>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    style: Option<String>,
    tags: Option<Vec<String>>,
    data: Option<String>,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    if let Some(d) = data {
        conn.execute(
            "UPDATE albums SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (d, id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        // Merge into existing data
        let mut existing = get_album_data(&conn, &id).await?;
        if let Some(n) = name { existing["name"] = json!(n); }
        if let Some(d) = description { existing["description"] = json!(d); }
        if let Some(s) = style { existing["style"] = json!(s); }
        if let Some(t) = tags { existing["tags"] = json!(t); }
        conn.execute(
            "UPDATE albums SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            (existing.to_string(), id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    let mut rows = conn
        .query("SELECT * FROM albums WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Album not found".to_string())
    }
}

#[tauri::command]
pub async fn db_album_update_cover(
    state: State<'_, TursoDb>,
    id: String,
    key: String,
) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut existing = get_album_data(&conn, &id).await?;
    existing["coverKey"] = json!(key);
    conn.execute(
        "UPDATE albums SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
        (existing.to_string(), id.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query("SELECT * FROM albums WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let val = row_to_json(&row)?;
        Ok(merge_row(&val))
    } else {
        Err("Album not found".to_string())
    }
}

async fn get_album_data(conn: &turso::Connection, id: &str) -> Result<JsonValue, String> {
    let mut rows = conn
        .query("SELECT data FROM albums WHERE id = ?1", (id,))
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let data_str = row.get_value(0).map_err(|e| e.to_string())?.as_text().map_or("{}", |v| v).to_string();
        serde_json::from_str(&data_str).map_err(|e| e.to_string())
    } else {
        Err("Album not found".to_string())
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
