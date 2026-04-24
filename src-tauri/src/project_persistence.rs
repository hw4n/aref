use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};

use crate::image_metadata::image_dimensions_from_bytes;
use chrono::Utc;
use reqwest::{
    header::{ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, COOKIE, REFERER, SET_COOKIE, USER_AGENT},
    Url,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const PROJECT_SCHEMA: &str = "app.aref/project";
const PROJECT_SCHEMA_VERSION: u32 = 2;
const RECENT_PROJECTS_VERSION: u32 = 1;
const RECENT_PROJECTS_FILENAME: &str = "recent-projects.json";
const AUTOSAVE_DIRECTORY: &str = "autosave";
const AUTOSAVE_PROJECT_FILENAME: &str = "current.json";
const LEGACY_AUTOSAVE_PROJECT_FILENAME: &str = "current.aref";
const AUTOSAVE_SESSION_FILENAME: &str = "session.json";
const MANAGED_IMPORT_DIRECTORY: &str = "managed-imports";
const PROJECT_CACHE_DIRECTORY: &str = "opened-projects";
const PROJECT_ARCHIVE_METADATA_ENTRY: &str = "project.json";
const PROJECT_ARCHIVE_ASSETS_DIRECTORY: &str = "assets";
const CHATGPT_SHARE_IMPORT_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPersistenceHandle {
    path: Option<String>,
    project: RuntimeProject,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectRecord {
    path: String,
    name: String,
    last_opened_at: String,
    exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectResult {
    path: String,
    recent_projects: Vec<RecentProjectRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedChatGptImageDraft {
    image_path: String,
    source_name: String,
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatGptShareImportResult {
    drafts: Vec<ImportedChatGptImageDraft>,
    skipped_count: usize,
}

#[derive(Debug, Deserialize)]
struct ChatGptFileDownloadResponse {
    status: String,
    download_url: Option<String>,
    file_name: Option<String>,
    error_message: Option<String>,
}

struct ChatGptImagePointer {
    file_id: String,
    query_pairs: Vec<(String, String)>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectRequest {
    path: String,
    project: RuntimeProject,
    asset_sources: Vec<ProjectAssetSourcePayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAutosaveRequest {
    current_project_path: Option<String>,
    project: RuntimeProject,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAssetSourcePayload {
    asset_id: String,
    image: PersistedAssetSource,
    thumbnail: Option<PersistedAssetSource>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PersistedAssetSource {
    Path {
        path: String,
    },
    Bytes {
        filename: Option<String>,
        bytes: Vec<u8>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProject {
    id: String,
    name: String,
    version: String,
    created_at: String,
    updated_at: String,
    camera: RuntimeCameraState,
    assets: BTreeMap<String, RuntimeAssetItem>,
    groups: BTreeMap<String, RuntimeGroupItem>,
    selection: RuntimeSelectionState,
    jobs: BTreeMap<String, RuntimeGenerationJob>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCameraState {
    x: f64,
    y: f64,
    zoom: f64,
    viewport_width: f64,
    viewport_height: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAssetItem {
    id: String,
    kind: String,
    image_path: String,
    source_name: Option<String>,
    thumbnail_path: Option<String>,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    rotation: f64,
    scale: f64,
    z_index: i64,
    locked: bool,
    hidden: bool,
    tags: Vec<String>,
    created_at: String,
    updated_at: String,
    generation: Option<RuntimeGeneratedAssetMetadata>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGeneratedAssetMetadata {
    job_id: String,
    provider: String,
    model: String,
    provider_request_id: Option<String>,
    generation_mode: Option<String>,
    prompt: String,
    negative_prompt: Option<String>,
    source_asset_ids: Vec<String>,
    settings: serde_json::Value,
    submitted_at: String,
    completed_at: Option<String>,
    status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGroupItem {
    id: String,
    name: String,
    asset_ids: Vec<String>,
    locked: bool,
    hidden: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSelectionState {
    asset_ids: Vec<String>,
    marquee: Option<RuntimeRect>,
    last_active_asset_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePoint {
    x: f64,
    y: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGenerationJob {
    id: String,
    request: RuntimeGenerationRequest,
    #[serde(default)]
    canvas_placement: RuntimePoint,
    status: String,
    created_at: String,
    started_at: Option<String>,
    completed_at: Option<String>,
    cancelled_at: Option<String>,
    error: Option<String>,
    provider_request_id: Option<String>,
    provider_mode: Option<String>,
    result_asset_ids: Vec<String>,
    attempt_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGenerationRequest {
    selected_asset_ids: Vec<String>,
    prompt: String,
    negative_prompt: Option<String>,
    provider: String,
    model: String,
    settings: RuntimeGenerationSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGenerationSettings {
    image_count: u32,
    aspect_ratio: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedProjectFile {
    schema: String,
    schema_version: u32,
    app_version: String,
    saved_at: String,
    project: PersistedProject,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedProject {
    id: String,
    name: String,
    version: String,
    created_at: String,
    updated_at: String,
    camera: RuntimeCameraState,
    assets: Vec<PersistedAssetItem>,
    groups: Vec<RuntimeGroupItem>,
    selection: PersistedSelectionState,
    jobs: Vec<RuntimeGenerationJob>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAssetItem {
    id: String,
    kind: String,
    image_path: String,
    source_name: Option<String>,
    thumbnail_path: Option<String>,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    rotation: f64,
    scale: f64,
    z_index: i64,
    locked: bool,
    hidden: bool,
    tags: Vec<String>,
    created_at: String,
    updated_at: String,
    generation: Option<RuntimeGeneratedAssetMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSelectionState {
    asset_ids: Vec<String>,
    marquee: Option<RuntimeRect>,
    last_active_asset_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecentProjectsFile {
    version: u32,
    items: Vec<RecentProjectFileEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecentProjectFileEntry {
    path: String,
    name: String,
    last_opened_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutosaveSessionFile {
    current_project_path: Option<String>,
    saved_at: String,
}

#[derive(Debug, PartialEq, Eq)]
struct StartupProjectSource {
    load_path: String,
    visible_path: Option<String>,
}

fn now_iso_string() -> String {
    Utc::now().to_rfc3339()
}

fn app_local_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn ensure_parent_directory(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Path has no parent directory: {}", normalize_path(path)))?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())
}

fn sanitize_extension(extension: &str) -> Option<String> {
    let sanitized = extension
        .trim_matches('.')
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();

    if sanitized.is_empty() {
        None
    } else {
        Some(sanitized)
    }
}

fn infer_extension(source: &PersistedAssetSource) -> String {
    match source {
        PersistedAssetSource::Path { path } => Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .and_then(sanitize_extension)
            .unwrap_or_else(|| "png".to_string()),
        PersistedAssetSource::Bytes { filename, .. } => filename
            .as_ref()
            .and_then(|value| Path::new(value).extension().and_then(|ext| ext.to_str()))
            .and_then(sanitize_extension)
            .unwrap_or_else(|| "png".to_string()),
    }
}

fn asset_directory_for_project(project_path: &Path) -> Result<(PathBuf, String), String> {
    let file_name = project_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            format!(
                "Invalid project file name: {}",
                normalize_path(project_path)
            )
        })?;
    let directory_name = format!("{file_name}-assets");
    let directory = project_path
        .parent()
        .ok_or_else(|| {
            format!(
                "Project file has no parent directory: {}",
                normalize_path(project_path)
            )
        })?
        .join(&directory_name);

    Ok((directory, directory_name))
}

fn recent_projects_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(RECENT_PROJECTS_FILENAME))
}

fn autosave_project_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_local_data_dir(app)?.join(AUTOSAVE_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(AUTOSAVE_PROJECT_FILENAME))
}

fn legacy_autosave_project_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_local_data_dir(app)?.join(AUTOSAVE_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(LEGACY_AUTOSAVE_PROJECT_FILENAME))
}

fn autosave_session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_local_data_dir(app)?.join(AUTOSAVE_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(AUTOSAVE_SESSION_FILENAME))
}

fn managed_import_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_local_data_dir(app)?.join(MANAGED_IMPORT_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn write_managed_import_bytes(
    app: &AppHandle,
    filename: &str,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let directory = managed_import_directory(app)?;
    let extension = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .and_then(sanitize_extension)
        .unwrap_or_else(|| "png".to_string());
    let target_path = directory.join(format!("{}.{}", Uuid::new_v4(), extension));

    fs::write(&target_path, bytes).map_err(|error| error.to_string())?;
    Ok(normalize_path(&target_path))
}

fn validate_chatgpt_share_url(url: &Url) -> Result<(), String> {
    let host = url.host_str().unwrap_or_default();

    if url.scheme() != "https" {
        return Err("ChatGPT import requires an https share link.".to_string());
    }

    if host != "chatgpt.com" && host != "chat.openai.com" {
        return Err("Paste a chatgpt.com/share link.".to_string());
    }

    if !url.path().starts_with("/share/") {
        return Err("Paste a ChatGPT shared conversation link.".to_string());
    }

    Ok(())
}

fn url_origin(url: &Url) -> String {
    match url.port() {
        Some(port) => format!(
            "{}://{}:{port}",
            url.scheme(),
            url.host_str().unwrap_or("chatgpt.com")
        ),
        None => format!(
            "{}://{}",
            url.scheme(),
            url.host_str().unwrap_or("chatgpt.com")
        ),
    }
}

fn extract_share_id(url: &Url) -> Option<String> {
    let mut segments = url.path_segments()?;

    match (segments.next(), segments.next()) {
        (Some("share"), Some(share_id)) if !share_id.is_empty() => Some(share_id.to_string()),
        _ => None,
    }
}

fn collect_cookie_header(headers: &reqwest::header::HeaderMap) -> String {
    headers
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .collect::<Vec<_>>()
        .join("; ")
}

fn is_chatgpt_pointer_character(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || matches!(
            character,
            ':' | '/' | '?' | '&' | '=' | '_' | '-' | '.' | '%' | '#' | '\\'
        )
}

fn decode_chatgpt_pointer(value: &str) -> String {
    value
        .trim_end_matches('\\')
        .replace("\\u0026", "&")
        .replace("&amp;", "&")
}

fn extract_chatgpt_image_asset_pointers(html: &str) -> Vec<String> {
    let marker = "sediment://";
    let mut pointers = Vec::new();
    let mut seen = BTreeSet::new();
    let mut search_start = 0;

    while let Some(relative_start) = html[search_start..].find(marker) {
        let absolute_start = search_start + relative_start;
        let mut absolute_end = absolute_start;

        for (offset, character) in html[absolute_start..].char_indices() {
            if !is_chatgpt_pointer_character(character) {
                break;
            }

            absolute_end = absolute_start + offset + character.len_utf8();
        }

        let pointer = decode_chatgpt_pointer(&html[absolute_start..absolute_end]);
        if !pointer.is_empty() && seen.insert(pointer.clone()) {
            pointers.push(pointer);
        }

        search_start = absolute_end.max(absolute_start + marker.len());
    }

    pointers
}

fn parse_query_pairs(query: &str) -> Vec<(String, String)> {
    if query.trim().is_empty() {
        return Vec::new();
    }

    let Ok(url) = Url::parse(&format!("https://chatgpt.local/?{query}")) else {
        return Vec::new();
    };

    url.query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect()
}

fn parse_chatgpt_image_pointer(pointer: &str) -> Option<ChatGptImagePointer> {
    let body = pointer.strip_prefix("sediment://")?;
    let (raw_file_id, raw_query) = body.split_once('?').unwrap_or((body, ""));
    let file_id = raw_file_id.replace('#', "*");

    if file_id.trim().is_empty() {
        return None;
    }

    Some(ChatGptImagePointer {
        file_id,
        query_pairs: parse_query_pairs(raw_query),
    })
}

fn file_name_from_path_like(value: &str) -> Option<String> {
    let file_name = value
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
        .next_back()?
        .split('?')
        .next()
        .unwrap_or_default()
        .trim();

    if file_name.is_empty() {
        None
    } else {
        Some(file_name.to_string())
    }
}

fn extension_from_content_type(content_type: Option<&str>) -> Option<String> {
    let extension = match content_type?
        .split(';')
        .next()?
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/avif" => "avif",
        "image/bmp" => "bmp",
        _ => return None,
    };

    Some(extension.to_string())
}

fn extension_from_name(value: &str) -> Option<String> {
    Path::new(value)
        .extension()
        .and_then(|extension| extension.to_str())
        .and_then(sanitize_extension)
}

fn source_name_for_chatgpt_image(
    file_id: &str,
    download_file_name: Option<&str>,
    download_url: &str,
    content_type: Option<&str>,
) -> String {
    if let Some(file_name) = download_file_name.and_then(file_name_from_path_like) {
        return file_name;
    }

    if let Some(file_name) = file_name_from_path_like(download_url) {
        if extension_from_name(&file_name).is_some() {
            return file_name;
        }
    }

    let extension = extension_from_content_type(content_type).unwrap_or_else(|| "png".to_string());
    format!(
        "chatgpt-{}.{}",
        file_id.trim_start_matches("file_"),
        extension
    )
}

fn read_recent_projects_file(app: &AppHandle) -> Result<RecentProjectsFile, String> {
    let path = recent_projects_path(app)?;

    if !path.exists() {
        return Ok(RecentProjectsFile {
            version: RECENT_PROJECTS_VERSION,
            items: Vec::new(),
        });
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

fn write_recent_projects_file(app: &AppHandle, file: &RecentProjectsFile) -> Result<(), String> {
    let path = recent_projects_path(app)?;
    ensure_parent_directory(&path)?;
    let contents = serde_json::to_string_pretty(file).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn to_recent_project_records(items: Vec<RecentProjectFileEntry>) -> Vec<RecentProjectRecord> {
    items
        .into_iter()
        .map(|item| RecentProjectRecord {
            exists: Path::new(&item.path).exists(),
            path: item.path,
            name: item.name,
            last_opened_at: item.last_opened_at,
        })
        .collect()
}

fn upsert_recent_project(
    app: &AppHandle,
    project_path: &Path,
    name: &str,
) -> Result<Vec<RecentProjectRecord>, String> {
    let mut file = read_recent_projects_file(app)?;
    let normalized_path = normalize_path(project_path);
    let timestamp = now_iso_string();

    file.items.retain(|item| item.path != normalized_path);
    file.items.insert(
        0,
        RecentProjectFileEntry {
            path: normalized_path,
            name: name.to_string(),
            last_opened_at: timestamp,
        },
    );
    file.items.truncate(10);
    write_recent_projects_file(app, &file)?;

    Ok(to_recent_project_records(file.items))
}

fn write_session_file(app: &AppHandle, current_project_path: Option<&str>) -> Result<(), String> {
    let path = autosave_session_path(app)?;
    ensure_parent_directory(&path)?;
    let contents = serde_json::to_string_pretty(&AutosaveSessionFile {
        current_project_path: current_project_path.map(|value| value.to_string()),
        saved_at: now_iso_string(),
    })
    .map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn resolve_startup_project_source(
    autosave_exists: bool,
    autosave_path: &Path,
    autosave_current_project_path: Option<String>,
    recent_items: &[RecentProjectFileEntry],
) -> Option<StartupProjectSource> {
    if autosave_exists {
        return Some(StartupProjectSource {
            load_path: normalize_path(autosave_path),
            visible_path: autosave_current_project_path,
        });
    }

    recent_items
        .iter()
        .find(|item| Path::new(&item.path).exists())
        .map(|item| StartupProjectSource {
            load_path: item.path.clone(),
            visible_path: Some(item.path.clone()),
        })
}

fn sanitize_name_component(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();

    let collapsed = sanitized
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if collapsed.is_empty() {
        "project".to_string()
    } else {
        collapsed.chars().take(48).collect()
    }
}

fn stable_hash_hex(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;

    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    format!("{hash:016x}")
}

fn project_cache_directory(app: Option<&AppHandle>) -> Result<PathBuf, String> {
    let directory = if let Some(app) = app {
        app_local_data_dir(app)?.join(PROJECT_CACHE_DIRECTORY)
    } else {
        std::env::temp_dir().join(PROJECT_CACHE_DIRECTORY)
    };

    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn extracted_project_directory(
    app: Option<&AppHandle>,
    project_path: &Path,
) -> Result<PathBuf, String> {
    let stem = project_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_name_component)
        .unwrap_or_else(|| "project".to_string());
    let suffix = stable_hash_hex(&normalize_path(project_path));

    Ok(project_cache_directory(app)?.join(format!("{stem}-{suffix}")))
}

fn reset_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())?;
    }

    fs::create_dir_all(path).map_err(|error| error.to_string())
}

fn archive_metadata_file_options() -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644)
}

fn archive_asset_file_options() -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .unix_permissions(0o644)
}

fn archive_asset_path(asset_id: &str, source: &PersistedAssetSource) -> String {
    format!(
        "{PROJECT_ARCHIVE_ASSETS_DIRECTORY}/{asset_id}.{}",
        infer_extension(source)
    )
}

fn read_asset_source_bytes(source: &PersistedAssetSource) -> Result<Vec<u8>, String> {
    match source {
        PersistedAssetSource::Path { path } => {
            fs::read(path).map_err(|error| format!("Failed to read asset from {}: {error}", path))
        }
        PersistedAssetSource::Bytes { bytes, .. } => Ok(bytes.clone()),
    }
}

fn write_bytes_to_archive<W: Write + std::io::Seek>(
    writer: &mut ZipWriter<W>,
    archive_path: &str,
    bytes: &[u8],
    options: SimpleFileOptions,
) -> Result<(), String> {
    writer
        .start_file(archive_path, options)
        .map_err(|error| error.to_string())?;
    writer.write_all(bytes).map_err(|error| error.to_string())
}

fn cleanup_legacy_sidecar_directory(project_path: &Path) {
    if let Ok((directory, _directory_name)) = asset_directory_for_project(project_path) {
        if directory.exists() {
            let _ = fs::remove_dir_all(directory);
        }
    }
}

fn build_runtime_project(
    persisted: PersistedProject,
    assets: BTreeMap<String, RuntimeAssetItem>,
) -> RuntimeProject {
    RuntimeProject {
        id: persisted.id,
        name: persisted.name,
        version: persisted.version,
        created_at: persisted.created_at,
        updated_at: persisted.updated_at,
        camera: persisted.camera,
        assets,
        groups: persisted
            .groups
            .into_iter()
            .map(|group| (group.id.clone(), group))
            .collect(),
        selection: RuntimeSelectionState {
            asset_ids: persisted.selection.asset_ids,
            marquee: None,
            last_active_asset_id: persisted.selection.last_active_asset_id,
        },
        jobs: persisted
            .jobs
            .into_iter()
            .map(|job| (job.id.clone(), job))
            .collect(),
    }
}

fn load_legacy_json_project(
    project_path: &Path,
    bytes: &[u8],
) -> Result<ProjectPersistenceHandle, String> {
    let contents = String::from_utf8(bytes.to_vec()).map_err(|error| error.to_string())?;
    let value =
        serde_json::from_str::<serde_json::Value>(&contents).map_err(|error| error.to_string())?;
    let migrated = migrate_project_file(value)?;
    let project_directory = project_path.parent().ok_or_else(|| {
        format!(
            "Project file has no parent directory: {}",
            normalize_path(project_path)
        )
    })?;
    let persisted_project = migrated.project;

    let assets = persisted_project
        .assets
        .iter()
        .map(|asset| {
            let absolute_image_path =
                normalize_path(&project_directory.join(PathBuf::from(&asset.image_path)));
            let absolute_thumbnail_path = asset
                .thumbnail_path
                .as_ref()
                .map(|path| normalize_path(&project_directory.join(PathBuf::from(path))));

            (
                asset.id.clone(),
                RuntimeAssetItem {
                    id: asset.id.clone(),
                    kind: asset.kind.clone(),
                    image_path: absolute_image_path,
                    source_name: asset.source_name.clone(),
                    thumbnail_path: absolute_thumbnail_path,
                    width: asset.width,
                    height: asset.height,
                    x: asset.x,
                    y: asset.y,
                    rotation: asset.rotation,
                    scale: asset.scale,
                    z_index: asset.z_index,
                    locked: asset.locked,
                    hidden: asset.hidden,
                    tags: asset.tags.clone(),
                    created_at: asset.created_at.clone(),
                    updated_at: asset.updated_at.clone(),
                    generation: asset.generation.clone(),
                },
            )
        })
        .collect::<BTreeMap<_, _>>();

    Ok(ProjectPersistenceHandle {
        path: Some(normalize_path(project_path)),
        project: build_runtime_project(persisted_project, assets),
    })
}

fn extract_archive_entry(
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    archive_path: &str,
    output_root: &Path,
) -> Result<String, String> {
    let mut entry = archive
        .by_name(archive_path)
        .map_err(|error| format!("Missing archive entry {archive_path}: {error}"))?;
    let target_path = output_root.join(PathBuf::from(archive_path));
    ensure_parent_directory(&target_path)?;

    let mut contents = Vec::new();
    entry
        .read_to_end(&mut contents)
        .map_err(|error| error.to_string())?;
    fs::write(&target_path, contents).map_err(|error| error.to_string())?;

    Ok(normalize_path(&target_path))
}

fn load_archive_project(
    app: Option<&AppHandle>,
    project_path: &Path,
    bytes: Vec<u8>,
) -> Result<Option<ProjectPersistenceHandle>, String> {
    let mut archive = match ZipArchive::new(Cursor::new(bytes)) {
        Ok(archive) => archive,
        Err(_) => return Ok(None),
    };

    let mut metadata = String::new();
    archive
        .by_name(PROJECT_ARCHIVE_METADATA_ENTRY)
        .map_err(|error| format!("Invalid .aref archive metadata: {error}"))?
        .read_to_string(&mut metadata)
        .map_err(|error| error.to_string())?;

    let value =
        serde_json::from_str::<serde_json::Value>(&metadata).map_err(|error| error.to_string())?;
    let migrated = migrate_project_file(value)?;
    let persisted_project = migrated.project;
    let output_root = extracted_project_directory(app, project_path)?;
    reset_directory(&output_root)?;

    let assets = persisted_project
        .assets
        .iter()
        .map(|asset| {
            let absolute_image_path =
                extract_archive_entry(&mut archive, &asset.image_path, &output_root)?;
            let absolute_thumbnail_path = match asset.thumbnail_path.as_deref() {
                Some(path) => Some(extract_archive_entry(&mut archive, path, &output_root)?),
                None => None,
            };

            Ok((
                asset.id.clone(),
                RuntimeAssetItem {
                    id: asset.id.clone(),
                    kind: asset.kind.clone(),
                    image_path: absolute_image_path,
                    source_name: asset.source_name.clone(),
                    thumbnail_path: absolute_thumbnail_path,
                    width: asset.width,
                    height: asset.height,
                    x: asset.x,
                    y: asset.y,
                    rotation: asset.rotation,
                    scale: asset.scale,
                    z_index: asset.z_index,
                    locked: asset.locked,
                    hidden: asset.hidden,
                    tags: asset.tags.clone(),
                    created_at: asset.created_at.clone(),
                    updated_at: asset.updated_at.clone(),
                    generation: asset.generation.clone(),
                },
            ))
        })
        .collect::<Result<BTreeMap<_, _>, String>>()?;

    Ok(Some(ProjectPersistenceHandle {
        path: Some(normalize_path(project_path)),
        project: build_runtime_project(persisted_project, assets),
    }))
}

fn write_project_file_to_path(
    project_path: &Path,
    project: &RuntimeProject,
    asset_sources: &[ProjectAssetSourcePayload],
) -> Result<(), String> {
    ensure_parent_directory(project_path)?;

    let asset_source_map = asset_sources
        .iter()
        .map(|source| (source.asset_id.clone(), source))
        .collect::<BTreeMap<_, _>>();

    let mut persisted_assets = Vec::with_capacity(project.assets.len());
    for asset in project.assets.values() {
        let asset_source = asset_source_map
            .get(&asset.id)
            .ok_or_else(|| format!("Missing asset save payload for {}", asset.id))?;

        persisted_assets.push(PersistedAssetItem {
            id: asset.id.clone(),
            kind: asset.kind.clone(),
            image_path: archive_asset_path(&asset.id, &asset_source.image),
            source_name: asset.source_name.clone(),
            thumbnail_path: asset_source.thumbnail.as_ref().map(|thumbnail_source| {
                archive_asset_path(&format!("{}-thumb", asset.id), thumbnail_source)
            }),
            width: asset.width,
            height: asset.height,
            x: asset.x,
            y: asset.y,
            rotation: asset.rotation,
            scale: asset.scale,
            z_index: asset.z_index,
            locked: asset.locked,
            hidden: asset.hidden,
            tags: asset.tags.clone(),
            created_at: asset.created_at.clone(),
            updated_at: asset.updated_at.clone(),
            generation: asset.generation.clone(),
        });
    }

    let persisted_project = persisted_project_file(project, persisted_assets);

    let file = fs::File::create(project_path).map_err(|error| error.to_string())?;
    let mut archive = ZipWriter::new(file);

    for asset in project.assets.values() {
        let asset_source = asset_source_map
            .get(&asset.id)
            .ok_or_else(|| format!("Missing asset save payload for {}", asset.id))?;
        let image_bytes = read_asset_source_bytes(&asset_source.image)?;
        write_bytes_to_archive(
            &mut archive,
            &archive_asset_path(&asset.id, &asset_source.image),
            &image_bytes,
            archive_asset_file_options(),
        )?;

        if let Some(thumbnail_source) = &asset_source.thumbnail {
            let thumbnail_bytes = read_asset_source_bytes(thumbnail_source)?;
            write_bytes_to_archive(
                &mut archive,
                &archive_asset_path(&format!("{}-thumb", asset.id), thumbnail_source),
                &thumbnail_bytes,
                archive_asset_file_options(),
            )?;
        }
    }

    let contents =
        serde_json::to_vec_pretty(&persisted_project).map_err(|error| error.to_string())?;
    write_bytes_to_archive(
        &mut archive,
        PROJECT_ARCHIVE_METADATA_ENTRY,
        &contents,
        archive_metadata_file_options(),
    )?;
    archive.finish().map_err(|error| error.to_string())?;
    cleanup_legacy_sidecar_directory(project_path);
    Ok(())
}

fn persisted_project_file(
    project: &RuntimeProject,
    persisted_assets: Vec<PersistedAssetItem>,
) -> PersistedProjectFile {
    PersistedProjectFile {
        schema: PROJECT_SCHEMA.to_string(),
        schema_version: PROJECT_SCHEMA_VERSION,
        app_version: project.version.clone(),
        saved_at: now_iso_string(),
        project: PersistedProject {
            id: project.id.clone(),
            name: project.name.clone(),
            version: project.version.clone(),
            created_at: project.created_at.clone(),
            updated_at: project.updated_at.clone(),
            camera: project.camera.clone(),
            assets: persisted_assets,
            groups: project.groups.values().cloned().collect(),
            selection: PersistedSelectionState {
                asset_ids: project.selection.asset_ids.clone(),
                marquee: None,
                last_active_asset_id: project.selection.last_active_asset_id.clone(),
            },
            jobs: project.jobs.values().cloned().collect(),
        },
    }
}

fn persisted_assets_from_runtime_paths(project: &RuntimeProject) -> Vec<PersistedAssetItem> {
    project
        .assets
        .values()
        .map(|asset| PersistedAssetItem {
            id: asset.id.clone(),
            kind: asset.kind.clone(),
            image_path: asset.image_path.clone(),
            source_name: asset.source_name.clone(),
            thumbnail_path: asset.thumbnail_path.clone(),
            width: asset.width,
            height: asset.height,
            x: asset.x,
            y: asset.y,
            rotation: asset.rotation,
            scale: asset.scale,
            z_index: asset.z_index,
            locked: asset.locked,
            hidden: asset.hidden,
            tags: asset.tags.clone(),
            created_at: asset.created_at.clone(),
            updated_at: asset.updated_at.clone(),
            generation: asset.generation.clone(),
        })
        .collect()
}

fn write_autosave_project_to_path(
    project_path: &Path,
    project: &RuntimeProject,
) -> Result<(), String> {
    ensure_parent_directory(project_path)?;
    let persisted_project =
        persisted_project_file(project, persisted_assets_from_runtime_paths(project));
    let contents =
        serde_json::to_vec_pretty(&persisted_project).map_err(|error| error.to_string())?;
    fs::write(project_path, contents).map_err(|error| error.to_string())
}

fn load_project_file_internal(
    app: Option<&AppHandle>,
    project_path: &Path,
) -> Result<ProjectPersistenceHandle, String> {
    let bytes = fs::read(project_path).map_err(|error| error.to_string())?;

    if let Some(handle) = load_archive_project(app, project_path, bytes.clone())? {
        return Ok(handle);
    }

    load_legacy_json_project(project_path, &bytes)
}

fn migrate_project_file(value: serde_json::Value) -> Result<PersistedProjectFile, String> {
    let schema_version = value
        .get("schemaVersion")
        .and_then(|entry| entry.as_u64())
        .unwrap_or(0);

    match schema_version {
        1 | 2 => {
            serde_json::from_value::<PersistedProjectFile>(value).map_err(|error| error.to_string())
        }
        version => Err(format!("Unsupported project schema version: {version}")),
    }
}

async fn import_single_chatgpt_image(
    app: &AppHandle,
    client: &reqwest::Client,
    origin: &str,
    referer: &str,
    cookie_header: &str,
    share_id: Option<&str>,
    pointer: &str,
) -> Result<ImportedChatGptImageDraft, String> {
    let image_pointer = parse_chatgpt_image_pointer(pointer)
        .ok_or_else(|| format!("Invalid ChatGPT image pointer: {pointer}"))?;
    let endpoint = format!(
        "{origin}/backend-api/files/download/{}",
        image_pointer.file_id
    );
    let mut download_link_url = Url::parse(&endpoint).map_err(|error| error.to_string())?;
    let has_shared_conversation_id = image_pointer
        .query_pairs
        .iter()
        .any(|(key, _)| key == "shared_conversation_id");

    {
        let mut query = download_link_url.query_pairs_mut();
        for (key, value) in &image_pointer.query_pairs {
            query.append_pair(key, value);
        }

        if !has_shared_conversation_id {
            if let Some(share_id) = share_id {
                query.append_pair("shared_conversation_id", share_id);
            }
        }

        query.append_pair("inline", "false");
    }

    let mut request = client
        .get(download_link_url)
        .header(USER_AGENT, CHATGPT_SHARE_IMPORT_USER_AGENT)
        .header(ACCEPT, "application/json")
        .header(REFERER, referer);
    if !cookie_header.is_empty() {
        request = request.header(COOKIE, cookie_header);
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "ChatGPT file link request failed: {}",
            response.status()
        ));
    }

    let download_response = response
        .json::<ChatGptFileDownloadResponse>()
        .await
        .map_err(|error| error.to_string())?;
    if download_response.status != "success" {
        let reason = download_response
            .error_message
            .as_deref()
            .unwrap_or(download_response.status.as_str());
        return Err(format!("ChatGPT file is not ready to download: {reason}"));
    }

    let download_url = download_response
        .download_url
        .ok_or_else(|| "ChatGPT did not return a download URL.".to_string())?;
    let image_response = client
        .get(&download_url)
        .header(USER_AGENT, CHATGPT_SHARE_IMPORT_USER_AGENT)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !image_response.status().is_success() {
        return Err(format!(
            "ChatGPT image download failed: {}",
            image_response.status()
        ));
    }

    let content_type = image_response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let bytes = image_response
        .bytes()
        .await
        .map_err(|error| error.to_string())?
        .to_vec();
    let (width, height) = image_dimensions_from_bytes(&bytes).ok_or_else(|| {
        format!(
            "ChatGPT image has an unsupported format: {}",
            image_pointer.file_id
        )
    })?;
    let source_name = source_name_for_chatgpt_image(
        &image_pointer.file_id,
        download_response.file_name.as_deref(),
        &download_url,
        content_type.as_deref(),
    );
    let image_path = write_managed_import_bytes(app, &source_name, bytes)?;

    Ok(ImportedChatGptImageDraft {
        image_path,
        source_name,
        width,
        height,
    })
}

#[tauri::command]
pub async fn import_chatgpt_share_images(
    app: AppHandle,
    url: String,
) -> Result<ChatGptShareImportResult, String> {
    let parsed_url =
        Url::parse(url.trim()).map_err(|_| "Paste a valid ChatGPT share URL.".to_string())?;
    validate_chatgpt_share_url(&parsed_url)?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| error.to_string())?;
    let page_response = client
        .get(parsed_url.clone())
        .header(USER_AGENT, CHATGPT_SHARE_IMPORT_USER_AGENT)
        .header(ACCEPT, "text/html,application/xhtml+xml")
        .header(ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !page_response.status().is_success() {
        return Err(format!(
            "ChatGPT share page request failed: {}",
            page_response.status()
        ));
    }

    let final_url = page_response.url().clone();
    validate_chatgpt_share_url(&final_url)?;
    let origin = url_origin(&final_url);
    let referer = final_url.as_str().to_string();
    let share_id = extract_share_id(&final_url).or_else(|| extract_share_id(&parsed_url));
    let cookie_header = collect_cookie_header(page_response.headers());
    let html = page_response
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let pointers = extract_chatgpt_image_asset_pointers(&html);

    if pointers.is_empty() {
        return Err(
            "No ChatGPT generated images were found in that shared conversation.".to_string(),
        );
    }

    let mut drafts = Vec::with_capacity(pointers.len());
    let mut skipped_count = 0;
    let mut first_error = None;
    for pointer in pointers {
        match import_single_chatgpt_image(
            &app,
            &client,
            &origin,
            &referer,
            &cookie_header,
            share_id.as_deref(),
            &pointer,
        )
        .await
        {
            Ok(draft) => drafts.push(draft),
            Err(error) => {
                skipped_count += 1;
                first_error.get_or_insert(error);
            }
        }
    }

    if drafts.is_empty() {
        return Err(first_error.unwrap_or_else(|| {
            "No downloadable ChatGPT images were found in that shared conversation.".to_string()
        }));
    }

    Ok(ChatGptShareImportResult {
        drafts,
        skipped_count,
    })
}

#[tauri::command]
pub fn ingest_image_asset(
    app: AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    write_managed_import_bytes(&app, &filename, bytes)
}

#[tauri::command]
pub fn read_image_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_project_file(app: AppHandle, path: String) -> Result<ProjectPersistenceHandle, String> {
    let project_path = PathBuf::from(&path);
    let handle = load_project_file_internal(Some(&app), &project_path)?;
    let _ = upsert_recent_project(&app, &project_path, &handle.project.name)?;
    Ok(handle)
}

#[tauri::command]
pub fn save_project_file(
    app: AppHandle,
    request: SaveProjectRequest,
) -> Result<SaveProjectResult, String> {
    let project_path = PathBuf::from(&request.path);
    write_project_file_to_path(&project_path, &request.project, &request.asset_sources)?;
    let recent_projects = upsert_recent_project(&app, &project_path, &request.project.name)?;

    Ok(SaveProjectResult {
        path: normalize_path(&project_path),
        recent_projects,
    })
}

#[tauri::command]
pub fn save_autosave_project(app: AppHandle, request: SaveAutosaveRequest) -> Result<(), String> {
    let project_path = autosave_project_path(&app)?;
    write_autosave_project_to_path(&project_path, &request.project)?;
    let legacy_project_path = legacy_autosave_project_path(&app)?;
    if legacy_project_path.exists() {
        let _ = fs::remove_file(legacy_project_path);
    }
    write_session_file(&app, request.current_project_path.as_deref())
}

#[tauri::command]
pub fn load_startup_project(app: AppHandle) -> Result<Option<ProjectPersistenceHandle>, String> {
    let autosave_path = autosave_project_path(&app)?;
    let legacy_autosave_path = legacy_autosave_project_path(&app)?;
    let session_path = autosave_session_path(&app)?;
    let current_project_path = if session_path.exists() {
        let contents = fs::read_to_string(session_path).map_err(|error| error.to_string())?;
        serde_json::from_str::<AutosaveSessionFile>(&contents)
            .map_err(|error| error.to_string())?
            .current_project_path
    } else {
        None
    };
    let recent_projects = read_recent_projects_file(&app)?;
    let startup_autosave_path = if autosave_path.exists() {
        autosave_path
    } else {
        legacy_autosave_path
    };
    let startup_source = resolve_startup_project_source(
        startup_autosave_path.exists(),
        &startup_autosave_path,
        current_project_path,
        &recent_projects.items,
    );

    let Some(startup_source) = startup_source else {
        return Ok(None);
    };

    let mut handle = load_project_file_internal(Some(&app), Path::new(&startup_source.load_path))?;
    handle.path = startup_source.visible_path;
    Ok(Some(handle))
}

#[tauri::command]
pub fn list_recent_projects(app: AppHandle) -> Result<Vec<RecentProjectRecord>, String> {
    let recent_projects = read_recent_projects_file(&app)?;
    Ok(to_recent_project_records(recent_projects.items))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_project() -> RuntimeProject {
        RuntimeProject {
            id: "project-1".to_string(),
            name: "Roundtrip".to_string(),
            version: "0.1.0".to_string(),
            created_at: "2026-04-23T00:00:00Z".to_string(),
            updated_at: "2026-04-23T00:00:00Z".to_string(),
            camera: RuntimeCameraState {
                x: 120.0,
                y: -40.0,
                zoom: 1.25,
                viewport_width: 1280.0,
                viewport_height: 800.0,
            },
            assets: BTreeMap::from([(
                "asset-1".to_string(),
                RuntimeAssetItem {
                    id: "asset-1".to_string(),
                    kind: "imported".to_string(),
                    image_path: "ephemeral://asset-1".to_string(),
                    source_name: Some("asset-1.png".to_string()),
                    thumbnail_path: None,
                    width: 640.0,
                    height: 480.0,
                    x: 10.0,
                    y: 20.0,
                    rotation: 0.0,
                    scale: 0.5,
                    z_index: 1,
                    locked: false,
                    hidden: false,
                    tags: Vec::new(),
                    created_at: "2026-04-23T00:00:00Z".to_string(),
                    updated_at: "2026-04-23T00:00:00Z".to_string(),
                    generation: None,
                },
            )]),
            groups: BTreeMap::new(),
            selection: RuntimeSelectionState {
                asset_ids: vec!["asset-1".to_string()],
                marquee: None,
                last_active_asset_id: Some("asset-1".to_string()),
            },
            jobs: BTreeMap::new(),
        }
    }

    #[test]
    fn prefers_autosave_for_startup_when_available() {
        let autosave_path = PathBuf::from("/tmp/autosave/current.json");
        let source = resolve_startup_project_source(
            true,
            &autosave_path,
            Some("/projects/board-2.aref".to_string()),
            &[],
        );

        assert_eq!(
            source,
            Some(StartupProjectSource {
                load_path: normalize_path(&autosave_path),
                visible_path: Some("/projects/board-2.aref".to_string()),
            })
        );
    }

    #[test]
    fn falls_back_to_latest_existing_recent_project_for_startup() {
        let temp_dir = std::env::temp_dir().join(format!("aref-startup-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let existing_project_path = temp_dir.join("board-2.aref");
        fs::write(&existing_project_path, b"placeholder").expect("write project file");

        let recent_items = vec![
            RecentProjectFileEntry {
                path: normalize_path(&temp_dir.join("missing.aref")),
                name: "Missing".to_string(),
                last_opened_at: "2026-04-24T00:00:00Z".to_string(),
            },
            RecentProjectFileEntry {
                path: normalize_path(&existing_project_path),
                name: "Board 2".to_string(),
                last_opened_at: "2026-04-24T01:00:00Z".to_string(),
            },
        ];

        let source = resolve_startup_project_source(
            false,
            Path::new("/tmp/autosave.aref"),
            None,
            &recent_items,
        );

        assert_eq!(
            source,
            Some(StartupProjectSource {
                load_path: normalize_path(&existing_project_path),
                visible_path: Some(normalize_path(&existing_project_path)),
            })
        );

        fs::remove_dir_all(&temp_dir).expect("remove temp dir");
    }

    #[test]
    fn extracts_chatgpt_image_asset_pointers_in_order() {
        let html = r#"\"asset_pointer\",\"sediment://file_a?shared_conversation_id=share-1\",\"size_bytes\",1,
            \"asset_pointer\",\"sediment://file_b?shared_conversation_id=share-1\",\"size_bytes\",2,
            \"asset_pointer\",\"sediment://file_a?shared_conversation_id=share-1\",\"size_bytes\",1"#;

        assert_eq!(
            extract_chatgpt_image_asset_pointers(html),
            vec![
                "sediment://file_a?shared_conversation_id=share-1".to_string(),
                "sediment://file_b?shared_conversation_id=share-1".to_string(),
            ]
        );
    }

    #[test]
    fn parses_chatgpt_image_pointer_query_pairs() {
        let pointer = parse_chatgpt_image_pointer(
            "sediment://file_abc?shared_conversation_id=share-1&foo=bar%20baz",
        )
        .expect("pointer should parse");

        assert_eq!(pointer.file_id, "file_abc");
        assert_eq!(
            pointer.query_pairs,
            vec![
                ("shared_conversation_id".to_string(), "share-1".to_string()),
                ("foo".to_string(), "bar baz".to_string()),
            ]
        );
    }

    #[test]
    fn writes_and_loads_project_file_roundtrip() {
        let test_directory =
            std::env::temp_dir().join(format!("aref-roundtrip-{}", Uuid::new_v4()));
        fs::create_dir_all(&test_directory).expect("create temp directory");
        let project_path = test_directory.join("roundtrip.aref");
        let project = sample_project();
        let asset_sources = vec![ProjectAssetSourcePayload {
            asset_id: "asset-1".to_string(),
            image: PersistedAssetSource::Bytes {
                filename: Some("asset-1.png".to_string()),
                bytes: vec![1, 2, 3, 4],
            },
            thumbnail: None,
        }];

        write_project_file_to_path(&project_path, &project, &asset_sources)
            .expect("write project file");
        let archive_bytes = fs::read(&project_path).expect("read archive");
        let mut archive = ZipArchive::new(Cursor::new(archive_bytes)).expect("zip archive");
        assert!(archive.by_name(PROJECT_ARCHIVE_METADATA_ENTRY).is_ok());
        let asset_entry = archive.by_name("assets/asset-1.png").expect("asset entry");
        assert_eq!(asset_entry.compression(), CompressionMethod::Stored);

        let loaded = load_project_file_internal(None, &project_path).expect("load project file");

        assert_eq!(loaded.project.name, "Roundtrip");
        assert_eq!(loaded.project.camera.zoom, 1.25);
        assert_eq!(loaded.project.assets["asset-1"].x, 10.0);
        assert!(loaded.project.assets["asset-1"]
            .image_path
            .contains("/opened-projects/"));
        assert!(project_path.exists());
        assert!(!test_directory.join("roundtrip.aref-assets").exists());

        fs::remove_dir_all(test_directory).expect("cleanup temp directory");
    }

    #[test]
    fn writes_autosave_project_as_json_with_runtime_asset_paths() {
        let test_directory = std::env::temp_dir().join(format!("aref-autosave-{}", Uuid::new_v4()));
        fs::create_dir_all(&test_directory).expect("create temp directory");
        let autosave_path = test_directory.join("current.json");
        let asset_path = test_directory.join("asset-1.png");
        fs::write(&asset_path, vec![1, 2, 3, 4]).expect("write asset");
        let mut project = sample_project();
        project.assets.get_mut("asset-1").unwrap().image_path = normalize_path(&asset_path);

        write_autosave_project_to_path(&autosave_path, &project).expect("write autosave json");
        let contents = fs::read_to_string(&autosave_path).expect("read autosave json");
        let value: serde_json::Value =
            serde_json::from_str(&contents).expect("autosave should be json");

        assert_eq!(
            value["project"]["assets"][0]["imagePath"],
            normalize_path(&asset_path)
        );

        let loaded = load_project_file_internal(None, &autosave_path).expect("load autosave json");
        assert_eq!(
            loaded.project.assets["asset-1"].image_path,
            normalize_path(&asset_path)
        );

        fs::remove_dir_all(test_directory).expect("cleanup temp directory");
    }

    #[test]
    fn loads_schema_v1_sidecar_projects_for_migration() {
        let test_directory = std::env::temp_dir().join(format!("aref-v1-{}", Uuid::new_v4()));
        fs::create_dir_all(&test_directory).expect("create temp directory");
        let project_path = test_directory.join("legacy.aref");
        let asset_directory = test_directory.join("legacy.aref-assets");
        fs::create_dir_all(&asset_directory).expect("create legacy asset dir");
        fs::write(asset_directory.join("asset-1.png"), vec![1, 2, 3, 4])
            .expect("write legacy asset");

        let legacy_project = json!({
            "schema": PROJECT_SCHEMA,
            "schemaVersion": 1,
            "appVersion": "0.1.0",
            "savedAt": "2026-04-23T00:00:00Z",
            "project": {
                "id": "project-legacy",
                "name": "Legacy",
                "version": "0.1.0",
                "createdAt": "2026-04-23T00:00:00Z",
                "updatedAt": "2026-04-23T00:00:00Z",
                "camera": {
                    "x": 0.0,
                    "y": 0.0,
                    "zoom": 1.0,
                    "viewportWidth": 1280.0,
                    "viewportHeight": 800.0
                },
                "assets": [{
                    "id": "asset-1",
                    "kind": "imported",
                    "imagePath": "legacy.aref-assets/asset-1.png",
                    "sourceName": "asset-1.png",
                    "thumbnailPath": null,
                    "width": 640.0,
                    "height": 480.0,
                    "x": 24.0,
                    "y": 32.0,
                    "rotation": 0.0,
                    "scale": 1.0,
                    "zIndex": 0,
                    "locked": false,
                    "hidden": false,
                    "tags": [],
                    "createdAt": "2026-04-23T00:00:00Z",
                    "updatedAt": "2026-04-23T00:00:00Z",
                    "generation": null
                }],
                "groups": [],
                "selection": {
                    "assetIds": ["asset-1"],
                    "marquee": null,
                    "lastActiveAssetId": "asset-1"
                },
                "jobs": []
            }
        });
        fs::write(
            &project_path,
            serde_json::to_vec_pretty(&legacy_project).expect("serialize legacy project"),
        )
        .expect("write legacy project");

        let loaded = load_project_file_internal(None, &project_path).expect("load legacy project");

        assert_eq!(loaded.project.name, "Legacy");
        assert!(loaded.project.assets["asset-1"]
            .image_path
            .ends_with("legacy.aref-assets/asset-1.png"));

        fs::remove_dir_all(test_directory).expect("cleanup temp directory");
    }
}
