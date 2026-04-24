use std::{
    collections::BTreeMap,
    env,
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{watch, Mutex};
use uuid::Uuid;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const DEFAULT_IMA2_SIDECAR_BASE_URL: &str = "http://127.0.0.1:10531";
const IMA2_SIDECAR_SETTINGS_FILENAME: &str = "ima2-sidecar-settings.json";
const IMA2_SIDECAR_REQUEST_LOG_FILENAME: &str = "ima2-sidecar-requests.jsonl";
const IMA2_SIDECAR_GENERATED_DIRECTORY: &str = "ima2-sidecar-generated";
const IMA2_SIDECAR_REQUEST_TIMEOUT_SECONDS: u64 = 240;
const IMA2_SIDECAR_HEALTH_TIMEOUT_SECONDS: u64 = 3;
const IMA2_SIDECAR_PROXY_WARMUP_MILLISECONDS: u64 = 900;
const IMA2_SIDECAR_PROXY_READY_TIMEOUT_MILLISECONDS: u64 = 12_000;
const IMA2_SIDECAR_PROXY_READY_POLL_MILLISECONDS: u64 = 750;
const CODEX_LOGIN_STATUS_TIMEOUT_MILLISECONDS: u64 = 2_500;
const HIDDEN_COMMAND_POLL_MILLISECONDS: u64 = 50;
const IMA2_SIDECAR_PROXY_MODELS: &str =
    "gpt-5.4,gpt-5.3-codex,gpt-5.3-codex-spark,gpt-5.2,gpt-5.1,gpt-5.1-codex,gpt-5.1-codex-max";
const OAUTH_IMAGE_DEVELOPER_PROMPT: &str =
    "You are an image generator for a desktop reference-board app. Always use the image_generation tool and do not return a text-only answer. Generate exactly one image that follows the user's prompt and references.";

#[derive(Default)]
pub struct Ima2SidecarOperationRegistry {
    operations: Mutex<BTreeMap<String, Ima2SidecarOperationEntry>>,
}

#[derive(Default)]
pub struct Ima2SidecarRuntimeState {
    proxy: Mutex<Option<ManagedIma2Proxy>>,
}

struct Ima2SidecarOperationEntry {
    record: Arc<Mutex<Ima2SidecarOperationRecord>>,
    cancel_tx: watch::Sender<bool>,
}

struct ManagedIma2Proxy {
    child: Child,
    base_url: String,
}

#[derive(Debug, Clone)]
struct ArefCodexAuthEnv {
    codex_home: PathBuf,
    chatgpt_local_home: PathBuf,
    auth_file: PathBuf,
}

impl Drop for ManagedIma2Proxy {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Debug, Default, Clone)]
struct Ima2SidecarOperationRecord {
    status: String,
    completed_at: Option<String>,
    error: Option<String>,
    request_id: Option<String>,
    mode: Option<String>,
    images: Vec<Ima2SidecarGeneratedImage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Ima2SidecarSettingsSnapshot {
    configured: bool,
    available: bool,
    source: String,
    base_url: String,
    oauth_status: String,
    codex_auth_status: String,
    proxy_managed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveIma2SidecarSettingsInput {
    base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredIma2SidecarSettings {
    base_url: Option<String>,
}

#[derive(Debug)]
struct ResolvedIma2SidecarSettings {
    base_url: String,
    source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartIma2SidecarGenerationRequest {
    job_id: String,
    prompt: String,
    negative_prompt: Option<String>,
    model: String,
    settings: Ima2SidecarGenerationSettings,
    reference_images: Vec<Ima2SidecarReferenceImage>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Ima2SidecarGenerationSettings {
    image_count: u32,
    aspect_ratio: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Ima2SidecarReferenceImage {
    #[serde(rename = "filename")]
    _filename: String,
    mime_type: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ima2SidecarOperationSubmission {
    operation_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Ima2SidecarOperationSnapshot {
    operation_id: String,
    status: String,
    completed_at: Option<String>,
    error: Option<String>,
    request_id: Option<String>,
    mode: Option<String>,
    images: Option<Vec<Ima2SidecarGeneratedImage>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Ima2SidecarGeneratedImage {
    image_path: String,
    thumbnail_path: Option<String>,
    width: u32,
    height: u32,
    source_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Ima2SidecarRequestLogEntry {
    timestamp: String,
    operation_id: String,
    request_id: String,
    openai_request_ids: Vec<String>,
    model: String,
    mode: String,
    base_url: String,
    status: String,
    reference_count: usize,
    image_count: u32,
    prompt_length: usize,
    has_negative_prompt: bool,
    codex_auth_status: String,
    proxy_managed: bool,
    error: Option<String>,
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

fn ima2_sidecar_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(IMA2_SIDECAR_SETTINGS_FILENAME))
}

fn ima2_sidecar_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_local_data_dir(app)?.join(IMA2_SIDECAR_REQUEST_LOG_FILENAME))
}

fn ima2_sidecar_generated_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_local_data_dir(app)?.join(IMA2_SIDECAR_GENERATED_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn read_stored_ima2_sidecar_settings(
    app: &AppHandle,
) -> Result<Option<StoredIma2SidecarSettings>, String> {
    let path = ima2_sidecar_settings_path(app)?;

    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<StoredIma2SidecarSettings>(&contents)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn write_stored_ima2_sidecar_settings(
    app: &AppHandle,
    settings: &StoredIma2SidecarSettings,
) -> Result<(), String> {
    let path = ima2_sidecar_settings_path(app)?;
    ensure_parent_directory(&path)?;
    let contents = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn resolve_ima2_sidecar_settings(app: &AppHandle) -> Result<ResolvedIma2SidecarSettings, String> {
    let stored = read_stored_ima2_sidecar_settings(app)?
        .unwrap_or(StoredIma2SidecarSettings { base_url: None });
    let env_base_url = trim_to_option(env::var("AREF_CHATGPT_OAUTH_URL").ok())
        .or_else(|| trim_to_option(env::var("OPENAI_OAUTH_PROXY_URL").ok()))
        .or_else(|| trim_to_option(env::var("IMA2_SIDECAR_URL").ok()));

    Ok(ResolvedIma2SidecarSettings {
        base_url: env_base_url
            .clone()
            .or(stored.base_url.clone())
            .unwrap_or_else(|| DEFAULT_IMA2_SIDECAR_BASE_URL.to_string()),
        source: if env_base_url.is_some() {
            "environment".to_string()
        } else if stored.base_url.is_some() {
            "stored".to_string()
        } else {
            "default".to_string()
        },
    })
}

fn append_ima2_sidecar_log(
    app: &AppHandle,
    entry: &Ima2SidecarRequestLogEntry,
) -> Result<(), String> {
    let path = ima2_sidecar_log_path(app)?;
    ensure_parent_directory(&path)?;
    let line = serde_json::to_string(entry).map_err(|error| error.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{line}").map_err(|error| error.to_string())
}

fn compose_prompt(prompt: &str, negative_prompt: Option<&str>) -> String {
    match negative_prompt
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(negative) => format!("{prompt}\n\nAvoid: {negative}"),
        None => prompt.to_string(),
    }
}

fn aspect_ratio_to_ima2_size(aspect_ratio: &str) -> (&'static str, u32, u32) {
    match aspect_ratio {
        "4:3" => ("1536x1024", 1536, 1024),
        "3:4" => ("1024x1536", 1024, 1536),
        "16:9" => ("1792x1024", 1792, 1024),
        "9:16" => ("1024x1792", 1024, 1792),
        _ => ("1024x1024", 1024, 1024),
    }
}

fn parse_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let (metadata, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Invalid data URL returned by the OAuth proxy.".to_string())?;
    if !metadata.starts_with("data:") {
        return Err("Invalid data URL prefix returned by the OAuth proxy.".to_string());
    }

    let mime_type = metadata
        .trim_start_matches("data:")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .to_string();
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|error| error.to_string())?;
    Ok((mime_type, bytes))
}

fn infer_mime_type_from_bytes(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return "image/png";
    }

    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return "image/jpeg";
    }

    if bytes.starts_with(b"RIFF") && bytes.len() > 11 && &bytes[8..12] == b"WEBP" {
        return "image/webp";
    }

    "image/png"
}

fn parse_generated_image_payload(payload: &str) -> Result<(String, Vec<u8>), String> {
    if payload.starts_with("data:") {
        return parse_data_url(payload);
    }

    let bytes = STANDARD
        .decode(payload)
        .map_err(|error| error.to_string())?;
    Ok((infer_mime_type_from_bytes(&bytes).to_string(), bytes))
}

fn extension_from_mime_type(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    }
}

fn aref_codex_auth_env(app: &AppHandle) -> Result<ArefCodexAuthEnv, String> {
    let root = app_config_dir(app)?.join("codex-oauth");
    let codex_home = root.join("codex");
    let chatgpt_local_home = root.join("chatgpt-local");

    fs::create_dir_all(&codex_home).map_err(|error| error.to_string())?;
    fs::create_dir_all(&chatgpt_local_home).map_err(|error| error.to_string())?;

    Ok(ArefCodexAuthEnv {
        auth_file: codex_home.join("auth.json"),
        codex_home,
        chatgpt_local_home,
    })
}

fn apply_aref_codex_auth_env(command: &mut Command, auth_env: &ArefCodexAuthEnv) {
    command.env("CODEX_HOME", &auth_env.codex_home);
    command.env("CHATGPT_LOCAL_HOME", &auth_env.chatgpt_local_home);
}

fn upsert_codex_file_credentials_config(contents: &str) -> String {
    let mut next_lines = Vec::new();
    let mut found = false;

    for line in contents.lines() {
        let trimmed = line.trim_start();
        let key = trimmed
            .split_once('=')
            .map(|(candidate, _value)| candidate.trim());

        if !trimmed.starts_with('#') && key == Some("cli_auth_credentials_store") {
            let indent = &line[..line.len() - trimmed.len()];
            next_lines.push(format!("{indent}cli_auth_credentials_store = \"file\""));
            found = true;
        } else {
            next_lines.push(line.to_string());
        }
    }

    if !found {
        if !next_lines.is_empty() {
            next_lines.push(String::new());
        }
        next_lines.push("cli_auth_credentials_store = \"file\"".to_string());
    }

    let mut next = next_lines.join("\n");
    next.push('\n');
    next
}

fn ensure_codex_file_credentials_config(auth_env: &ArefCodexAuthEnv) -> Result<(), String> {
    fs::create_dir_all(&auth_env.codex_home).map_err(|error| error.to_string())?;
    fs::create_dir_all(&auth_env.chatgpt_local_home).map_err(|error| error.to_string())?;

    let config_path = auth_env.codex_home.join("config.toml");
    let current = match fs::read_to_string(&config_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    let next = upsert_codex_file_credentials_config(&current);

    if current != next {
        fs::write(&config_path, next).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn legacy_codex_home_dir() -> Option<PathBuf> {
    let codex_home = trim_to_option(env::var("CODEX_HOME").ok()).map(PathBuf::from);
    if codex_home.is_some() {
        return codex_home;
    }

    let home = trim_to_option(env::var("HOME").ok())
        .or_else(|| trim_to_option(env::var("USERPROFILE").ok()))?;
    Some(PathBuf::from(home).join(".codex"))
}

fn user_home_dir() -> Option<PathBuf> {
    trim_to_option(env::var("HOME").ok())
        .or_else(|| trim_to_option(env::var("USERPROFILE").ok()))
        .map(PathBuf::from)
}

fn legacy_codex_auth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(chatgpt_home) = trim_to_option(env::var("CHATGPT_LOCAL_HOME").ok()) {
        paths.push(PathBuf::from(chatgpt_home).join("auth.json"));
    }

    if let Some(codex_home) = legacy_codex_home_dir() {
        paths.push(codex_home.join("auth.json"));
    }

    if let Some(home) = user_home_dir() {
        paths.push(home.join(".chatgpt-local").join("auth.json"));
        paths.push(home.join(".config").join("codex").join("auth.json"));
    }

    paths
}

fn codex_auth_paths(auth_env: &ArefCodexAuthEnv) -> Vec<PathBuf> {
    let mut paths = vec![auth_env.auth_file.clone()];

    for path in legacy_codex_auth_paths() {
        if !paths.iter().any(|existing| existing == &path) {
            paths.push(path);
        }
    }

    paths
}

fn has_legacy_codex_auth_file(auth_env: &ArefCodexAuthEnv) -> bool {
    codex_auth_paths(auth_env)
        .into_iter()
        .skip(1)
        .any(|path| path.exists())
}

fn codex_binary_candidates() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["codex.cmd", "codex.exe", "codex"]
    }

    #[cfg(not(target_os = "windows"))]
    {
        &["codex"]
    }
}

fn npx_binary() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "npx.cmd"
    }

    #[cfg(not(target_os = "windows"))]
    {
        "npx"
    }
}

fn hidden_command(binary: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new(binary);
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(binary)
    }
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn quote_windows_cmd_token(token: &str) -> String {
    if token.is_empty()
        || token.chars().any(|character| {
            matches!(
                character,
                ' ' | '\t' | '"' | '&' | '|' | '<' | '>' | '^' | '(' | ')'
            )
        })
    {
        format!("\"{}\"", token.replace('"', "\\\""))
    } else {
        token.to_string()
    }
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn build_windows_cmd_line<S: AsRef<str>>(binary: &str, args: &[S]) -> String {
    std::iter::once(quote_windows_cmd_token(binary))
        .chain(args.iter().map(|arg| quote_windows_cmd_token(arg.as_ref())))
        .collect::<Vec<_>>()
        .join(" ")
}

fn hidden_command_with_args<S: AsRef<str>>(binary: &str, args: &[S]) -> Command {
    #[cfg(target_os = "windows")]
    {
        if binary.to_ascii_lowercase().ends_with(".cmd") {
            let mut command = hidden_command("cmd.exe");
            command
                .args(["/d", "/s", "/c"])
                .arg(build_windows_cmd_line(binary, args));
            return command;
        }
    }

    let mut command = hidden_command(binary);
    for arg in args {
        command.arg(arg.as_ref());
    }
    command
}

fn run_hidden_command_with_timeout<S: AsRef<str>>(
    binary: &str,
    args: &[S],
    timeout: Duration,
    auth_env: &ArefCodexAuthEnv,
) -> Result<Option<std::process::Output>, std::io::Error> {
    let mut command = hidden_command_with_args(binary, args);
    apply_aref_codex_auth_env(&mut command, auth_env);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let deadline = Instant::now() + timeout;

    loop {
        match child.try_wait()? {
            Some(_) => return child.wait_with_output().map(Some),
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(None);
            }
            None => thread::sleep(Duration::from_millis(HIDDEN_COMMAND_POLL_MILLISECONDS)),
        }
    }
}

fn codex_login_status_from_output(
    exit_success: bool,
    stdout: &[u8],
    stderr: &[u8],
) -> &'static str {
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(stdout),
        String::from_utf8_lossy(stderr)
    )
    .to_ascii_lowercase();

    if combined.contains("logged in with chatgpt")
        || combined.contains("logged in using chatgpt")
        || (combined.contains("logged in") && combined.contains("chatgpt"))
    {
        "authed"
    } else if combined.contains("api key") {
        "unauthed"
    } else if combined.contains("not logged in")
        || combined.contains("not authenticated")
        || combined.contains("login required")
    {
        "unauthed"
    } else if exit_success {
        "authed"
    } else {
        "unknown"
    }
}

fn probe_codex_login_status(auth_env: &ArefCodexAuthEnv) -> String {
    let timeout = Duration::from_millis(CODEX_LOGIN_STATUS_TIMEOUT_MILLISECONDS);
    let mut saw_unauthed = false;
    let mut saw_unknown = false;

    for binary in codex_binary_candidates() {
        match run_hidden_command_with_timeout(binary, &["login", "status"], timeout, auth_env) {
            Ok(Some(output)) => {
                let status = codex_login_status_from_output(
                    output.status.success(),
                    &output.stdout,
                    &output.stderr,
                );
                if status == "authed" {
                    return status.to_string();
                }
                saw_unauthed |= status == "unauthed";
                saw_unknown |= status == "unknown";
            }
            Ok(None) => saw_unknown = true,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(_) => saw_unknown = true,
        }
    }

    if saw_unauthed {
        "unauthed".to_string()
    } else if saw_unknown {
        "unknown".to_string()
    } else {
        "missing".to_string()
    }
}

fn detect_codex_auth_status(app: &AppHandle) -> Result<String, String> {
    let auth_env = aref_codex_auth_env(app)?;
    ensure_codex_file_credentials_config(&auth_env)?;

    if auth_env.auth_file.exists() {
        return Ok("authed".to_string());
    }

    if has_legacy_codex_auth_file(&auth_env) {
        return Ok("auth_file_missing".to_string());
    }

    let status = probe_codex_login_status(&auth_env);
    if status == "authed" && !auth_env.auth_file.exists() {
        Ok("auth_file_missing".to_string())
    } else {
        Ok(status)
    }
}

fn is_codex_auth_ready(status: &str) -> bool {
    status == "authed"
}

fn oauth_status_for_unreachable_proxy(proxy_managed: bool, codex_auth_status: &str) -> String {
    if !is_codex_auth_ready(codex_auth_status) {
        return "auth_required".to_string();
    }

    if proxy_managed {
        "starting".to_string()
    } else {
        "offline".to_string()
    }
}

fn oauth_status_for_ready_proxy(codex_auth_status: &str) -> String {
    if is_codex_auth_ready(codex_auth_status) {
        "ready".to_string()
    } else {
        "auth_required".to_string()
    }
}

fn openai_oauth_proxy_args(port: u16, auth_file: &Path) -> Vec<String> {
    vec![
        "--yes".to_string(),
        "openai-oauth@latest".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--models".to_string(),
        IMA2_SIDECAR_PROXY_MODELS.to_string(),
        "--oauth-file".to_string(),
        auth_file.to_string_lossy().to_string(),
    ]
}

fn build_oauth_request_body(
    request: &StartIma2SidecarGenerationRequest,
    prompt: &str,
    size: &str,
    stream: bool,
) -> Value {
    let mut user_content = vec![json!({
        "type": "input_text",
        "text": prompt,
    })];

    user_content.extend(request.reference_images.iter().map(|image| {
        json!({
            "type": "input_image",
            "image_url": format!("data:{};base64,{}", image.mime_type, STANDARD.encode(&image.bytes)),
        })
    }));

    json!({
        "model": if request.model.trim().is_empty() {
            "gpt-5.4"
        } else {
            request.model.as_str()
        },
        "input": [
            {
                "role": "developer",
                "content": OAUTH_IMAGE_DEVELOPER_PROMPT
            },
            {
                "role": "user",
                "content": user_content
            }
        ],
        "tools": [
            {
                "type": "image_generation",
                "quality": "medium",
                "size": size
            }
        ],
        "tool_choice": "auto",
        "stream": stream
    })
}

fn extract_generated_images(value: &Value) -> Vec<String> {
    let mut results = Vec::new();

    match value {
        Value::Object(map) => {
            if map.get("type").and_then(Value::as_str) == Some("image_generation_call") {
                if let Some(result) = map.get("result").and_then(Value::as_str) {
                    results.push(result.to_string());
                }
            }

            for child in map.values() {
                results.extend(extract_generated_images(child));
            }
        }
        Value::Array(items) => {
            for child in items {
                results.extend(extract_generated_images(child));
            }
        }
        _ => {}
    }

    results
}

fn extract_error_message(value: &Value) -> Option<String> {
    value
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            value
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn extract_text_fragments(value: &Value, fragments: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                if !text.trim().is_empty() {
                    fragments.push(text.trim().to_string());
                }
            }

            if let Some(text) = map.get("output_text").and_then(Value::as_str) {
                if !text.trim().is_empty() {
                    fragments.push(text.trim().to_string());
                }
            }

            for child in map.values() {
                extract_text_fragments(child, fragments);
            }
        }
        Value::Array(items) => {
            for child in items {
                extract_text_fragments(child, fragments);
            }
        }
        _ => {}
    }
}

