mod aria;
mod bridge;
mod commands;
mod paths;
mod state;
mod tray;
mod update;
mod windows;

use tauri::{Manager, RunEvent};
use tauri_plugin_autostart::MacosLauncher;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a.contains("exit")) {
                app.exit(0);
            } else {
                windows::show_main(app);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            commands::system::platform_info,
            commands::system::open_dialog,
            commands::system::clipboard_read_text,
            commands::system::clipboard_write_text,
            commands::system::open_external,
            commands::system::open_path,
            commands::system::show_item_in_folder,
            commands::system::shutdown_computer,
            commands::system::prevent_sleep,
            commands::system::set_progress_bar,
            commands::system::notify_download_completed,
            commands::system::show_context_menu,
            commands::system::get_cookies,
            commands::system::clear_cookies,
            commands::system::clear_browsing_data,
            commands::system::set_proxy,
            commands::system::relaunch_app,
            commands::system::quit_app,
            commands::system::save_theme,
            commands::system::get_theme_state,
            commands::system::set_launch_at_login,
            commands::system::aria_rpc_port,
            commands::system::aria_restart,
            commands::system::auto_update_get_state,
            commands::system::auto_update_check,
            commands::system::auto_update_install,
            commands::window::main_window_cmd,
            commands::window::window_cmd,
            commands::window::open_page_window,
            commands::window::get_page_context,
            commands::window::ensure_transfer_worker,
            commands::window::worker_ready,
            commands::window::open_login_window,
            commands::window::close_login_window,
            commands::window::open_site_window,
            commands::window::site_window_cmd,
            commands::window::close_site_window,
            commands::window::toggle_devtools,
            commands::fs::fs_exists,
            commands::fs::fs_stat,
            commands::fs::fs_read_dir,
            commands::fs::fs_mkdir,
            commands::fs::fs_remove,
            commands::fs::fs_rename,
            commands::fs::fs_copy,
            commands::fs::fs_read_text,
            commands::fs::fs_write_text,
            commands::fs::fs_write_bytes,
            commands::fs::fs_append_bytes,
            commands::fs::fs_read_range,
            commands::fs::fs_dir_size,
            commands::transfer::file_prehash,
            commands::transfer::file_sha1,
            commands::transfer::file_sha1_cancel,
            commands::transfer::upload_part,
            commands::transfer::upload_cancel,
            commands::transfer::set_upload_speed_limit,
            commands::transfer::flowenc_file,
            commands::transfer::flowenc_bytes,
            commands::proxy::proxy_start,
            commands::proxy::proxy_stop,
            commands::proxy::proxy_status,
            commands::proxy::proxy_provide_url,
            commands::proxy::get_local_ip,
            commands::proxy::find_free_port,
            commands::proxy::proxy_set_token,
            commands::http::http_request,
            commands::http::http_body_chunk,
            commands::http::http_body_release
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let user_data = paths::resolve_user_data_dir(&handle);
            let resource_dir = paths::resource_dir(&handle);
            log::info!("user data: {}", user_data.display());
            app.manage(AppState::new(user_data.clone(), resource_dir));
            app.state::<AppState>().update.init(&handle);
            {
                let state = app.state::<AppState>();
                match tauri::async_runtime::block_on(bridge::start(state.body_store.clone())) {
                    Ok(port) => {
                        log::info!("loopback bridge on 127.0.0.1:{port}");
                        *state.bridge_port.lock() = port;
                    }
                    Err(err) => log::warn!("loopback bridge unavailable, falling back to IPC bodies: {err}"),
                }
            }

            let argv: Vec<String> = std::env::args().collect();
            let hidden_start = argv.iter().any(|a| a == "--openAsHidden") || (argv.iter().any(|a| a == "--autostart") && !paths::setting_bool(&user_data, "uiLaunchStartShow"));
            windows::create_main_window(&handle, !hidden_start)?;
            if let Err(err) = tray::create_tray(&handle) {
                log::warn!("tray: {err}");
            }

            // aria2c + update check start a little after the UI, like the Electron version did.
            let delayed = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                if let Err(err) = aria::ensure_running(&delayed) {
                    log::warn!("aria2c: {err}");
                }
                if paths::setting_bool(&delayed.state::<AppState>().user_data, "uiLaunchAutoCheckUpdate") {
                    let state = delayed.state::<AppState>();
                    let _ = state.update.check(&delayed, false).await;
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building AlipanBuddy")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => windows::show_main(app),
            RunEvent::Exit => {
                let handle = app.clone();
                tauri::async_runtime::block_on(commands::proxy::stop_server(&handle));
                aria::shutdown_blocking(app);
            }
            _ => {}
        });
}
