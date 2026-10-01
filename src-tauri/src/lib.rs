use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use serde::Serialize;
use std::time::SystemTime;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalEvent {
    task_id: String,
    ts: String,
    level: String,
    text: String,
    elapsed_ms: u64,
}

#[tauri::command]
async fn fastboot_getvar(app: AppHandle, var: String) -> Result<(), String> {
    let shell = app.shell();
    let command = shell.sidecar("fastboot").map_err(|e| e.to_string())?;
    let (mut rx, _child) = command
        .args(["getvar", &var])
        .spawn()
        .map_err(|e| e.to_string())?;

    let start_time = SystemTime::now();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(data) |
                tauri_plugin_shell::process::CommandEvent::Stderr(data) => {
                    let text = String::from_utf8_lossy(&data).to_string().trim_end().to_string();
                    if text.is_empty() { continue; }
                    
                    let elapsed = start_time.elapsed().unwrap_or_default().as_millis() as u64;
                    let _ = app.emit("terminal-line", TerminalEvent {
                        task_id: "t_getvar".to_string(),
                        ts: chrono::Local::now().format("%H:%M:%S").to_string(),
                        level: "info".to_string(),
                        text,
                        elapsed_ms: elapsed,
                    });
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fastboot_getvar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
