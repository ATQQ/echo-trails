//! 静默 OTA 热更新：用本地离线包覆盖壳内置前端资源。
//!
//! 目录结构（AppLocalData/ota）：
//!   staging/   正在下载解压、尚未启用的包
//!   current/   当前生效的包
//!   previous/  上一个包（回滚兜底）
//!
//! `Assets::get` 查找顺序：current -> previous -> 壳内置资源。
//! 冷启动时若 staging 完整会自动提升为 current，实现“下载后下次启动生效”。

use crate::command::common::{
    calculate_md5, compare_version, emit_progress, remove_file, stream_download,
};
use serde::Serialize;
use std::borrow::Cow;
use std::io::{copy, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::path::BaseDirectory;
use tauri::utils::assets::{AssetKey, CspHash};
use tauri::{AppHandle, Assets, Manager, Runtime};

const INDEX_FILE: &str = "index.html";
const VERSION_FILE: &str = ".ota-version";
const HASH_FILE: &str = ".ota-md5";

#[derive(Default)]
struct OtaRoots {
    current: Option<PathBuf>,
    previous: Option<PathBuf>,
}

struct OtaInner<R: Runtime> {
    embedded: Box<dyn Assets<R>>,
    roots: Mutex<OtaRoots>,
}

pub struct OtaAssets<R: Runtime> {
    inner: Arc<OtaInner<R>>,
}

impl<R: Runtime> Clone for OtaAssets<R> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

/// 占位资源：`generate_context!` 需要先交出内置资源，之后再替换为 `OtaAssets`。
pub struct PendingAssets;

impl<R: Runtime> Assets<R> for PendingAssets {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }

    fn iter(&self) -> Box<tauri::utils::assets::AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }

    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

impl<R: Runtime> OtaAssets<R> {
    pub fn new(embedded: Box<dyn Assets<R>>) -> Self {
        Self {
            inner: Arc::new(OtaInner {
                embedded,
                roots: Mutex::new(OtaRoots::default()),
            }),
        }
    }

    fn set_roots(&self, current: Option<PathBuf>, previous: Option<PathBuf>) {
        if let Ok(mut roots) = self.inner.roots.lock() {
            roots.current = current;
            roots.previous = previous;
        }
    }
}

impl<R: Runtime> Assets<R> for OtaAssets<R> {
    fn setup(&self, app: &tauri::App<R>) {
        self.inner.embedded.setup(app);
        if let Ok(root) = ota_root(app.handle()) {
            recover_ota_dirs(&root);
            discard_stale_ota_packages(&root, compiled_embedded_web_version());
            if complete_dir(&root.join("staging")).is_some() {
                let _ = activate_staging(&root);
            }
            let current = complete_dir(&root.join("current"));
            let previous = complete_dir(&root.join("previous"));
            self.set_roots(current, previous);
        }
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let relative = normalize_asset_key(key.as_ref())?;
        if let Ok(roots) = self.inner.roots.lock() {
            for dir in [&roots.current, &roots.previous].into_iter().flatten() {
                if let Some(bytes) = read_asset(dir, &relative) {
                    return Some(Cow::Owned(bytes));
                }
            }
        }
        self.inner.embedded.get(key)
    }

    fn iter(&self) -> Box<tauri::utils::assets::AssetsIter<'_>> {
        self.inner.embedded.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.inner.embedded.csp_hashes(html_path)
    }
}

#[derive(Serialize)]
pub struct NativeBuild {
    pub version: String,
    #[serde(rename = "nativeHash")]
    pub native_hash: String,
    pub commit: String,
    /// 已启用的热更新包版本（没有热更新时为空串）。
    #[serde(rename = "webVersion")]
    pub web_version: String,
    /// 已启用的热更新包 hash（下载包的 md5，没有热更新时为空串）。
    #[serde(rename = "webHash")]
    pub web_hash: String,
}

pub fn compiled_native_hash() -> &'static str {
    option_env!("NATIVE_HASH").unwrap_or("dev")
}

pub fn compiled_native_commit() -> &'static str {
    option_env!("NATIVE_GIT_COMMIT").unwrap_or("unknown")
}

