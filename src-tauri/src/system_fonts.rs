use std::collections::BTreeSet;

const FONT_STYLE_SUFFIXES: &[&str] = &[
    " Bold Italic",
    " Bold Oblique",
    " SemiBold Italic",
    " Semibold Italic",
    " DemiBold Italic",
    " Demibold Italic",
    " Medium Italic",
    " Black Italic",
    " Heavy Italic",
    " Light Italic",
    " Italic",
    " Oblique",
    " Regular",
    " Normal",
    " Bold",
    " SemiBold",
    " Semibold",
    " DemiBold",
    " Demibold",
    " Medium",
    " Black",
    " Heavy",
    " Light",
];

fn normalize_font_family_name(name: &str) -> Option<String> {
    let without_format = name
        .split_once(" (")
        .map(|(family, _format)| family)
        .unwrap_or(name)
        .trim();
    let mut family = without_format.to_string();

    for suffix in FONT_STYLE_SUFFIXES {
        if family.len() > suffix.len() && family.ends_with(suffix) {
            family.truncate(family.len() - suffix.len());
            break;
        }
    }

    let family = family.trim();
    if family.is_empty() {
        None
    } else {
        Some(family.to_string())
    }
}

fn normalize_font_families(names: impl IntoIterator<Item = String>) -> Vec<String> {
    names
        .into_iter()
        .filter_map(|name| normalize_font_family_name(&name))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

#[cfg(windows)]
fn list_system_fonts_internal() -> Result<Vec<String>, String> {
    use std::process::Command;

    let script = r#"
$paths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
  'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
)
foreach ($path in $paths) {
  if (Test-Path $path) {
    (Get-ItemProperty -Path $path).PSObject.Properties |
      Where-Object { $_.Name -notlike 'PS*' } |
      ForEach-Object { $_.Name }
  }
}
"#;
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(normalize_font_families(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.to_string()),
    ))
}

#[cfg(not(windows))]
fn list_system_fonts_internal() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    list_system_fonts_internal()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_windows_registry_font_names_to_families() {
        let families = normalize_font_families([
            "Arial (TrueType)".to_string(),
            "Arial Bold (TrueType)".to_string(),
            "Segoe UI Italic (TrueType)".to_string(),
            "Segoe UI (TrueType)".to_string(),
        ]);

        assert_eq!(families, vec!["Arial".to_string(), "Segoe UI".to_string()]);
    }
}