fn summarize_non_image_response(value: &Value) -> Option<String> {
    let mut fragments = Vec::new();
    extract_text_fragments(value, &mut fragments);
    let joined = fragments.join(" ");
    let trimmed = joined.trim();

    if trimmed.is_empty() {
        None
    } else {
        let limit = 280;
        Some(trimmed.chars().take(limit).collect())
    }
}

fn parse_sse_response_for_image(
    body_text: &str,
    fallback_request_id: Option<String>,
) -> Result<(String, String), String> {
    let mut request_id = fallback_request_id;
    let mut image: Option<String> = None;
    let mut last_error: Option<String> = None;

    for block in body_text.split("\n\n") {
        let mut event_data = String::new();

        for line in block.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                event_data.push_str(data);
            }
        }

        if event_data.is_empty() || event_data == "[DONE]" {
            continue;
        }

        let value = match serde_json::from_str::<Value>(&event_data) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if let Some(error) = extract_error_message(&value) {
            last_error = Some(error);
        }

        if request_id.is_none() {
            request_id = value
                .get("response")
                .and_then(|response| response.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| value.get("id").and_then(Value::as_str).map(str::to_string));
        }

        if image.is_none() {
            image = extract_generated_images(&value).into_iter().next();
        }
    }

    if let Some(image) = image {
        return Ok((
            request_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            image,
        ));
    }

    if let Some(error) = last_error {
        return Err(error);
    }

    Err("ChatGPT OAuth stream ended without image data.".to_string())
}

