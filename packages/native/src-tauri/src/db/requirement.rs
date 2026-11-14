use serde_json::{json, Value as JsonValue};
use tauri::State;
use turso::Value as TursoValue;

use super::{new_id, TursoDb};

const KINDS: [&str; 3] = ["project", "idea", "task"];

fn normalize(kind: &str, mut data: JsonValue) -> Result<JsonValue, String> {
    let obj = data.as_object_mut().ok_or("data must be an object")?;
    match kind {
        "project" => {
            let name = obj.get("name").and_then(JsonValue::as_str).unwrap_or("").trim();
            if name.is_empty() { return Err("name is required".into()); }
            obj.insert("name".into(), json!(name));
            obj.entry("description").or_insert(json!(""));
            obj.entry("color").or_insert(json!("#388b7e"));
            obj.entry("archived").or_insert(json!(false));
        }
        "idea" => {
            let title = obj.get("title").and_then(JsonValue::as_str).unwrap_or("").trim();
            if title.is_empty() { return Err("title is required".into()); }
            obj.insert("title".into(), json!(title));
            obj.entry("body").or_insert(json!(""));
            obj.entry("tag").or_insert(json!("随手记录"));
        }
        "task" => {
            let title = obj.get("title").and_then(JsonValue::as_str).unwrap_or("").trim();
            if title.is_empty() { return Err("title is required".into()); }
            obj.insert("title".into(), json!(title));
            obj.entry("projectId").or_insert(json!(""));
            obj.entry("status").or_insert(json!("todo"));
            obj.entry("priority").or_insert(json!("medium"));
            obj.entry("due").or_insert(json!(""));
            obj.entry("note").or_insert(json!(""));
            let progress = obj.get("progress").and_then(JsonValue::as_i64).unwrap_or(0).clamp(0, 100);
            obj.insert("progress".into(), json!(progress));
        }
        _ => return Err("kind is invalid".into()),
    }
    Ok(data)
}

fn row_json(row: &turso::Row) -> Result<JsonValue, String> {
    let id = row.get_value(0).map_err(|e| e.to_string())?.as_text().map_or("", |v| v).to_string();
    let kind = row.get_value(1).map_err(|e| e.to_string())?.as_text().map_or("", |v| v).to_string();
    let raw_value = row.get_value(2).map_err(|e| e.to_string())?;
    let raw = raw_value.as_text().map_or("{}", |v| v);
    let mut data: JsonValue = serde_json::from_str(raw).unwrap_or(json!({}));
    let obj = data.as_object_mut().ok_or("invalid requirement data")?;
    obj.insert("id".into(), json!(id));
    obj.insert("kind".into(), json!(kind));
    Ok(data)
}

#[tauri::command]
pub async fn db_requirement_list(state: State<'_, TursoDb>) -> Result<JsonValue, String> {
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn.query("SELECT id, kind, data FROM requirements WHERE deleted = 0 ORDER BY updated_at DESC", ()).await.map_err(|e| e.to_string())?;
    let mut result = json!({"projects": [], "ideas": [], "tasks": []});
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let item = row_json(&row)?;
        let key = match item["kind"].as_str().unwrap_or("") { "project" => "projects", "idea" => "ideas", "task" => "tasks", _ => continue };
        result[key].as_array_mut().ok_or("invalid result")?.push(item);
    }
    Ok(json!({"code": 0, "data": result}))
}

#[tauri::command]
pub async fn db_requirement_create(state: State<'_, TursoDb>, kind: String, data: JsonValue) -> Result<JsonValue, String> {
    if !KINDS.contains(&kind.as_str()) { return Err("kind is invalid".into()); }
    let data = normalize(&kind, data)?;
    let id = new_id();
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO requirements (id, kind, data) VALUES (?1, ?2, ?3)", vec![TursoValue::Text(id.clone()), TursoValue::Text(kind), TursoValue::Text(data.to_string())]).await.map_err(|e| e.to_string())?;
    let mut rows = conn.query("SELECT id, kind, data FROM requirements WHERE id = ?1", (id,)).await.map_err(|e| e.to_string())?;
    match rows.next().await.map_err(|e| e.to_string())? { Some(row) => Ok(json!({"code": 0, "data": row_json(&row)?})), None => Err("Failed to create requirement".into()) }
}

#[tauri::command]
pub async fn db_requirement_update(state: State<'_, TursoDb>, id: String, kind: String, data: JsonValue) -> Result<JsonValue, String> {
    if !KINDS.contains(&kind.as_str()) { return Err("kind is invalid".into()); }
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    let mut rows = conn.query("SELECT data FROM requirements WHERE id = ?1 AND kind = ?2 AND deleted = 0", vec![TursoValue::Text(id.clone()), TursoValue::Text(kind.clone())]).await.map_err(|e| e.to_string())?;
    let mut current: JsonValue = match rows.next().await.map_err(|e| e.to_string())? { Some(row) => serde_json::from_str(row.get_value(0).map_err(|e| e.to_string())?.as_text().map_or("{}", |v| v)).unwrap_or(json!({})), None => return Err("Requirement not found".into()) };
    let current_obj = current.as_object_mut().ok_or("invalid requirement data")?;
    let patch = data.as_object().ok_or("data must be an object")?;
    for (key, value) in patch { current_obj.insert(key.clone(), value.clone()); }
    let data = normalize(&kind, current)?;
    conn.execute("UPDATE requirements SET data = ?1, updated_at = datetime('now') WHERE id = ?2 AND kind = ?3 AND deleted = 0", vec![TursoValue::Text(data.to_string()), TursoValue::Text(id.clone()), TursoValue::Text(kind)]).await.map_err(|e| e.to_string())?;
    let mut rows = conn.query("SELECT id, kind, data FROM requirements WHERE id = ?1", (id,)).await.map_err(|e| e.to_string())?;
    match rows.next().await.map_err(|e| e.to_string())? { Some(row) => Ok(json!({"code": 0, "data": row_json(&row)?})), None => Err("Requirement not found".into()) }
}

#[tauri::command]
pub async fn db_requirement_delete(state: State<'_, TursoDb>, id: String, kind: String) -> Result<(), String> {
    if !KINDS.contains(&kind.as_str()) { return Err("kind is invalid".into()); }
    let conn = state.0.connect().map_err(|e| e.to_string())?;
    conn.execute("UPDATE requirements SET deleted = 1, updated_at = datetime('now') WHERE id = ?1 AND kind = ?2", vec![TursoValue::Text(id), TursoValue::Text(kind)]).await.map_err(|e| e.to_string())?;
    Ok(())
}
