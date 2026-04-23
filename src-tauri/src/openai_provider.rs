use std::{
    collections::BTreeMap,
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    multipart::{Form, Part},
    Client,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{watch, Mutex};
use uuid::Uuid;

const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const OPENAI_SETTINGS_FILENAME: &str = "openai-settings.json";
const OPENAI_REQUEST_LOG_FILENAME: &str = "openai-requests.jsonl";
const OPENAI_GENERATED_DIRECTORY: &str = "openai-generated";
const OPENAI_REQUEST_TIMEOUT_SECONDS: u64 = 240;

#[derive(Default)]
pub struct OpenAiOperationRegistry {
    operations: Mutex<BTreeMap<String, OpenAiOperationEntry>>,
}

struct OpenAiOperationEntry {
    record: Arc<Mutex<OpenAiOperationRecord>>,
    cancel_tx: watch::Sender<bool>,
}

#[derive(Debug, Default, Clone)]
struct OpenAiOperationRecord {
    status: String,
    completed_at: Option<String>,
    error: Option<String>,
    request_id: Option<String>,
    mode: Option<String>,
    images: Vec<OpenAiGeneratedImage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiSettingsSnapshot {
    configured: bool,
    available: bool,
    source: String,
    api_key_last4: Option<String>,
    organization_id: Option<String>,
    project_id: Option<String>,
    base_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOpenAiSettingsInput {
    api_key: Option<String>,
    organization_id: Option<String>,
    project_id: Option<String>,
    base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredOpenAiSettings {
    api_key: Option<String>,
    organization_id: Option<String>,
    project_id: Option<String>,
    base_url: Option<String>,
}

#[derive(Debug)]
struct ResolvedOpenAiSettings {
    api_key: Option<String>,
    organization_id: Option<String>,
    project_id: Option<String>,
    base_url: String,
    source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOpenAiGenerationRequest {
    job_id: String,
    prompt: String,
    negative_prompt: Option<String>,
    model: String,
    settings: OpenAiGenerationSettings,
    reference_images: Vec<OpenAiReferenceImage>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiGenerationSettings {
    image_count: u32,
    aspect_ratio: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiReferenceImage {
    filename: String,
    mime_type: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiOperationSubmission {
    operation_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiOperationSnapshot {
    operation_id: String,
    status: String,
    completed_at: Option<String>,
    error: Option<String>,
    request_id: Option<String>,
    mode: Option<String>,
    images: Option<Vec<OpenAiGeneratedImage>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiGeneratedImage {
    image_path: String,
    thumbnail_path: Option<String>,
    width: u32,
    height: u32,
    source_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiRequestLogEntry {
    timestamp: String,
    operation_id: String,
    client_request_id: String,
    openai_request_id: Option<String>,
    model: String,
    mode: String,
    status: String,
    reference_count: usize,
    image_count: u32,
    prompt_length: usize,
    has_negative_prompt: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct OpenAiGenerationBody<'a> {
    model: &'a str,
    prompt: &'a str,
    size: &'a str,
    n: u32,
    quality: &'a str,
    output_format: &'a str,
}

#[derive(Debug, Deserialize)]
struct OpenAiImageApiResponse {
    data: Vec<OpenAiImageDatum>,
}

#[derive(Debug, Deserialize)]
struct OpenAiImageDatum {
    b64_json: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorEnvelope {
    error: Option<OpenAiErrorBody>,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorBody {
    message: Option<String>,
    code: Option<String>,
    r#type: Option<String>,
}

fn now_iso_string() -> String {
    Utc::now().to_rfc3339()
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

fn openai_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(OPENAI_SETTINGS_FILENAME))
}

fn openai_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_local_data_dir(app)?.join(OPENAI_REQUEST_LOG_FILENAME))
}

fn openai_generated_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_local_data_dir(app)?.join(OPENAI_GENERATED_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn trim_to_option(value: Option<String>) -> Option<String> {
    value.and_then(|entry| {
        let trimmed = entry.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn read_stored_openai_settings(app: &AppHandle) -> Result<Option<StoredOpenAiSettings>, String> {
    let path = openai_settings_path(app)?;

    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<StoredOpenAiSettings>(&contents)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn write_stored_openai_settings(app: &AppHandle, settings: &StoredOpenAiSettings) -> Result<(), String> {
    let path = openai_settings_path(app)?;
    ensure_parent_directory(&path)?;
    let contents = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn resolve_openai_settings(app: &AppHandle) -> Result<ResolvedOpenAiSettings, String> {
    let stored = read_stored_openai_settings(app)?.unwrap_or(StoredOpenAiSettings {
        api_key: None,
        organization_id: None,
        project_id: None,
        base_url: None,
    });
    let env_api_key = trim_to_option(env::var("OPENAI_API_KEY").ok());
    let env_organization_id = trim_to_option(env::var("OPENAI_ORGANIZATION").ok());
    let env_project_id = trim_to_option(env::var("OPENAI_PROJECT").ok());
    let env_base_url = trim_to_option(env::var("OPENAI_BASE_URL").ok());
    let api_key = env_api_key.clone().or(stored.api_key.clone());

    Ok(ResolvedOpenAiSettings {
        api_key,
        organization_id: env_organization_id.or(stored.organization_id),
        project_id: env_project_id.or(stored.project_id),
        base_url: env_base_url
            .or(stored.base_url)
            .unwrap_or_else(|| DEFAULT_OPENAI_BASE_URL.to_string()),
        source: if env_api_key.is_some() {
            "environment".to_string()
        } else if stored.api_key.is_some() {
            "stored".to_string()
        } else {
            "none".to_string()
        },
    })
}

fn settings_snapshot_from_resolved(settings: ResolvedOpenAiSettings) -> OpenAiSettingsSnapshot {
    OpenAiSettingsSnapshot {
        configured: settings.api_key.is_some(),
        available: true,
        source: settings.source,
        api_key_last4: settings.api_key.as_deref().map(api_key_last4),
        organization_id: settings.organization_id,
        project_id: settings.project_id,
        base_url: settings.base_url,
    }
}

fn api_key_last4(value: &str) -> String {
    value.chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

fn compose_prompt(prompt: &str, negative_prompt: Option<&str>) -> String {
    match negative_prompt.map(str::trim).filter(|value| !value.is_empty()) {
        Some(negative) => format!("{prompt}\n\nAvoid: {negative}"),
        None => prompt.to_string(),
    }
}

fn aspect_ratio_to_openai_size(aspect_ratio: &str) -> (&'static str, u32, u32) {
    match aspect_ratio {
        "4:3" => ("1536x1024", 1536, 1024),
        "3:4" => ("1024x1536", 1024, 1536),
        "16:9" => ("1792x1024", 1792, 1024),
        "9:16" => ("1024x1792", 1024, 1792),
        _ => ("1024x1024", 1024, 1024),
    }
}

fn build_openai_headers(settings: &ResolvedOpenAiSettings, client_request_id: &str) -> Result<HeaderMap, String> {
    let api_key = settings
        .api_key
        .as_ref()
        .ok_or_else(|| "OpenAI API key is not configured.".to_string())?;
    let mut headers = HeaderMap::new();
    let bearer = format!("Bearer {api_key}");
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&bearer).map_err(|error| error.to_string())?,
    );
    headers.insert(
        "X-Client-Request-Id",
        HeaderValue::from_str(client_request_id).map_err(|error| error.to_string())?,
    );

    if let Some(organization_id) = &settings.organization_id {
        headers.insert(
            "OpenAI-Organization",
            HeaderValue::from_str(organization_id).map_err(|error| error.to_string())?,
        );
    }

    if let Some(project_id) = &settings.project_id {
        headers.insert(
            "OpenAI-Project",
            HeaderValue::from_str(project_id).map_err(|error| error.to_string())?,
        );
    }

    Ok(headers)
}

fn append_openai_log(app: &AppHandle, entry: &OpenAiRequestLogEntry) -> Result<(), String> {
    let path = openai_log_path(app)?;
    ensure_parent_directory(&path)?;
    let line = serde_json::to_string(entry).map_err(|error| error.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{line}").map_err(|error| error.to_string())
}

async fn update_record(
    record: &Arc<Mutex<OpenAiOperationRecord>>,
    update: impl FnOnce(&mut OpenAiOperationRecord),
) {
    let mut guard = record.lock().await;
    update(&mut guard);
}

async fn run_openai_operation(
    app: AppHandle,
    record: Arc<Mutex<OpenAiOperationRecord>>,
    request: StartOpenAiGenerationRequest,
    operation_id: String,
    mut cancel_rx: watch::Receiver<bool>,
) {
    let settings = match resolve_openai_settings(&app) {
        Ok(settings) => settings,
        Err(error) => {
            update_record(&record, |entry| {
                entry.status = "failed".to_string();
                entry.completed_at = Some(now_iso_string());
                entry.error = Some(error.clone());
            })
            .await;
            let _ = append_openai_log(
                &app,
                &OpenAiRequestLogEntry {
                    timestamp: now_iso_string(),
                    operation_id,
                    client_request_id: request.job_id,
                    openai_request_id: None,
                    model: request.model,
                    mode: if request.reference_images.is_empty() {
                        "generate".to_string()
                    } else {
                        "edit".to_string()
                    },
                    status: "failed".to_string(),
                    reference_count: request.reference_images.len(),
                    image_count: request.settings.image_count,
                    prompt_length: request.prompt.len(),
                    has_negative_prompt: request.negative_prompt.is_some(),
                    error: Some(error),
                },
            );
            return;
        }
    };

    if settings.api_key.is_none() {
        let error = "OpenAI API key is not configured.".to_string();
        update_record(&record, |entry| {
            entry.status = "failed".to_string();
            entry.completed_at = Some(now_iso_string());
            entry.error = Some(error.clone());
        })
        .await;
        let _ = append_openai_log(
            &app,
            &OpenAiRequestLogEntry {
                timestamp: now_iso_string(),
                operation_id,
                client_request_id: request.job_id,
                openai_request_id: None,
                model: request.model,
                mode: if request.reference_images.is_empty() {
                    "generate".to_string()
                } else {
                    "edit".to_string()
                },
                status: "failed".to_string(),
                reference_count: request.reference_images.len(),
                image_count: request.settings.image_count,
                prompt_length: request.prompt.len(),
                has_negative_prompt: request.negative_prompt.is_some(),
                error: Some(error),
            },
        );
        return;
    }

    let mode = if request.reference_images.is_empty() {
        "generate".to_string()
    } else {
        "edit".to_string()
    };
    let client_request_id = request.job_id.clone();

    update_record(&record, |entry| {
        entry.status = "running".to_string();
        entry.mode = Some(mode.clone());
    })
    .await;
    let _ = append_openai_log(
        &app,
        &OpenAiRequestLogEntry {
            timestamp: now_iso_string(),
            operation_id: operation_id.clone(),
            client_request_id: client_request_id.clone(),
            openai_request_id: None,
            model: request.model.clone(),
            mode: mode.clone(),
            status: "running".to_string(),
            reference_count: request.reference_images.len(),
            image_count: request.settings.image_count,
            prompt_length: request.prompt.len(),
            has_negative_prompt: request.negative_prompt.is_some(),
            error: None,
        },
    );

    let task = execute_openai_request(&app, &settings, &request, &operation_id, &client_request_id);

    let result = tokio::select! {
        _ = cancel_rx.changed() => Err("cancelled".to_string()),
        response = task => response,
    };

    match result {
        Ok(success) => {
            if *cancel_rx.borrow() {
                update_record(&record, |entry| {
                    entry.status = "cancelled".to_string();
                    entry.completed_at = Some(now_iso_string());
                    entry.error = None;
                    entry.images.clear();
                })
                .await;
                let _ = append_openai_log(
                    &app,
                    &OpenAiRequestLogEntry {
                        timestamp: now_iso_string(),
                        operation_id,
                        client_request_id,
                        openai_request_id: success.request_id,
                        model: request.model,
                        mode,
                        status: "cancelled".to_string(),
                        reference_count: request.reference_images.len(),
                        image_count: request.settings.image_count,
                        prompt_length: request.prompt.len(),
                        has_negative_prompt: request.negative_prompt.is_some(),
                        error: None,
                    },
                );
                return;
            }

            update_record(&record, |entry| {
                entry.status = "succeeded".to_string();
                entry.completed_at = Some(success.completed_at.clone());
                entry.error = None;
                entry.request_id = success.request_id.clone();
                entry.mode = Some(mode.clone());
                entry.images = success.images.clone();
            })
            .await;
            let _ = append_openai_log(
                &app,
                &OpenAiRequestLogEntry {
                    timestamp: now_iso_string(),
                    operation_id,
                    client_request_id,
                    openai_request_id: success.request_id,
                    model: request.model,
                    mode,
                    status: "succeeded".to_string(),
                    reference_count: request.reference_images.len(),
                    image_count: request.settings.image_count,
                    prompt_length: request.prompt.len(),
                    has_negative_prompt: request.negative_prompt.is_some(),
                    error: None,
                },
            );
        }
        Err(error) if error == "cancelled" => {
            update_record(&record, |entry| {
                entry.status = "cancelled".to_string();
                entry.completed_at = Some(now_iso_string());
                entry.error = None;
                entry.images.clear();
            })
            .await;
            let _ = append_openai_log(
                &app,
                &OpenAiRequestLogEntry {
                    timestamp: now_iso_string(),
                    operation_id,
                    client_request_id,
                    openai_request_id: None,
                    model: request.model,
                    mode,
                    status: "cancelled".to_string(),
                    reference_count: request.reference_images.len(),
                    image_count: request.settings.image_count,
                    prompt_length: request.prompt.len(),
                    has_negative_prompt: request.negative_prompt.is_some(),
                    error: None,
                },
            );
        }
        Err(error) => {
            update_record(&record, |entry| {
                entry.status = "failed".to_string();
                entry.completed_at = Some(now_iso_string());
                entry.error = Some(error.clone());
                entry.images.clear();
            })
            .await;
            let _ = append_openai_log(
                &app,
                &OpenAiRequestLogEntry {
                    timestamp: now_iso_string(),
                    operation_id,
                    client_request_id,
                    openai_request_id: None,
                    model: request.model,
                    mode,
                    status: "failed".to_string(),
                    reference_count: request.reference_images.len(),
                    image_count: request.settings.image_count,
                    prompt_length: request.prompt.len(),
                    has_negative_prompt: request.negative_prompt.is_some(),
                    error: Some(error),
                },
            );
        }
    }
}

#[derive(Debug)]
struct SuccessfulOpenAiRun {
    completed_at: String,
    request_id: Option<String>,
    images: Vec<OpenAiGeneratedImage>,
}

async fn execute_openai_request(
    app: &AppHandle,
    settings: &ResolvedOpenAiSettings,
    request: &StartOpenAiGenerationRequest,
    operation_id: &str,
    client_request_id: &str,
) -> Result<SuccessfulOpenAiRun, String> {
    let headers = build_openai_headers(settings, client_request_id)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(OPENAI_REQUEST_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| error.to_string())?;
    let (size, width, height) = aspect_ratio_to_openai_size(&request.settings.aspect_ratio);
    let prompt = compose_prompt(&request.prompt, request.negative_prompt.as_deref());

    let response = if request.reference_images.is_empty() {
        client
            .post(format!("{}/images/generations", settings.base_url))
            .headers(headers)
            .json(&OpenAiGenerationBody {
                model: &request.model,
                prompt: &prompt,
                size,
                n: request.settings.image_count,
                quality: "medium",
                output_format: "png",
            })
            .send()
            .await
            .map_err(|error| error.to_string())?
    } else {
        let mut form = Form::new()
            .text("model", request.model.clone())
            .text("prompt", prompt)
            .text("size", size.to_string())
            .text("n", request.settings.image_count.to_string())
            .text("quality", "medium".to_string())
            .text("output_format", "png".to_string());

        for image in &request.reference_images {
            let part = Part::bytes(image.bytes.clone())
                .file_name(image.filename.clone())
                .mime_str(&image.mime_type)
                .map_err(|error| error.to_string())?;
            form = form.part("image[]", part);
        }

        client
            .post(format!("{}/images/edits", settings.base_url))
            .headers(headers)
            .multipart(form)
            .send()
            .await
            .map_err(|error| error.to_string())?
    };

    let request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let status = response.status();

    if !status.is_success() {
        let error_text = response.text().await.map_err(|error| error.to_string())?;
        let parsed_message = serde_json::from_str::<OpenAiErrorEnvelope>(&error_text)
            .ok()
            .and_then(|envelope| {
                envelope.error.map(|error| {
                    let message = error.message.unwrap_or_else(|| "Unknown OpenAI error".to_string());
                    match (error.code, error.r#type) {
                        (Some(code), Some(kind)) => format!("{message} [{code} / {kind}]"),
                        (Some(code), None) => format!("{message} [{code}]"),
                        (None, Some(kind)) => format!("{message} [{kind}]"),
                        (None, None) => message,
                    }
                })
            })
            .unwrap_or(error_text);

        return Err(format!("OpenAI request failed ({}): {}", status.as_u16(), parsed_message));
    }

    let payload = response
        .json::<OpenAiImageApiResponse>()
        .await
        .map_err(|error| error.to_string())?;
    let generated_directory = openai_generated_directory(app)?;
    let completed_at = now_iso_string();
    let mut images = Vec::with_capacity(payload.data.len());

    for (index, image) in payload.data.into_iter().enumerate() {
        let encoded = image
            .b64_json
            .ok_or_else(|| "OpenAI response did not include image bytes.".to_string())?;
        let bytes = STANDARD.decode(encoded).map_err(|error| error.to_string())?;
        let file_name = format!("{operation_id}-{}.png", index + 1);
        let target_path = generated_directory.join(&file_name);
        fs::write(&target_path, bytes).map_err(|error| error.to_string())?;
        images.push(OpenAiGeneratedImage {
            image_path: normalize_path(&target_path),
            thumbnail_path: None,
            width,
            height,
            source_name: Some(format!("openai-{}.png", index + 1)),
        });
    }

    Ok(SuccessfulOpenAiRun {
        completed_at,
        request_id,
        images,
    })
}

#[tauri::command]
pub fn get_openai_settings(app: AppHandle) -> Result<OpenAiSettingsSnapshot, String> {
    resolve_openai_settings(&app).map(settings_snapshot_from_resolved)
}

#[tauri::command]
pub fn save_openai_settings(
    app: AppHandle,
    input: SaveOpenAiSettingsInput,
) -> Result<OpenAiSettingsSnapshot, String> {
    let existing = read_stored_openai_settings(&app)?.unwrap_or(StoredOpenAiSettings {
        api_key: None,
        organization_id: None,
        project_id: None,
        base_url: None,
    });
    let settings = StoredOpenAiSettings {
        api_key: input.api_key.map(|value| value.trim().to_string()).and_then(|value| {
            if value.is_empty() {
                None
            } else {
                Some(value)
            }
        }).or(existing.api_key),
        organization_id: input
            .organization_id
            .map(|value| value.trim().to_string())
            .and_then(|value| if value.is_empty() { None } else { Some(value) })
            .or(existing.organization_id),
        project_id: input
            .project_id
            .map(|value| value.trim().to_string())
            .and_then(|value| if value.is_empty() { None } else { Some(value) })
            .or(existing.project_id),
        base_url: input
            .base_url
            .map(|value| value.trim().to_string())
            .and_then(|value| if value.is_empty() { None } else { Some(value) })
            .or(existing.base_url),
    };

    if settings.api_key.is_none()
        && settings.organization_id.is_none()
        && settings.project_id.is_none()
        && settings.base_url.is_none()
    {
        let path = openai_settings_path(&app)?;
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    } else {
        write_stored_openai_settings(&app, &settings)?;
    }

    resolve_openai_settings(&app).map(settings_snapshot_from_resolved)
}

#[tauri::command]
pub fn clear_openai_settings(app: AppHandle) -> Result<OpenAiSettingsSnapshot, String> {
    let path = openai_settings_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    resolve_openai_settings(&app).map(settings_snapshot_from_resolved)
}

#[tauri::command]
pub async fn start_openai_generation(
    app: AppHandle,
    registry: State<'_, OpenAiOperationRegistry>,
    request: StartOpenAiGenerationRequest,
) -> Result<OpenAiOperationSubmission, String> {
    if request.prompt.trim().is_empty() {
        return Err("Prompt is required.".to_string());
    }

    let operation_id = Uuid::new_v4().to_string();
    let record = Arc::new(Mutex::new(OpenAiOperationRecord {
        status: "queued".to_string(),
        completed_at: None,
        error: None,
        request_id: None,
        mode: Some(if request.reference_images.is_empty() {
            "generate".to_string()
        } else {
            "edit".to_string()
        }),
        images: Vec::new(),
    }));
    let (cancel_tx, cancel_rx) = watch::channel(false);

    registry.operations.lock().await.insert(
        operation_id.clone(),
        OpenAiOperationEntry {
            record: Arc::clone(&record),
            cancel_tx,
        },
    );

    let log_operation_id = operation_id.clone();
    let log_request = request.job_id.clone();
    let log_model = request.model.clone();
    let log_mode = if request.reference_images.is_empty() {
        "generate".to_string()
    } else {
        "edit".to_string()
    };
    let log_reference_count = request.reference_images.len();
    let log_image_count = request.settings.image_count;
    let log_prompt_length = request.prompt.len();
    let log_has_negative_prompt = request.negative_prompt.is_some();
    append_openai_log(
        &app,
        &OpenAiRequestLogEntry {
            timestamp: now_iso_string(),
            operation_id: log_operation_id,
            client_request_id: log_request,
            openai_request_id: None,
            model: log_model,
            mode: log_mode,
            status: "queued".to_string(),
            reference_count: log_reference_count,
            image_count: log_image_count,
            prompt_length: log_prompt_length,
            has_negative_prompt: log_has_negative_prompt,
            error: None,
        },
    )?;

    let task_app = app.clone();
    let task_record = Arc::clone(&record);
    let task_operation_id = operation_id.clone();
    tauri::async_runtime::spawn(async move {
        run_openai_operation(task_app, task_record, request, task_operation_id, cancel_rx).await;
    });

    Ok(OpenAiOperationSubmission { operation_id })
}

#[tauri::command]
pub async fn poll_openai_generation(
    registry: State<'_, OpenAiOperationRegistry>,
    operation_id: String,
) -> Result<OpenAiOperationSnapshot, String> {
    let record = {
        let operations = registry.operations.lock().await;
        let entry = operations
            .get(&operation_id)
            .ok_or_else(|| format!("OpenAI operation not found: {operation_id}"))?;
        Arc::clone(&entry.record)
    };
    let record = record.lock().await;

    Ok(OpenAiOperationSnapshot {
        operation_id,
        status: record.status.clone(),
        completed_at: record.completed_at.clone(),
        error: record.error.clone(),
        request_id: record.request_id.clone(),
        mode: record.mode.clone(),
        images: if record.images.is_empty() {
            None
        } else {
            Some(record.images.clone())
        },
    })
}

#[tauri::command]
pub async fn cancel_openai_generation(
    registry: State<'_, OpenAiOperationRegistry>,
    operation_id: String,
) -> Result<(), String> {
    let entry = {
        let operations = registry.operations.lock().await;
        operations.get(&operation_id).map(|entry| (Arc::clone(&entry.record), entry.cancel_tx.clone()))
    };

    if let Some((record, cancel_tx)) = entry {
        let _ = cancel_tx.send(true);
        let mut record = record.lock().await;
        if record.status == "queued" || record.status == "running" {
            record.status = "cancelled".to_string();
            record.completed_at = Some(now_iso_string());
            record.error = None;
            record.images.clear();
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composes_negative_prompt_into_prompt_text() {
        let prompt = compose_prompt("A serene cliff house", Some("text overlay, watermark"));
        assert!(prompt.contains("A serene cliff house"));
        assert!(prompt.contains("Avoid: text overlay, watermark"));
    }

    #[test]
    fn maps_canvas_aspect_ratios_to_openai_sizes() {
        assert_eq!(
            aspect_ratio_to_openai_size("unspecified"),
            ("1024x1024", 1024, 1024)
        );
        assert_eq!(aspect_ratio_to_openai_size("1:1"), ("1024x1024", 1024, 1024));
        assert_eq!(aspect_ratio_to_openai_size("4:3"), ("1536x1024", 1536, 1024));
        assert_eq!(aspect_ratio_to_openai_size("3:4"), ("1024x1536", 1024, 1536));
        assert_eq!(aspect_ratio_to_openai_size("16:9"), ("1792x1024", 1792, 1024));
        assert_eq!(aspect_ratio_to_openai_size("9:16"), ("1024x1792", 1024, 1792));
    }
}