pub fn compiled_embedded_web_version() -> &'static str {
    option_env!("EMBEDDED_WEB_VERSION").unwrap_or("0.0.0")
}

/// 当前生效的 Web 版本：取 内置版本 / 已启用离线包 / 前端上报 三者中的最大值。
///
/// 必须以已启用的离线包为准。若只信前端上报，一旦离线包自报版本低于清单版本，
/// 就会出现“启用新包 → 重载 → 仍判定有新包 → 再启用”的刷新死循环。
pub fn resolve_effective_web_version(
    reported: &str,
    active_ota: Option<&str>,
    embedded: &str,
) -> String {
    let mut best = embedded.trim().to_string();
    for candidate in [active_ota.unwrap_or(""), reported] {
        let candidate = candidate.trim();
        if !candidate.is_empty() && compare_version(candidate, &best) > 0 {
            best = candidate.to_string();
        }
    }
    best
}

/// 已启用离线包的 (版本, md5)（AppLocalData/ota/current）。
fn active_ota_package<R: Runtime>(app: &AppHandle<R>) -> Option<(String, String)> {
    let root = ota_root(app).ok()?;
    let current = complete_dir(&root.join("current"))?;
    let version = package_version(&current)?;
    let hash = std::fs::read_to_string(current.join(HASH_FILE))
        .ok()
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    Some((version, hash))
}

/// 已启用离线包的版本（AppLocalData/ota/current/.ota-version）。
fn active_ota_version<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    active_ota_package(app).map(|(version, _)| version)
}

/// 供 `check_update` 使用的当前 Web 版本（离线包优先，避免自激刷新）。
pub fn effective_web_version<R: Runtime>(app: &AppHandle<R>, reported: &str) -> String {
    let active = active_ota_version(app);
    resolve_effective_web_version(reported, active.as_deref(), compiled_embedded_web_version())
}

#[tauri::command]
pub fn get_native_build(app: AppHandle) -> NativeBuild {
    let active = active_ota_package(&app);
    NativeBuild {
        version: env!("CARGO_PKG_VERSION").to_string(),
        native_hash: compiled_native_hash().to_string(),
        commit: compiled_native_commit().to_string(),
        web_version: active
            .as_ref()
            .map(|(version, _)| version.clone())
            .unwrap_or_default(),
        web_hash: active.map(|(_, hash)| hash).unwrap_or_default(),
    }
}

#[tauri::command]
pub async fn prepare_web_package<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    version: String,
    md5: Option<String>,
    file_size: Option<u64>,
) -> Result<String, String> {
    stage_web_package(&app, url, version, md5, file_size).await?;
    Ok("ok".to_string())
}

#[tauri::command]
pub fn activate_web_package<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    commit_staging(&app)
}

#[tauri::command]
pub async fn apply_web_package<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    version: String,
    md5: Option<String>,
    file_size: Option<u64>,
) -> Result<String, String> {
    stage_web_package(&app, url, version, md5, file_size).await?;
    emit_progress(&app, 100, 100, "applying");
    commit_staging(&app)
}