fn parse_json_response_for_image(
    body_text: &str,
    fallback_request_id: Option<String>,
) -> Result<(String, String), String> {
    let payload = serde_json::from_str::<Value>(body_text).map_err(|error| error.to_string())?;

    if let Some(error) = extract_error_message(&payload) {
        return Err(error);
    }

    let image = extract_generated_images(&payload).into_iter().next();
    let request_id = fallback_request_id
        .or_else(|| {
            payload
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if let Some(image) = image {
        return Ok((request_id, image));
    }

    let response_summary = summarize_non_image_response(&payload)
        .map(|summary| format!(" Response: {summary}"))
        .unwrap_or_default();

    Err(format!(
        "ChatGPT OAuth returned no image data.{response_summary}"
    ))
}

fn parse_proxy_port(base_url: &str) -> Result<u16, String> {
    let parsed = Url::parse(base_url).map_err(|error| error.to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Proxy URL host is missing.".to_string())?;
    let is_local_host = matches!(host, "127.0.0.1" | "localhost" | "0.0.0.0" | "::1");

    if !is_local_host {
        return Err("Managed proxy startup only supports localhost URLs.".to_string());
    }

    parsed
        .port_or_known_default()
        .ok_or_else(|| "Proxy URL port is missing.".to_string())
}

async fn cleanup_managed_proxy(runtime: &Ima2SidecarRuntimeState) -> Result<(), String> {
    let mut guard = runtime.proxy.lock().await;

    if let Some(proxy) = guard.as_mut() {
        match proxy.child.try_wait() {
            Ok(Some(_status)) => {
                guard.take();
            }
            Ok(None) => {}
            Err(error) => {
                guard.take();
                return Err(error.to_string());
            }
        }
    }

    Ok(())
}

async fn managed_proxy_matches(
    runtime: &Ima2SidecarRuntimeState,
    base_url: &str,
) -> Result<bool, String> {
    cleanup_managed_proxy(runtime).await?;

    let guard = runtime.proxy.lock().await;
    Ok(guard
        .as_ref()
        .map(|proxy| proxy.base_url == base_url)
        .unwrap_or(false))
}

async fn stop_managed_proxy(runtime: &Ima2SidecarRuntimeState) -> Result<(), String> {
    let mut guard = runtime.proxy.lock().await;

    if let Some(mut proxy) = guard.take() {
        let _ = proxy.child.kill();
        let _ = proxy.child.wait();
    }

    Ok(())
}

async fn fetch_ima2_sidecar_snapshot(
    app: &AppHandle,
    runtime: &Ima2SidecarRuntimeState,
) -> Result<Ima2SidecarSettingsSnapshot, String> {
    cleanup_managed_proxy(runtime).await?;

    let settings = resolve_ima2_sidecar_settings(app)?;
    let codex_auth_status = detect_codex_auth_status(app)?;
    let proxy_managed = managed_proxy_matches(runtime, &settings.base_url).await?;
    let client = Client::builder()
        .timeout(Duration::from_secs(IMA2_SIDECAR_HEALTH_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| error.to_string())?;

    let unreachable_status =
        || oauth_status_for_unreachable_proxy(proxy_managed, &codex_auth_status);
    let model_probe_status = |status: StatusCode| {
        if status.is_success() {
            oauth_status_for_ready_proxy(&codex_auth_status)
        } else if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            "auth_required".to_string()
        } else {
            "unknown".to_string()
        }
    };

    let (available, oauth_status) = match client
        .get(format!("{}/health", settings.base_url))
        .send()
        .await
    {
        Ok(response) => (
            true,
            if response.status().is_success() {
                oauth_status_for_ready_proxy(&codex_auth_status)
            } else if response.status() == StatusCode::NOT_FOUND
                || response.status() == StatusCode::METHOD_NOT_ALLOWED
            {
                match client
                    .get(format!("{}/v1/models", settings.base_url))
                    .send()
                    .await
                {
                    Ok(model_response) => model_probe_status(model_response.status()),
                    Err(_) => unreachable_status(),
                }
            } else if response.status() == StatusCode::UNAUTHORIZED
                || response.status() == StatusCode::FORBIDDEN
            {
                "auth_required".to_string()
            } else {
                "unknown".to_string()
            },
        ),
        Err(_) => (false, unreachable_status()),
    };

    Ok(Ima2SidecarSettingsSnapshot {
        configured: !settings.base_url.trim().is_empty(),
        available,
        source: settings.source,
        base_url: settings.base_url,
        oauth_status,
        codex_auth_status,
        proxy_managed,
    })
}

fn try_spawn_process(
    binary: &str,
    args: &[&str],
    auth_env: &ArefCodexAuthEnv,
) -> Result<(), String> {
    let mut command = hidden_command_with_args(binary, args);
    apply_aref_codex_auth_env(&mut command, auth_env);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;

    thread::sleep(Duration::from_millis(800));
    match child.try_wait() {
        Ok(Some(status)) if !status.success() => Err(format!("{binary} exited with {status}")),
        Ok(_) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn build_windows_env_set(name: &str, value: &Path) -> String {
    format!("set \"{}={}\"", name, value.to_string_lossy())
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn build_windows_visible_login_command(auth_env: &ArefCodexAuthEnv, npx_binary: &str) -> String {
    let login_args = ["--yes", "@openai/codex@latest", "login", "--device-auth"];
    [
        "title Aref Codex Login".to_string(),
        build_windows_env_set("CODEX_HOME", &auth_env.codex_home),
        build_windows_env_set("CHATGPT_LOCAL_HOME", &auth_env.chatgpt_local_home),
        build_windows_cmd_line(npx_binary, &login_args),
    ]
    .join(" && ")
}

#[cfg(target_os = "windows")]
fn visible_windows_command(binary: &str) -> Command {
    let mut command = Command::new(binary);
    const CREATE_NEW_CONSOLE: u32 = 0x00000010;
    command.creation_flags(CREATE_NEW_CONSOLE);
    command
}

#[cfg(target_os = "windows")]
fn launch_windows_visible_codex_login(auth_env: &ArefCodexAuthEnv) -> Result<(), String> {
    let login_command = build_windows_visible_login_command(auth_env, npx_binary());
    let mut child = visible_windows_command("cmd.exe")
        .args(["/d", "/k"])
        .arg(login_command)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;

    thread::sleep(Duration::from_millis(800));
    match child.try_wait() {
        Ok(Some(status)) if !status.success() => Err(format!("cmd.exe exited with {status}")),
        Ok(_) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn launch_codex_login_process(app: &AppHandle) -> Result<(), String> {
    let auth_env = aref_codex_auth_env(app)?;
    ensure_codex_file_credentials_config(&auth_env)?;

    #[cfg(target_os = "windows")]
    {
        return launch_windows_visible_codex_login(&auth_env);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let npx_login_args = ["--yes", "@openai/codex@latest", "login"];

        for binary in codex_binary_candidates() {
            match try_spawn_process(binary, &["login"], &auth_env) {
                Ok(()) => return Ok(()),
                Err(error) if error.contains("No such file or directory") => continue,
                Err(error) if error.contains("cannot find the file") => continue,
                Err(_) => continue,
            }
        }

        try_spawn_process(npx_binary(), &npx_login_args, &auth_env)
    }
}

async fn start_managed_proxy(
    app: &AppHandle,
    runtime: &Ima2SidecarRuntimeState,
) -> Result<Ima2SidecarSettingsSnapshot, String> {
    cleanup_managed_proxy(runtime).await?;
    let settings = resolve_ima2_sidecar_settings(app)?;

    if managed_proxy_matches(runtime, &settings.base_url).await? {
        return fetch_ima2_sidecar_snapshot(app, runtime).await;
    }

    stop_managed_proxy(runtime).await?;

    let auth_env = aref_codex_auth_env(app)?;
    ensure_codex_file_credentials_config(&auth_env)?;
    let port = parse_proxy_port(&settings.base_url)?;
    let proxy_args = openai_oauth_proxy_args(port, &auth_env.auth_file);
    let auth_file_exists = auth_env.auth_file.exists();
    let mut proxy_command = hidden_command_with_args(npx_binary(), &proxy_args);
    apply_aref_codex_auth_env(&mut proxy_command, &auth_env);
    let child = proxy_command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to start openai-oauth via {} for {} with auth file {} (exists: {}) and CODEX_HOME {}: {}",
                npx_binary(),
                settings.base_url,
                auth_env.auth_file.display(),
                auth_file_exists,
                auth_env.codex_home.display(),
                error
            )
        })?;

    runtime.proxy.lock().await.replace(ManagedIma2Proxy {
        child,
        base_url: settings.base_url.clone(),
    });

    let deadline =
        Instant::now() + Duration::from_millis(IMA2_SIDECAR_PROXY_READY_TIMEOUT_MILLISECONDS);
    tokio::time::sleep(Duration::from_millis(
        IMA2_SIDECAR_PROXY_WARMUP_MILLISECONDS,
    ))
    .await;

    loop {
        let snapshot = fetch_ima2_sidecar_snapshot(app, runtime).await?;

        if snapshot.oauth_status != "starting" || Instant::now() >= deadline {
            return Ok(snapshot);
        }

        tokio::time::sleep(Duration::from_millis(
            IMA2_SIDECAR_PROXY_READY_POLL_MILLISECONDS,
        ))
        .await;
    }
}

async fn ensure_managed_proxy_ready(
    app: &AppHandle,
    runtime: &Ima2SidecarRuntimeState,
) -> Result<Ima2SidecarSettingsSnapshot, String> {
    let snapshot = fetch_ima2_sidecar_snapshot(app, runtime).await?;

    if snapshot.oauth_status == "ready" || snapshot.oauth_status == "auth_required" {
        return Ok(snapshot);
    }

    start_managed_proxy(app, runtime).await
}

async fn update_record(
    record: &Arc<Mutex<Ima2SidecarOperationRecord>>,
    update: impl FnOnce(&mut Ima2SidecarOperationRecord),
) {
    let mut guard = record.lock().await;
    update(&mut guard);
}

async fn send_request_with_cancel(
    request: reqwest::RequestBuilder,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<reqwest::Response, String> {
    if *cancel_rx.borrow() {
        return Err("cancelled".to_string());
    }

    tokio::select! {
        _ = cancel_rx.changed() => Err("cancelled".to_string()),
        response = request.send() => response.map_err(|error| error.to_string()),
    }
}

async fn read_response_text_with_cancel(
    response: reqwest::Response,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<String, String> {
    if *cancel_rx.borrow() {
        return Err("cancelled".to_string());
    }

    tokio::select! {
        _ = cancel_rx.changed() => Err("cancelled".to_string()),
        body = response.text() => body.map_err(|error| error.to_string()),
    }
}

async fn execute_single_oauth_request(
    client: &Client,
    base_url: &str,
    request: &StartIma2SidecarGenerationRequest,
    prompt: &str,
    size: &str,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<(String, String), String> {
    let streaming_body = build_oauth_request_body(request, prompt, size, true);
    let response = send_request_with_cancel(
        client
            .post(format!("{}/v1/responses", base_url))
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream, application/json")
            .header("X-Aref-Client", "aref")
            .json(&streaming_body),
        cancel_rx,
    )
    .await?;
    let status = response.status();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .unwrap_or_default();
    let response_request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body_text = read_response_text_with_cancel(response, cancel_rx).await?;

    if !status.is_success() {
        let parsed_error = serde_json::from_str::<Value>(&body_text)
            .ok()
            .and_then(|value| extract_error_message(&value))
            .unwrap_or(body_text);
        return Err(format!(
            "ChatGPT OAuth request failed ({}): {}",
            status.as_u16(),
            parsed_error
        ));
    }

    if content_type.contains("text/event-stream") {
        if let Ok(result) = parse_sse_response_for_image(&body_text, response_request_id.clone()) {
            return Ok(result);
        }
    } else if let Ok(result) =
        parse_json_response_for_image(&body_text, response_request_id.clone())
    {
        return Ok(result);
    }

    let fallback_body = build_oauth_request_body(request, prompt, size, false);
    let fallback_response = send_request_with_cancel(
        client
            .post(format!("{}/v1/responses", base_url))
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("X-Aref-Client", "aref")
            .json(&fallback_body),
        cancel_rx,
    )
    .await?;
    let fallback_status = fallback_response.status();
    let fallback_request_id = fallback_response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .or(response_request_id);
    let fallback_body_text = read_response_text_with_cancel(fallback_response, cancel_rx).await?;

    if !fallback_status.is_success() {
        let parsed_error = serde_json::from_str::<Value>(&fallback_body_text)
            .ok()
            .and_then(|value| extract_error_message(&value))
            .unwrap_or(fallback_body_text);
        return Err(format!(
            "ChatGPT OAuth fallback request failed ({}): {}",
            fallback_status.as_u16(),
            parsed_error
        ));
    }

    parse_json_response_for_image(&fallback_body_text, fallback_request_id)
}

async fn execute_ima2_sidecar_request(
    app: &AppHandle,
    base_url: &str,
    request: &StartIma2SidecarGenerationRequest,
    operation_id: &str,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<(Vec<Ima2SidecarGeneratedImage>, Vec<String>), String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(IMA2_SIDECAR_REQUEST_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| error.to_string())?;
    let (size, width, height) = aspect_ratio_to_ima2_size(&request.settings.aspect_ratio);
    let prompt = compose_prompt(&request.prompt, request.negative_prompt.as_deref());
    let output_directory = ima2_sidecar_generated_directory(app)?;
    let mut images = Vec::with_capacity(request.settings.image_count as usize);
    let mut request_ids = Vec::with_capacity(request.settings.image_count as usize);

    for index in 0..request.settings.image_count {
        let (request_id, payload) =
            execute_single_oauth_request(&client, base_url, request, &prompt, size, &mut cancel_rx)
                .await?;
        let (mime_type, bytes) = parse_generated_image_payload(&payload)?;
        let extension = extension_from_mime_type(&mime_type);
        let file_name = format!("{}-{}.{}", operation_id, index + 1, extension);
        let target_path = output_directory.join(&file_name);
        fs::write(&target_path, bytes).map_err(|error| error.to_string())?;
        request_ids.push(request_id);
        images.push(Ima2SidecarGeneratedImage {
            image_path: normalize_path(&target_path),
            thumbnail_path: None,
            width,
            height,
            source_name: Some(file_name),
        });
    }

    Ok((images, request_ids))
}

async fn run_ima2_sidecar_operation(
    app: AppHandle,
    base_url: String,
    record: Arc<Mutex<Ima2SidecarOperationRecord>>,
    request: StartIma2SidecarGenerationRequest,
    operation_id: String,
    cancel_rx: watch::Receiver<bool>,
    codex_auth_status: String,
    proxy_managed: bool,
) {
    let mode = if request.reference_images.len() == 1 {
        "edit".to_string()
    } else {
        "generate".to_string()
    };

    update_record(&record, |entry| {
        entry.status = "running".to_string();
        entry.mode = Some(mode.clone());
    })
    .await;

    let _ = append_ima2_sidecar_log(
        &app,
        &Ima2SidecarRequestLogEntry {
            timestamp: now_iso_string(),
            operation_id: operation_id.clone(),
            request_id: request.job_id.clone(),
            openai_request_ids: Vec::new(),
            model: request.model.clone(),
            mode: mode.clone(),
            base_url: base_url.clone(),
            status: "running".to_string(),
            reference_count: request.reference_images.len(),
            image_count: request.settings.image_count,
            prompt_length: request.prompt.len(),
            has_negative_prompt: request.negative_prompt.is_some(),
            codex_auth_status: codex_auth_status.clone(),
            proxy_managed,
            error: None,
        },
    );

    let result =
        execute_ima2_sidecar_request(&app, &base_url, &request, &operation_id, cancel_rx.clone())
            .await;

    match result {
        Ok((images, request_ids)) => {
            if *cancel_rx.borrow() {
                update_record(&record, |entry| {
                    entry.status = "cancelled".to_string();
                    entry.completed_at = Some(now_iso_string());
                    entry.error = None;
                    entry.images.clear();
                })
                .await;
                let _ = append_ima2_sidecar_log(
                    &app,
                    &Ima2SidecarRequestLogEntry {
                        timestamp: now_iso_string(),
                        operation_id,
                        request_id: request.job_id,
                        openai_request_ids: request_ids,
                        model: request.model,
                        mode,
                        base_url,
                        status: "cancelled".to_string(),
                        reference_count: request.reference_images.len(),
                        image_count: request.settings.image_count,
                        prompt_length: request.prompt.len(),
                        has_negative_prompt: request.negative_prompt.is_some(),
                        codex_auth_status,
                        proxy_managed,
                        error: None,
                    },
                );
                return;
            }

            update_record(&record, |entry| {
                entry.status = "succeeded".to_string();
                entry.completed_at = Some(now_iso_string());
                entry.error = None;
                entry.request_id = Some(request_ids.join(","));
                entry.mode = Some(mode.clone());
                entry.images = images;
            })
            .await;
            let _ = append_ima2_sidecar_log(
                &app,
                &Ima2SidecarRequestLogEntry {
                    timestamp: now_iso_string(),
                    operation_id,
                    request_id: request.job_id,
                    openai_request_ids: request_ids,
                    model: request.model,
                    mode,
                    base_url,
                    status: "succeeded".to_string(),
                    reference_count: request.reference_images.len(),
                    image_count: request.settings.image_count,
                    prompt_length: request.prompt.len(),
                    has_negative_prompt: request.negative_prompt.is_some(),
                    codex_auth_status,
                    proxy_managed,
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
            let _ = append_ima2_sidecar_log(
                &app,
                &Ima2SidecarRequestLogEntry {
                    timestamp: now_iso_string(),
                    operation_id,
                    request_id: request.job_id,
                    openai_request_ids: Vec::new(),
                    model: request.model,
                    mode,
                    base_url,
                    status: "cancelled".to_string(),
                    reference_count: request.reference_images.len(),
                    image_count: request.settings.image_count,
                    prompt_length: request.prompt.len(),
                    has_negative_prompt: request.negative_prompt.is_some(),
                    codex_auth_status,
                    proxy_managed,
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
            let _ = append_ima2_sidecar_log(
                &app,
                &Ima2SidecarRequestLogEntry {
                    timestamp: now_iso_string(),
                    operation_id,
                    request_id: request.job_id,
                    openai_request_ids: Vec::new(),
                    model: request.model,
                    mode,
                    base_url,
                    status: "failed".to_string(),
                    reference_count: request.reference_images.len(),
                    image_count: request.settings.image_count,
                    prompt_length: request.prompt.len(),
                    has_negative_prompt: request.negative_prompt.is_some(),
                    codex_auth_status,
                    proxy_managed,
                    error: Some(error),
                },
            );
        }
    }
}

#[tauri::command]
pub async fn get_ima2_sidecar_settings(
    app: AppHandle,
    runtime: State<'_, Ima2SidecarRuntimeState>,
) -> Result<Ima2SidecarSettingsSnapshot, String> {
    fetch_ima2_sidecar_snapshot(&app, runtime.inner()).await
}

#[tauri::command]
pub async fn save_ima2_sidecar_settings(
    app: AppHandle,
    runtime: State<'_, Ima2SidecarRuntimeState>,
    input: SaveIma2SidecarSettingsInput,
) -> Result<Ima2SidecarSettingsSnapshot, String> {
    let settings = StoredIma2SidecarSettings {
        base_url: trim_to_option(input.base_url),
    };

    if settings.base_url.is_none() {
        let path = ima2_sidecar_settings_path(&app)?;
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    } else {
        write_stored_ima2_sidecar_settings(&app, &settings)?;
    }

    fetch_ima2_sidecar_snapshot(&app, runtime.inner()).await
}

#[tauri::command]
pub async fn clear_ima2_sidecar_settings(
    app: AppHandle,
    runtime: State<'_, Ima2SidecarRuntimeState>,
) -> Result<Ima2SidecarSettingsSnapshot, String> {
    let path = ima2_sidecar_settings_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }

    fetch_ima2_sidecar_snapshot(&app, runtime.inner()).await
}

#[tauri::command]
pub async fn start_ima2_sidecar_proxy(
    app: AppHandle,
    runtime: State<'_, Ima2SidecarRuntimeState>,
) -> Result<Ima2SidecarSettingsSnapshot, String> {
    start_managed_proxy(&app, runtime.inner()).await
}

#[tauri::command]
pub async fn launch_ima2_sidecar_login(app: AppHandle) -> Result<(), String> {
    launch_codex_login_process(&app)
}

#[tauri::command]
pub async fn start_ima2_sidecar_generation(
    app: AppHandle,
    runtime: State<'_, Ima2SidecarRuntimeState>,
    registry: State<'_, Ima2SidecarOperationRegistry>,
    request: StartIma2SidecarGenerationRequest,
) -> Result<Ima2SidecarOperationSubmission, String> {
    if request.prompt.trim().is_empty() {
        return Err("Prompt is required.".to_string());
    }

    let snapshot = ensure_managed_proxy_ready(&app, runtime.inner()).await?;
    if snapshot.oauth_status == "auth_required" {
        if snapshot.codex_auth_status == "auth_file_missing" {
            let auth_env = aref_codex_auth_env(&app)?;
            return Err(format!(
                "Codex login is not available as a file for Aref. Use Aref ChatGPT OAuth login to create {}.",
                auth_env.auth_file.display()
            ));
        }
        return Err("ChatGPT OAuth needs login before generation can start.".to_string());
    }
    if snapshot.oauth_status == "starting" {
        return Err(
            "ChatGPT OAuth is still starting. Wait for Ready before generating.".to_string(),
        );
    }
    if snapshot.oauth_status != "ready" {
        return Err(format!(
            "ChatGPT OAuth is not ready at {} ({})",
            snapshot.base_url, snapshot.oauth_status
        ));
    }

    let operation_id = Uuid::new_v4().to_string();
    let record = Arc::new(Mutex::new(Ima2SidecarOperationRecord {
        status: "queued".to_string(),
        completed_at: None,
        error: None,
        request_id: Some(request.job_id.clone()),
        mode: Some(if request.reference_images.len() == 1 {
            "edit".to_string()
        } else {
            "generate".to_string()
        }),
        images: Vec::new(),
    }));
    let (cancel_tx, cancel_rx) = watch::channel(false);
    registry.operations.lock().await.insert(
        operation_id.clone(),
        Ima2SidecarOperationEntry {
            record: Arc::clone(&record),
            cancel_tx,
        },
    );

    let _ = append_ima2_sidecar_log(
        &app,
        &Ima2SidecarRequestLogEntry {
            timestamp: now_iso_string(),
            operation_id: operation_id.clone(),
            request_id: request.job_id.clone(),
            openai_request_ids: Vec::new(),
            model: request.model.clone(),
            mode: if request.reference_images.len() == 1 {
                "edit".to_string()
            } else {
                "generate".to_string()
            },
            base_url: snapshot.base_url.clone(),
            status: "queued".to_string(),
            reference_count: request.reference_images.len(),
            image_count: request.settings.image_count,
            prompt_length: request.prompt.len(),
            has_negative_prompt: request.negative_prompt.is_some(),
            codex_auth_status: snapshot.codex_auth_status.clone(),
            proxy_managed: snapshot.proxy_managed,
            error: None,
        },
    );

    let task_app = app.clone();
    let task_base_url = snapshot.base_url.clone();
    let task_record = Arc::clone(&record);
    let task_operation_id = operation_id.clone();
    let task_codex_auth_status = snapshot.codex_auth_status.clone();
    let task_proxy_managed = snapshot.proxy_managed;

    tauri::async_runtime::spawn(async move {
        run_ima2_sidecar_operation(
            task_app,
            task_base_url,
            task_record,
            request,
            task_operation_id,
            cancel_rx,
            task_codex_auth_status,
            task_proxy_managed,
        )
        .await;
    });

    Ok(Ima2SidecarOperationSubmission { operation_id })
}

#[tauri::command]
pub async fn poll_ima2_sidecar_generation(
    registry: State<'_, Ima2SidecarOperationRegistry>,
    operation_id: String,
) -> Result<Ima2SidecarOperationSnapshot, String> {
    let record = {
        let operations = registry.operations.lock().await;
        let entry = operations
            .get(&operation_id)
            .ok_or_else(|| format!("ChatGPT OAuth operation not found: {operation_id}"))?;
        Arc::clone(&entry.record)
    };
    let record = record.lock().await;

    Ok(Ima2SidecarOperationSnapshot {
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
pub async fn cancel_ima2_sidecar_generation(
    registry: State<'_, Ima2SidecarOperationRegistry>,
    operation_id: String,
) -> Result<(), String> {
    let entry = {
        let operations = registry.operations.lock().await;
        operations
            .get(&operation_id)
            .map(|entry| (Arc::clone(&entry.record), entry.cancel_tx.clone()))
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
    fn extracts_generated_images_from_responses_payload() {
        let payload = json!({
            "id": "resp_123",
            "output": [
                { "type": "message", "content": [] },
                { "type": "image_generation_call", "result": "ZmFrZS1pbWFnZQ==" }
            ]
        });

        assert_eq!(
            extract_generated_images(&payload),
            vec!["ZmFrZS1pbWFnZQ==".to_string()]
        );
    }

    #[test]
    fn parses_data_urls_and_raw_base64() {
        let png_data_url = "data:image/png;base64,iVBORw0KGgo=";
        let (mime_type, _bytes) =
            parse_generated_image_payload(png_data_url).expect("data url should parse");
        assert_eq!(mime_type, "image/png");

        let raw = STANDARD.encode([0x89, b'P', b'N', b'G', 0, 0, 0, 0]);
        let (mime_type, _bytes) =
            parse_generated_image_payload(&raw).expect("raw base64 should parse");
        assert_eq!(mime_type, "image/png");
    }

    #[test]
    fn maps_canvas_aspect_ratios_to_oauth_proxy_sizes() {
        assert_eq!(
            aspect_ratio_to_ima2_size("unspecified"),
            ("1024x1024", 1024, 1024)
        );
        assert_eq!(aspect_ratio_to_ima2_size("1:1"), ("1024x1024", 1024, 1024));
        assert_eq!(aspect_ratio_to_ima2_size("4:3"), ("1536x1024", 1536, 1024));
        assert_eq!(aspect_ratio_to_ima2_size("3:4"), ("1024x1536", 1024, 1536));
        assert_eq!(aspect_ratio_to_ima2_size("16:9"), ("1792x1024", 1792, 1024));
        assert_eq!(aspect_ratio_to_ima2_size("9:16"), ("1024x1792", 1024, 1792));
    }

    #[test]
    fn maps_missing_auth_to_login_needed_before_retrying_proxy() {
        assert_eq!(
            oauth_status_for_unreachable_proxy(false, "missing"),
            "auth_required"
        );
        assert_eq!(
            oauth_status_for_unreachable_proxy(false, "unknown"),
            "auth_required"
        );
        assert_eq!(
            oauth_status_for_unreachable_proxy(true, "authed"),
            "starting"
        );
        assert_eq!(
            oauth_status_for_unreachable_proxy(false, "authed"),
            "offline"
        );
    }

    #[test]
    fn maps_codex_login_status_probe_output() {
        assert_eq!(codex_login_status_from_output(true, b"", b""), "authed");
        assert_eq!(
            codex_login_status_from_output(false, b"Logged in with ChatGPT", b""),
            "authed"
        );
        assert_eq!(
            codex_login_status_from_output(false, b"Logged in using ChatGPT", b""),
            "authed"
        );
        assert_eq!(
            codex_login_status_from_output(true, b"Logged in using an API key", b""),
            "unauthed"
        );
        assert_eq!(
            codex_login_status_from_output(false, b"", b"Not logged in"),
            "unauthed"
        );
        assert_eq!(
            codex_login_status_from_output(false, b"", b"unexpected failure"),
            "unknown"
        );
    }

    #[test]
    fn writes_codex_file_credentials_config() {
        let root = env::temp_dir().join(format!("aref-codex-auth-test-{}", Uuid::new_v4()));
        let auth_env = ArefCodexAuthEnv {
            codex_home: root.join("codex"),
            chatgpt_local_home: root.join("chatgpt-local"),
            auth_file: root.join("codex").join("auth.json"),
        };

        ensure_codex_file_credentials_config(&auth_env).expect("config should be written");
        let contents =
            fs::read_to_string(auth_env.codex_home.join("config.toml")).expect("config readable");
        assert!(contents.contains("cli_auth_credentials_store = \"file\""));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rewrites_existing_codex_credentials_store_to_file() {
        let root = env::temp_dir().join(format!("aref-codex-auth-test-{}", Uuid::new_v4()));
        let auth_env = ArefCodexAuthEnv {
            codex_home: root.join("codex"),
            chatgpt_local_home: root.join("chatgpt-local"),
            auth_file: root.join("codex").join("auth.json"),
        };
        fs::create_dir_all(&auth_env.codex_home).expect("codex dir");
        fs::write(
            auth_env.codex_home.join("config.toml"),
            "model = \"gpt-5.4\"\ncli_auth_credentials_store = \"auto\"\n",
        )
        .expect("seed config");

        ensure_codex_file_credentials_config(&auth_env).expect("config should be rewritten");
        let contents =
            fs::read_to_string(auth_env.codex_home.join("config.toml")).expect("config readable");
        assert!(contents.contains("model = \"gpt-5.4\""));
        assert!(contents.contains("cli_auth_credentials_store = \"file\""));
        assert!(!contents.contains("cli_auth_credentials_store = \"auto\""));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn quotes_windows_cmd_tokens_with_spaces() {
        assert_eq!(
            build_windows_cmd_line("npx.cmd", &["--yes", "C:\\Users\\Aref User\\auth.json"]),
            "npx.cmd --yes \"C:\\Users\\Aref User\\auth.json\""
        );
    }

    #[test]
    fn builds_visible_windows_login_command_without_start_title_quoting() {
        let auth_env = ArefCodexAuthEnv {
            codex_home: PathBuf::from(
                "C:\\Users\\Aref User\\AppData\\Roaming\\Aref\\codex-oauth\\codex",
            ),
            chatgpt_local_home: PathBuf::from(
                "C:\\Users\\Aref User\\AppData\\Roaming\\Aref\\codex-oauth\\chatgpt-local",
            ),
            auth_file: PathBuf::from(
                "C:\\Users\\Aref User\\AppData\\Roaming\\Aref\\codex-oauth\\codex\\auth.json",
            ),
        };
        let command = build_windows_visible_login_command(&auth_env, "npx.cmd");

        assert!(command.starts_with("title Aref Codex Login && "));
        assert!(command.contains(
            "set \"CODEX_HOME=C:\\Users\\Aref User\\AppData\\Roaming\\Aref\\codex-oauth\\codex\""
        ));
        assert!(command.contains("set \"CHATGPT_LOCAL_HOME=C:\\Users\\Aref User\\AppData\\Roaming\\Aref\\codex-oauth\\chatgpt-local\""));
        assert!(command.contains("npx.cmd --yes @openai/codex@latest login --device-auth"));
        assert!(!command.contains("start \"Aref Codex Login\""));
        assert!(!command.contains("^&^&"));
    }

    #[test]
    fn starts_proxy_with_static_models_to_avoid_startup_discovery_failures() {
        let auth_file = PathBuf::from("C:\\Users\\Aref User\\auth.json");
        let args = openai_oauth_proxy_args(10531, &auth_file);

        assert_eq!(args[0], "--yes");
        assert_eq!(args[1], "openai-oauth@latest");
        assert!(args.contains(&"--models".to_string()));
        assert!(args.contains(&IMA2_SIDECAR_PROXY_MODELS.to_string()));
        assert!(args.contains(&"--oauth-file".to_string()));
        assert!(args.contains(&auth_file.to_string_lossy().to_string()));
    }
}
