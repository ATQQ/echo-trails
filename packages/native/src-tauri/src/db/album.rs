use std::collections::{HashMap, HashSet};

use serde_json::{json, Value as JsonValue};
use tauri::State;

use super::{merge_row, new_id, TursoDb};

#[tauri::command]
pub async fn db_album_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;

    let mut albums = Vec::new();
    {
        let mut rows = conn
            .query(
                "SELECT * FROM albums WHERE deleted = 0 ORDER BY updated_at DESC",
                (),
            )
            .await
            .map_err(|e| e.to_string())?;

        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let val = row_to_json(&row)?;
            albums.push(merge_row(&val));
        }
    }

    let mut album_photos: HashMap<String, HashSet<String>> = HashMap::new();
    let mut photo_albums: HashMap<String, HashSet<String>> = HashMap::new();

    match conn
        .query("SELECT photo_id, album_id FROM photo_albums", ())
        .await
    {
        Ok(mut relation_rows) => loop {
            let row = match relation_rows.next().await {
                Ok(Some(row)) => row,
                Ok(None) => break,
                Err(e) => {
                    log::warn!("Failed to read photo_albums row: {}", e);
                    break;
                }
            };
            let photo_id = row
                .get_value(0)
                .ok()
                .and_then(|v| v.as_text().map(|v| v.to_string()))
                .unwrap_or_default();
            let album_id = row
                .get_value(1)
                .ok()
                .and_then(|v| v.as_text().map(|v| v.to_string()))
                .unwrap_or_default();
            if photo_id.is_empty() || album_id.is_empty() {
                continue;
            }
            album_photos
                .entry(album_id.clone())
                .or_default()
                .insert(photo_id.clone());
            photo_albums.entry(photo_id).or_default().insert(album_id);
        },
        Err(e) => log::warn!("Failed to enrich albums from photo_albums: {}", e),
    }

    let mut cover_candidates: HashMap<String, (String, String)> = HashMap::new();
    let mut pending_relations: Vec<(String, String)> = Vec::new();
    match conn
        .query(
            "SELECT id, last_modified, data FROM photos WHERE deleted = 0",
            (),
        )
        .await
    {
        Ok(mut photo_rows) => loop {
            let row = match photo_rows.next().await {
                Ok(Some(row)) => row,
                Ok(None) => break,
                Err(e) => {
                    log::warn!("Failed to read photos row for album enrichment: {}", e);
                    break;
                }
            };
            let photo_id = row
                .get_value(0)
                .ok()
                .and_then(|v| v.as_text().map(|v| v.to_string()))
                .unwrap_or_default();
            let last_modified = row
                .get_value(1)
                .ok()
                .and_then(|v| v.as_text().map(|v| v.to_string()))
                .unwrap_or_default();
            let data_str = row
                .get_value(2)
                .ok()
                .and_then(|v| v.as_text().map(|v| v.to_string()))
                .unwrap_or_else(|| "{}".to_string());
            if photo_id.is_empty() {
                continue;
            }

            let data_json =
                serde_json::from_str::<JsonValue>(&data_str).unwrap_or_else(|_| json!({}));
            if let Some(album_ids) = data_json.get("albumId").and_then(|v| v.as_array()) {
                for album_id in album_ids.iter().filter_map(|v| v.as_str()) {
                    if album_id.is_empty() {
                        continue;
                    }
                    album_photos
                        .entry(album_id.to_string())
                        .or_default()
                        .insert(photo_id.clone());
                    photo_albums
                        .entry(photo_id.clone())
                        .or_default()
                        .insert(album_id.to_string());
                    pending_relations.push((photo_id.clone(), album_id.to_string()));
                }
            }

            let cover_key = data_json
                .get("key")
                .and_then(|v| v.as_str())
                .filter(|v| !v.is_empty())
                .unwrap_or(&photo_id)
                .to_string();

            if let Some(related_album_ids) = photo_albums.get(&photo_id) {
                for album_id in related_album_ids {
                    let should_replace = cover_candidates
                        .get(album_id)
                        .map(|(_, existing_time)| last_modified > *existing_time)
                        .unwrap_or(true);
                    if should_replace {
                        cover_candidates
                            .insert(album_id.clone(), (cover_key.clone(), last_modified.clone()));
                    }
                }
            }
        },
        Err(e) => log::warn!("Failed to enrich albums from photos: {}", e),
    }

    for (photo_id, album_id) in pending_relations {
        if let Err(e) = conn
            .execute(
                "INSERT OR IGNORE INTO photo_albums (photo_id, album_id) VALUES (?1, ?2)",
                (photo_id, album_id),
            )
            .await
        {
            log::warn!("Failed to backfill photo album relation: {}", e);
        }
    }

    for album in &mut albums {
        let album_id = album
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let count = album_photos.get(&album_id).map(|v| v.len()).unwrap_or(0);
        album["count"] = json!(count);

        let cover_key = album.get("coverKey").and_then(|v| v.as_str()).unwrap_or("");
        if cover_key.is_empty() {
            if let Some((key, _)) = cover_candidates.get(&album_id) {
                album["coverKey"] = json!(key);
            }
        }
    }

    // Split by style
    let mut large = Vec::new();
    let mut small = Vec::new();
    for album in albums {
        let style = album
            .get("style")
            .and_then(|v| v.as_str())
            .unwrap_or("small");
        if style == "large" {
            large.push(album);
        } else {
            small.push(album);
        }
    }

    Ok(json!({ "data": { "large": large, "small": small } }))
}

#[tauri::command]
pub async fn db_album_get(state: State<'_, TursoDb>, id: String) -> Result<JsonValue, String> {
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
    let tags_json = tags
        .map(|t| serde_json::to_string(&t).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or_else(|| "[]".to_string());

    let data_val = data.unwrap_or_else(|| {
        json!({
            "name": name,
            "description": description.unwrap_or_default(),
            "style": style_val,
            "tags": serde_json::from_str::<JsonValue>(&tags_json).unwrap_or(json!([]))
        })
        .to_string()
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
        if let Some(n) = name {
            existing["name"] = json!(n);
        }
        if let Some(d) = description {
            existing["description"] = json!(d);
        }
        if let Some(s) = style {
            existing["style"] = json!(s);
        }
        if let Some(t) = tags {
            existing["tags"] = json!(t);
        }
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
        let data_str = row
            .get_value(0)
            .map_err(|e| e.to_string())?
            .as_text()
            .map_or("{}", |v| v)
            .to_string();
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
