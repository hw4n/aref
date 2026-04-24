use std::{fs, path::PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

const OPENAI_REQUEST_LOG_FILENAME: &str = "openai-requests.jsonl";
const IMA2_SIDECAR_REQUEST_LOG_FILENAME: &str = "ima2-sidecar-requests.jsonl";
const DEFAULT_LOG_LIMIT: usize = 12;
const MAX_LOG_LIMIT: usize = 100;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequestLogEntry {
    provider: String,
    timestamp: Option<String>,
    status: Option<String>,
    model: Option<String>,
    mode: Option<String>,
    operation_id: Option<String>,
    client_request_id: Option<String>,
    provider_request_id: Option<String>,
    prompt_length: Option<u64>,
    image_count: Option<u64>,
    reference_count: Option<u64>,
    error: Option<String>,
    raw_json: String,
}

fn app_local_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn resolve_log_filename(provider: &str) -> Result<(&'static str, &'static str), String> {
    match provider {
        "openai" => Ok(("openai", OPENAI_REQUEST_LOG_FILENAME)),
        "ima2-sidecar" | "chatgpt-oauth" => Ok(("ima2-sidecar", IMA2_SIDECAR_REQUEST_LOG_FILENAME)),
        _ => Err(format!("Unsupported provider log source: {provider}")),
    }
}

fn extract_first_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn extract_first_u64(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_u64))
}

fn extract_provider_request_id(value: &Value) -> Option<String> {
    if let Some(request_id) = value.get("openaiRequestId").and_then(Value::as_str) {
        return Some(request_id.to_string());
    }

    if let Some(request_ids) = value.get("openaiRequestIds").and_then(Value::as_array) {
        let joined = request_ids
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(", ");

        if !joined.is_empty() {
            return Some(joined);
        }
    }

    None
}

fn map_log_line(provider: &str, raw_json: &str) -> Option<ProviderRequestLogEntry> {
    let value = serde_json::from_str::<Value>(raw_json).ok()?;

    Some(ProviderRequestLogEntry {
        provider: provider.to_string(),
        timestamp: extract_first_string(&value, &["timestamp"]),
        status: extract_first_string(&value, &["status"]),
        model: extract_first_string(&value, &["model"]),
        mode: extract_first_string(&value, &["mode"]),
        operation_id: extract_first_string(&value, &["operationId"]),
        client_request_id: extract_first_string(&value, &["clientRequestId", "requestId"]),
        provider_request_id: extract_provider_request_id(&value),
        prompt_length: extract_first_u64(&value, &["promptLength"]),
        image_count: extract_first_u64(&value, &["imageCount"]),
        reference_count: extract_first_u64(&value, &["referenceCount"]),
        error: extract_first_string(&value, &["error"]),
        raw_json: raw_json.to_string(),
    })
}

#[tauri::command]
pub fn list_provider_request_logs(
    app: AppHandle,
    provider: String,
    limit: Option<usize>,
) -> Result<Vec<ProviderRequestLogEntry>, String> {
    let (provider_id, filename) = resolve_log_filename(&provider)?;
    let path = app_local_data_dir(&app)?.join(filename);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let limit = limit.unwrap_or(DEFAULT_LOG_LIMIT).min(MAX_LOG_LIMIT);
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let entries = contents
        .lines()
        .rev()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                None
            } else {
                map_log_line(provider_id, trimmed)
            }
        })
        .take(limit)
        .collect::<Vec<_>>();

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_openai_log_lines() {
        let raw = r#"{"timestamp":"2026-04-23T12:00:00Z","operationId":"op-1","clientRequestId":"job-1","openaiRequestId":"req-1","model":"gpt-image-2","mode":"generate","status":"failed","referenceCount":2,"imageCount":1,"promptLength":22,"error":"boom"}"#;
        let entry = map_log_line("openai", raw).expect("entry should parse");

        assert_eq!(entry.provider, "openai");
        assert_eq!(entry.operation_id.as_deref(), Some("op-1"));
        assert_eq!(entry.client_request_id.as_deref(), Some("job-1"));
        assert_eq!(entry.provider_request_id.as_deref(), Some("req-1"));
        assert_eq!(entry.error.as_deref(), Some("boom"));
    }

    #[test]
    fn maps_chatgpt_oauth_log_lines_with_multiple_request_ids() {
        let raw = r#"{"timestamp":"2026-04-23T12:00:00Z","operationId":"op-2","requestId":"job-2","openaiRequestIds":["req-a","req-b"],"model":"gpt-5.5","mode":"edit","status":"succeeded","referenceCount":1,"imageCount":2,"promptLength":44,"proxyManaged":true}"#;
        let entry = map_log_line("ima2-sidecar", raw).expect("entry should parse");

        assert_eq!(entry.provider, "ima2-sidecar");
        assert_eq!(entry.client_request_id.as_deref(), Some("job-2"));
        assert_eq!(entry.provider_request_id.as_deref(), Some("req-a, req-b"));
        assert_eq!(entry.status.as_deref(), Some("succeeded"));
    }
}