async fn stage_web_package<R: Runtime>(
    app: &AppHandle<R>,
    url: String,
    version: String,
    md5: Option<String>,
    file_size: Option<u64>,
) -> Result<PathBuf, String> {
    let root = ota_root(app)?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    recover_ota_dirs(&root);

    let staging = root.join("staging");
    let wanted = version.trim();
    if complete_dir(&staging).is_some()
        && !wanted.is_empty()
        && staging_version(&root).as_deref() == Some(wanted)
    {
        return Ok(staging);
    }

    let zip_path = root.join("staging.zip");
    cleanup_path(&zip_path);
    cleanup_path(&staging);

    let progress_total = file_size.filter(|size| *size > 0);
    let expected_md5 = md5
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    const MAX_DOWNLOAD_ATTEMPTS: u8 = 2;
    let mut last_error: Option<String> = None;
    for attempt in 0..MAX_DOWNLOAD_ATTEMPTS {
        if attempt > 0 {
            cleanup_path(&zip_path);
            emit_progress(app, 0, 0, "retrying");
        }
        match stream_download(
            app,
            &url,
            &zip_path,
            progress_total,
            expected_md5.is_none(),
            "downloaded file is not a zip",
        )
        .await
        {
            Ok(()) => {}
            Err(error) => {
                last_error = Some(error);
                continue;
            }
        }
        if let Some(expected) = expected_md5 {
            match calculate_md5(&zip_path) {
                Ok(current_md5) if current_md5.eq_ignore_ascii_case(expected) => {}
                Ok(current_md5) => {
                    let actual_size = std::fs::metadata(&zip_path)
                        .map(|meta| meta.len())
                        .unwrap_or(0);
                    cleanup_path(&zip_path);
                    last_error = Some(format!(
                        "MD5 mismatch: expected {}, got {} ({} bytes)",
                        expected, current_md5, actual_size
                    ));
                    continue;
                }
                Err(error) => {
                    cleanup_path(&zip_path);
                    last_error = Some(error);
                    continue;
                }
            }
        }
        last_error = None;
        break;
    }
    if let Some(error) = last_error {
        cleanup_path(&zip_path);
        cleanup_path(&staging);
        return Err(error);
    }

    // 记录实际下载包的 md5，供版本页展示“热更新包 hash”。
    let actual_md5 = calculate_md5(&zip_path).unwrap_or_default();

    emit_progress(app, 100, 100, "extracting");
    if let Err(error) = extract_zip(&zip_path, &staging) {
        cleanup_path(&zip_path);
        cleanup_path(&staging);
        return Err(error);
    }
    cleanup_path(&zip_path);

    if complete_dir(&staging).is_none() {
        cleanup_path(&staging);
        return Err("web package is missing index.html".to_string());
    }

    if !wanted.is_empty() {
        let _ = std::fs::write(staging.join(VERSION_FILE), wanted.as_bytes());
    }
    if !actual_md5.is_empty() {
        let _ = std::fs::write(staging.join(HASH_FILE), actual_md5.as_bytes());
    }
    Ok(staging)
}

fn commit_staging<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    let root = ota_root(app)?;
    let (current, previous) = activate_staging(&root)?;
    if let Some(assets) = app.try_state::<OtaAssets<R>>() {
        assets.set_roots(Some(current), previous);
    }
    Ok("ok".to_string())
}

fn ota_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .resolve("ota", BaseDirectory::AppLocalData)
        .map_err(|e| e.to_string())
}

fn recover_ota_dirs(root: &Path) {
    let staging = root.join("staging");
    let current = root.join("current");
    let previous = root.join("previous");
    if staging.exists() && complete_dir(&staging).is_none() {
        cleanup_path(&staging);
    }
    cleanup_path(&root.join("staging.zip"));

    if current.exists() && complete_dir(&current).is_none() {
        cleanup_path(&current);
    }
    if complete_dir(&current).is_none() && complete_dir(&previous).is_some() {
        let _ = std::fs::rename(&previous, &current);
    }
}

/// 仅保留严格新于壳内置 Web 版本的离线包，避免旧热更新盖住新 APK 内置资源。
fn should_keep_ota(ota_version: Option<&str>, embedded_version: &str) -> bool {
    let Some(version) = ota_version.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    compare_version(version, embedded_version) > 0
}

