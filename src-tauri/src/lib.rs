mod ima2_sidecar;
mod openai_provider;
mod project_persistence;
mod provider_logs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(openai_provider::OpenAiOperationRegistry::default())
        .manage(ima2_sidecar::Ima2SidecarOperationRegistry::default())
        .manage(ima2_sidecar::Ima2SidecarRuntimeState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            project_persistence::ingest_image_asset,
            project_persistence::read_image_bytes,
            project_persistence::load_project_file,
            project_persistence::save_project_file,
            project_persistence::save_autosave_project,
            project_persistence::load_startup_project,
            project_persistence::list_recent_projects,
            provider_logs::list_provider_request_logs,
            openai_provider::get_openai_settings,
            openai_provider::save_openai_settings,
            openai_provider::clear_openai_settings,
            openai_provider::start_openai_generation,
            openai_provider::poll_openai_generation,
            openai_provider::cancel_openai_generation,
            ima2_sidecar::get_ima2_sidecar_settings,
            ima2_sidecar::save_ima2_sidecar_settings,
            ima2_sidecar::clear_ima2_sidecar_settings,
            ima2_sidecar::start_ima2_sidecar_proxy,
            ima2_sidecar::launch_ima2_sidecar_login,
            ima2_sidecar::start_ima2_sidecar_generation,
            ima2_sidecar::poll_ima2_sidecar_generation,
            ima2_sidecar::cancel_ima2_sidecar_generation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aref");
}
