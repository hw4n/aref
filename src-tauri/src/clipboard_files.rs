use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const CLIPBOARD_IMAGE_DIRECTORY: &str = "clipboard-images";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImageFileInput {
    image_path: String,
    source_name: Option<String>,
}

fn app_local_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn sanitize_file_name(value: &str) -> String {
    let file_name = Path::new(value)
        .file_name()
        .and_then(|entry| entry.to_str())
        .unwrap_or(value);
    let sanitized = file_name
        .trim()
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim_matches(['.', ' '])
        .to_string();

    if sanitized.is_empty() {
        "image.png".to_string()
    } else {
        sanitized
    }
}

fn ensure_extension(file_name: String, source_path: &Path) -> String {
    if Path::new(&file_name).extension().is_some() {
        return file_name;
    }

    let extension = source_path
        .extension()
        .and_then(|entry| entry.to_str())
        .unwrap_or("png");

    format!("{file_name}.{extension}")
}

fn unique_file_name(file_name: String, used_names: &mut HashSet<String>) -> String {
    if used_names.insert(file_name.clone()) {
        return file_name;
    }

    let path = Path::new(&file_name);
    let stem = path
        .file_stem()
        .and_then(|entry| entry.to_str())
        .unwrap_or("image");
    let extension = path.extension().and_then(|entry| entry.to_str());

    for index in 2.. {
        let candidate = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };

        if used_names.insert(candidate.clone()) {
            return candidate;
        }
    }

    unreachable!("unique filename search should always return");
}

fn stage_clipboard_files(
    app: &AppHandle,
    files: Vec<ClipboardImageFileInput>,
) -> Result<Vec<PathBuf>, String> {
    if files.is_empty() {
        return Ok(Vec::new());
    }

    let clipboard_root = app_local_data_dir(app)?.join(CLIPBOARD_IMAGE_DIRECTORY);
    if clipboard_root.exists() {
        fs::remove_dir_all(&clipboard_root).map_err(|error| error.to_string())?;
    }

    let session_directory = clipboard_root.join(Uuid::new_v4().to_string());
    fs::create_dir_all(&session_directory).map_err(|error| error.to_string())?;

    let mut used_names = HashSet::new();
    let mut staged_paths = Vec::with_capacity(files.len());

    for file in files {
        let source_path = PathBuf::from(&file.image_path);
        if !source_path.is_file() {
            return Err(format!(
                "Clipboard source is not a file: {}",
                file.image_path
            ));
        }

        let preferred_name = file
            .source_name
            .as_deref()
            .map(sanitize_file_name)
            .unwrap_or_else(|| sanitize_file_name(&file.image_path));
        let file_name = unique_file_name(
            ensure_extension(preferred_name, &source_path),
            &mut used_names,
        );
        let target_path = session_directory.join(file_name);

        fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
        staged_paths.push(
            target_path
                .canonicalize()
                .map_err(|error| error.to_string())?,
        );
    }

    Ok(staged_paths)
}

#[tauri::command]
pub fn write_image_files_to_clipboard(
    app: AppHandle,
    files: Vec<ClipboardImageFileInput>,
) -> Result<usize, String> {
    let staged_paths = stage_clipboard_files(&app, files)?;

    if staged_paths.is_empty() {
        return Ok(0);
    }

    write_native_file_clipboard(&staged_paths)?;
    Ok(staged_paths.len())
}