fn package_version(dir: &Path) -> Option<String> {
    std::fs::read_to_string(dir.join(VERSION_FILE))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn discard_stale_ota_packages(root: &Path, embedded_version: &str) {
    for name in ["staging", "current", "previous"] {
        let dir = root.join(name);
        if !dir.exists() {
            continue;
        }
        if !should_keep_ota(package_version(&dir).as_deref(), embedded_version) {
            cleanup_path(&dir);
        }
    }
}

fn staging_version(root: &Path) -> Option<String> {
    package_version(&root.join("staging"))
}

fn activate_staging(root: &Path) -> Result<(PathBuf, Option<PathBuf>), String> {
    let staging = root.join("staging");
    let current = root.join("current");
    let previous = root.join("previous");

    if complete_dir(&staging).is_none() {
        return Err("staging package is incomplete".to_string());
    }

    if previous.exists() {
        cleanup_path(&previous);
    }

    if current.exists() {
        if let Err(error) = std::fs::rename(&current, &previous) {
            cleanup_path(&staging);
            return Err(error.to_string());
        }
    }

    if let Err(error) = std::fs::rename(&staging, &current) {
        if previous.exists() && !current.exists() {
            let _ = std::fs::rename(&previous, &current);
        }
        cleanup_path(&staging);
        return Err(error.to_string());
    }

    Ok((current, complete_dir(&previous)))
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    cleanup_path(dest);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else {
            return Err("zip contains an unsafe path".to_string());
        };
        let out_path = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
        copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        out.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn read_asset(dir: &Path, relative: &str) -> Option<Vec<u8>> {
    let candidates = [
        relative.to_string(),
        format!("{relative}.html"),
        format!("{relative}/{INDEX_FILE}"),
    ];
    for candidate in candidates {
        let path = dir.join(&candidate);
        if !path.starts_with(dir) || !path.is_file() {
            continue;
        }
        if let Ok(bytes) = std::fs::read(path) {
            return Some(bytes);
        }
    }
    None
}

fn complete_dir(dir: &Path) -> Option<PathBuf> {
    if dir.join(INDEX_FILE).is_file() {
        Some(dir.to_path_buf())
    } else {
        None
    }
}

fn cleanup_path(path: &Path) {
    if path.is_dir() {
        let _ = std::fs::remove_dir_all(path);
        return;
    }
    if path.exists() {
        remove_file(path);
    }
}

fn normalize_asset_key(key: &str) -> Option<String> {
    let trimmed = key.trim().trim_start_matches('/');
    if trimmed.is_empty() {
        return Some(INDEX_FILE.to_string());
    }
    let path = Path::new(trimmed);
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        )
    }) {
        return None;
    }
    Some(trimmed.replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn normalize_asset_key_strips_slash_and_rejects_parent() {
        assert_eq!(
            normalize_asset_key("/index.html").as_deref(),
            Some("index.html")
        );
        assert_eq!(normalize_asset_key("").as_deref(), Some("index.html"));
        assert!(normalize_asset_key("../secret").is_none());
    }

    #[test]
    fn effective_web_version_takes_max_of_active_package_and_reported() {
        // 离线包已启用：即使前端 bundle 自报旧版本，也按离线包版本算，避免反复刷新。
        assert_eq!(
            resolve_effective_web_version("0.9.3", Some("0.9.3.1"), "0.9.3"),
            "0.9.3.1"
        );
        // 没有离线包时用前端上报值。
        assert_eq!(
            resolve_effective_web_version("0.9.3.1", None, "0.9.3"),
            "0.9.3.1"
        );
        // 比壳内置版本旧的离线包不应把版本拉低。
        assert_eq!(
            resolve_effective_web_version("", Some("0.9.2"), "0.9.3"),
            "0.9.3"
        );
        // 前端上报更高时取前端值。
        assert_eq!(
            resolve_effective_web_version("0.9.4", Some("0.9.3.1"), "0.9.3"),
            "0.9.4"
        );
    }

    #[test]
    fn recover_incomplete_current_falls_back_to_previous() {
        let root = std::env::temp_dir().join(format!("echo-trails-ota-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("current")).unwrap();
        std::fs::create_dir_all(root.join("previous")).unwrap();
        std::fs::write(root.join("previous").join(INDEX_FILE), b"ok").unwrap();
        recover_ota_dirs(&root);
        assert!(root.join("current").join(INDEX_FILE).is_file());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn recover_keeps_complete_staging() {
        let root =
            std::env::temp_dir().join(format!("echo-trails-ota-keep-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("staging")).unwrap();
        std::fs::write(root.join("staging").join(INDEX_FILE), b"next").unwrap();
        recover_ota_dirs(&root);
        assert!(root.join("staging").join(INDEX_FILE).is_file());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn recover_drops_incomplete_staging() {
        let root =
            std::env::temp_dir().join(format!("echo-trails-ota-drop-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("staging")).unwrap();
        std::fs::write(root.join("staging").join("chunk.js"), b"x").unwrap();
        recover_ota_dirs(&root);
        assert!(!root.join("staging").join(INDEX_FILE).is_file());
        assert!(!root.join("staging").exists() || complete_dir(&root.join("staging")).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn activate_staging_promotes_pending_package() {
        let root = std::env::temp_dir().join(format!("echo-trails-ota-act-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("current")).unwrap();
        std::fs::create_dir_all(root.join("staging")).unwrap();
        std::fs::write(root.join("current").join(INDEX_FILE), b"old").unwrap();
        std::fs::write(root.join("staging").join(INDEX_FILE), b"new").unwrap();
        activate_staging(&root).unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("current").join(INDEX_FILE)).unwrap(),
            "new"
        );
        assert_eq!(
            std::fs::read_to_string(root.join("previous").join(INDEX_FILE)).unwrap(),
            "old"
        );
        assert!(!root.join("staging").exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn extract_zip_rejects_parent_paths() {
        let dir = std::env::temp_dir().join(format!("echo-trails-zip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let zip_path = dir.join("bad.zip");
        let dest = dir.join("out");
        let file = std::fs::File::create(&zip_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("../evil.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"nope").unwrap();
        zip.finish().unwrap();
        let result = extract_zip(&zip_path, &dest);
        assert!(result.is_err(), "{result:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn should_keep_ota_only_when_strictly_newer() {
        assert!(!should_keep_ota(Some("0.2.12"), "0.2.13"));
        assert!(!should_keep_ota(Some("0.2.13"), "0.2.13"));
        assert!(should_keep_ota(Some("0.2.14"), "0.2.13"));
        assert!(!should_keep_ota(None, "0.2.13"));
        assert!(!should_keep_ota(Some(""), "0.2.13"));
        assert!(!should_keep_ota(Some("  "), "0.2.13"));
    }

    fn write_ota_package(dir: &Path, version: Option<&str>, body: &[u8]) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(INDEX_FILE), body).unwrap();
        if let Some(version) = version {
            std::fs::write(dir.join(VERSION_FILE), version.as_bytes()).unwrap();
        }
    }

    #[test]
    fn discard_drops_older_equal_and_unversioned_packages() {
        let root = std::env::temp_dir().join(format!(
            "echo-trails-ota-stale-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&root);
        write_ota_package(&root.join("current"), Some("0.2.12"), b"old");
        write_ota_package(&root.join("previous"), None, b"legacy");
        write_ota_package(&root.join("staging"), Some("0.2.13"), b"equal");

        discard_stale_ota_packages(&root, "0.2.13");

        assert!(!root.join("current").exists());
        assert!(!root.join("previous").exists());
        assert!(!root.join("staging").exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn discard_keeps_newer_ota_packages() {
        let root = std::env::temp_dir().join(format!(
            "echo-trails-ota-keep-new-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&root);
        write_ota_package(&root.join("current"), Some("0.2.14"), b"hot");
        write_ota_package(&root.join("staging"), Some("0.2.15"), b"next");

        discard_stale_ota_packages(&root, "0.2.13");

        assert_eq!(
            std::fs::read_to_string(root.join("current").join(INDEX_FILE)).unwrap(),
            "hot"
        );
        assert_eq!(
            std::fs::read_to_string(root.join("staging").join(INDEX_FILE)).unwrap(),
            "next"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn stale_staging_is_not_activated_after_discard() {
        let root = std::env::temp_dir().join(format!(
            "echo-trails-ota-no-promote-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&root);
        write_ota_package(&root.join("current"), Some("0.2.12"), b"old-current");
        write_ota_package(&root.join("staging"), Some("0.2.12"), b"old-staging");

        recover_ota_dirs(&root);
        discard_stale_ota_packages(&root, "0.2.13");
        if complete_dir(&root.join("staging")).is_some() {
            let _ = activate_staging(&root);
        }

        assert!(complete_dir(&root.join("current")).is_none());
        assert!(complete_dir(&root.join("staging")).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }
}