#[cfg(target_os = "windows")]
fn write_native_file_clipboard(paths: &[PathBuf]) -> Result<(), String> {
    use std::{mem::size_of, os::windows::ffi::OsStrExt, ptr};

    use windows_sys::Win32::{
        Foundation::{HGLOBAL, POINT},
        System::{
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
        },
        UI::Shell::DROPFILES,
    };

    const CF_HDROP: u32 = 15;

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalFree(hmem: HGLOBAL) -> HGLOBAL;
    }

    let mut encoded_paths = Vec::<u16>::new();
    for path in paths {
        let encoded = path.as_os_str().encode_wide().collect::<Vec<_>>();
        if encoded.iter().any(|unit| *unit == 0) {
            return Err("Clipboard file paths cannot contain null characters.".to_string());
        }

        encoded_paths.extend(encoded);
        encoded_paths.push(0);
    }
    encoded_paths.push(0);

    let dropfiles = DROPFILES {
        pFiles: size_of::<DROPFILES>() as u32,
        pt: POINT { x: 0, y: 0 },
        fNC: 0,
        fWide: 1,
    };
    let byte_len = size_of::<DROPFILES>() + encoded_paths.len() * size_of::<u16>();

    unsafe {
        let handle = GlobalAlloc(GMEM_MOVEABLE, byte_len);
        if handle.is_null() {
            return Err("Failed to allocate clipboard memory.".to_string());
        }

        let memory = GlobalLock(handle) as *mut u8;
        if memory.is_null() {
            let _ = GlobalFree(handle);
            return Err("Failed to lock clipboard memory.".to_string());
        }

        ptr::copy_nonoverlapping(
            ptr::addr_of!(dropfiles).cast::<u8>(),
            memory,
            size_of::<DROPFILES>(),
        );
        ptr::copy_nonoverlapping(
            encoded_paths.as_ptr().cast::<u8>(),
            memory.add(size_of::<DROPFILES>()),
            encoded_paths.len() * size_of::<u16>(),
        );
        GlobalUnlock(handle);

        if OpenClipboard(ptr::null_mut()) == 0 {
            let _ = GlobalFree(handle);
            return Err("Failed to open the system clipboard.".to_string());
        }

        let mut transferred_handle = false;
        let result = (|| {
            if EmptyClipboard() == 0 {
                return Err("Failed to clear the system clipboard.".to_string());
            }

            if SetClipboardData(CF_HDROP, handle).is_null() {
                return Err("Failed to write files to the system clipboard.".to_string());
            }

            transferred_handle = true;
            Ok(())
        })();

        CloseClipboard();
        if !transferred_handle {
            let _ = GlobalFree(handle);
        }

        result
    }
}

#[cfg(target_os = "macos")]
fn write_native_file_clipboard(paths: &[PathBuf]) -> Result<(), String> {
    use std::process::Command;

    fn escape_applescript(value: &str) -> String {
        value.replace('\\', "\\\\").replace('"', "\\\"")
    }

    let file_entries = paths
        .iter()
        .map(|path| {
            format!(
                "POSIX file \"{}\"",
                escape_applescript(&path.to_string_lossy())
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    let script = format!("set the clipboard to {{{file_entries}}}");
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        return Ok(());
    }

    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[cfg(target_os = "linux")]
fn write_native_file_clipboard(paths: &[PathBuf]) -> Result<(), String> {
    use std::{
        io::Write,
        process::{Command, Stdio},
    };

    fn file_uri(path: &Path) -> String {
        let path = path.to_string_lossy().replace('\\', "/");
        let mut uri = String::from("file://");

        for byte in path.as_bytes() {
            match *byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => {
                    uri.push(*byte as char);
                }
                byte => uri.push_str(&format!("%{byte:02X}")),
            }
        }

        uri
    }

    fn write_to_command(command: &str, args: &[&str], payload: &str) -> Result<(), String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(payload.as_bytes())
                .map_err(|error| error.to_string())?;
        }

        let status = child.wait().map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("{command} exited with {status}"))
        }
    }

    let uri_list = paths
        .iter()
        .map(|path| file_uri(path))
        .collect::<Vec<_>>()
        .join("\n");

    write_to_command("wl-copy", &["--type", "text/uri-list"], &uri_list)
        .or_else(|_| {
            write_to_command(
                "xclip",
                &["-selection", "clipboard", "-t", "text/uri-list"],
                &uri_list,
            )
        })
        .or_else(|_| {
            write_to_command(
                "xsel",
                &["--clipboard", "--input", "--mime-type", "text/uri-list"],
                &uri_list,
            )
        })
        .map_err(|_| "No supported Linux clipboard file-list command found.".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn write_native_file_clipboard(_paths: &[PathBuf]) -> Result<(), String> {
    Err("Clipboard file lists are not supported on this platform.".to_string())
}
