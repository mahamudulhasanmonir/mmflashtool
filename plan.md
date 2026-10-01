# Phone Technician Toolkit — Development Plan

A modern desktop app for phone technicians: device detection, ADB & Fastboot control, firmware flashing, backups, and a live terminal — in the style of MTFlash Tool.

> Working name: **TechFlash** (change freely)

---

## 1. Goals & Scope

### What the screenshot shows (reference features)
| Area | Features |
|---|---|
| Header | Date/time, device badge (serial/ID), connection indicator, contact links |
| Tabs | Main · Program · Unlock & Flash · Tools · ADB & Fastboot |
| Fastboot panel | Reboot modes + Execute, Check device, Getvar (All/Slot/Product/Status), Quick actions (Flashing Unlock, OEM Unlock-Go, Change Slot, Format Data), Flash partition + file picker, raw command box + Run |
| Terminal | Timestamped log, command echo, result, total time, OK/FAIL status, copy & clear |

### Product goals
1. **Reliable**: never leave a device half-flashed without warning and recovery guidance.
2. **Fast**: native speed, small installer, instant UI.
3. **Safe**: confirmation dialogs for destructive actions, auto-backup prompts, full audit log.
4. **Extensible**: new device brands/modes added as plugins/modules, not rewrites.
5. **Modern UI**: dark theme, clean, keyboard-friendly, responsive.

### Non-goals / legal note
- This plan covers **legitimate service work**: official unlock flows (user-owned devices), flashing official firmware, backups, diagnostics.
- Features that bypass account locks / anti-theft protection (FRP bypass, IMEI changes, etc.) are **intentionally excluded**. They carry legal risk, can facilitate theft, and could get your software flagged by antivirus or banned from distribution. Add an "I own this device / have the owner's permission" confirmation before any unlock/wipe operation.

---

## 2. Technology Stack

### Recommended: **Tauri 2 (Rust) + React + TypeScript**

| Layer | Choice | Why |
|---|---|---|
| App shell | **Tauri 2** | ~10 MB installer vs 150 MB+ for Electron, native performance, strong sandboxing, built-in updater & sidecar support |
| Backend language | **Rust** | Safe concurrency for USB/process handling, great for long-running flash tasks |
| Frontend | **React 18 + TypeScript + Vite** | Huge ecosystem, fast dev loop |
| Styling | **Tailwind CSS + shadcn/ui + Radix** | Matches the modern dark look in the screenshot |
| Icons | **lucide-react** | Consistent icon set |
| State | **Zustand** (UI state) + **TanStack Query** (async/device data) | Lightweight, minimal boilerplate |
| Terminal view | Custom virtualized log list (`@tanstack/react-virtual`); optional **xterm.js** for raw shell | Handles 100k+ lines smoothly |
| ADB/Fastboot | **Bundled `platform-tools` as Tauri sidecars** (Phase 1), later optional native crates (`adb_client`, `nusb`) | Sidecars are the fastest, most compatible path; native comes later for speed and control |
| USB detection | **`nusb`** or **`rusb`** crate + VID/PID database | Detect devices in ADB / Fastboot / MTK / EDL / DFU modes |
| Local DB | **SQLite** via `sqlx` / `tauri-plugin-sql` | Job history, device profiles, logs |
| Settings | `tauri-plugin-store` | Simple key-value config |
| Logging | `tracing` + `tracing-appender` (rolling files) | Exportable logs for support |
| Updates | `tauri-plugin-updater` | Signed auto-updates |
| Testing | Vitest, React Testing Library, Rust `cargo test`, Playwright (UI), mock device layer | |
| CI/CD | GitHub Actions, Windows code-signing | |

### Alternatives (if you prefer)
| Option | Pros | Cons |
|---|---|---|
| **Electron + Node** | Easiest if you know JS only | Large size, higher RAM |
| **.NET 8 + Avalonia / WPF** | Excellent Windows driver/USB tooling, great if you know C# | Less modern UI tooling |
| **Python + PySide6** | Fast prototype, many device libs | Packaging pain, slower UI, easier to reverse-engineer |

### Target platforms
- **Windows 10/11** (primary — most technicians)
- Linux & macOS (secondary; Tauri supports them, USB driver handling differs)

---

## 3. Architecture

```
┌──────────────────────────── Frontend (React) ───────────────────────────┐
│  Tabs/Pages  │  Components  │  Zustand stores  │  Tauri invoke/events   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ IPC (commands + event stream)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                           Rust Core (Tauri)                              │
│                                                                          │
│  Device Manager ── USB watcher (hotplug) ── Mode detector                │
│        │                                                                 │
│  Task Engine ── queue · progress · cancel · timeout · retry              │
│        │                                                                 │
│  Backends (trait `DeviceBackend`)                                        │
│    ├─ AdbBackend        (sidecar → native later)                         │
│    ├─ FastbootBackend   (sidecar → native later)                         │
│    ├─ Brand modules     (Samsung/Odin-style, Xiaomi, MTK, Qualcomm…)     │
│    └─ MockBackend       (tests, demo mode)                               │
│                                                                          │
│  Safety Layer ── confirmations · file hash check · battery check         │
│  Storage ── SQLite (history) · Logs · Settings                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key design rules
1. **Everything long-running is a Task** with an ID, status (`queued/running/done/failed/cancelled`), progress %, and streamed log lines.
2. **Frontend never spawns processes**. It only calls whitelisted Rust commands.
3. **Backend trait** so adding a new protocol = implementing one trait.
4. **Events over polling**: `device-connected`, `device-disconnected`, `task-progress`, `terminal-line`.
5. **Raw command box** is allowed but passes through a validator and is logged.

### Core Rust trait (sketch)
```rust
#[async_trait]
pub trait DeviceBackend: Send + Sync {
    fn name(&self) -> &'static str;
    async fn list_devices(&self) -> Result<Vec<DeviceInfo>>;
    async fn run(&self, serial: &str, cmd: Command, ctx: TaskCtx) -> Result<CommandOutput>;
    async fn flash(&self, serial: &str, partition: &str, file: &Path, ctx: TaskCtx) -> Result<()>;
}
```

### Tauri commands (initial set)
```
list_devices()                      get_device_info(serial)
adb_run(serial, args[])             adb_reboot(serial, mode)
fastboot_run(serial, args[])        fastboot_getvar(serial, var)
fastboot_reboot(serial, mode)       fastboot_flash(serial, partition, path)
fastboot_set_active_slot(serial, slot)
fastboot_erase(serial, partition)   fastboot_flashing_unlock(serial)
cancel_task(task_id)                get_history(filter)
export_logs()                       check_for_updates()
```

### Event payload (terminal line)
```json
{ "taskId": "t_102", "ts": "14:39:42", "level": "info|cmd|ok|error",
  "text": "product: onyx", "elapsedMs": 5 }
```

---

## 4. Project Structure

```
techflash/
├─ src-tauri/
│  ├─ binaries/                # adb, fastboot sidecars (per-target triple)
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ commands/             # adb.rs, fastboot.rs, device.rs, tools.rs
│  │  ├─ core/
│  │  │  ├─ device_manager.rs
│  │  │  ├─ usb_watcher.rs
│  │  │  ├─ task_engine.rs
│  │  │  └─ safety.rs
│  │  ├─ backends/             # adb.rs, fastboot.rs, mock.rs, (brands/…)
│  │  ├─ db/                   # migrations, models
│  │  └─ error.rs
│  ├─ tauri.conf.json
│  └─ Cargo.toml
├─ src/
│  ├─ app/                     # routes/tabs
│  ├─ features/
│  │  ├─ main/  ├─ program/  ├─ unlock-flash/  ├─ tools/  └─ adb-fastboot/
│  ├─ components/              # Terminal, DeviceBadge, ConfirmDialog, FilePicker…
│  ├─ stores/                  # deviceStore, terminalStore, settingsStore
│  ├─ lib/                     # ipc.ts, format.ts, validators.ts
│  └─ styles/
├─ docs/
├─ .github/workflows/
└─ plan.md
```

---

## 5. UI / UX Plan

### Layout (matches reference)
- **Top bar**: app logo, title, window controls, date/time, device badge (serial + mode color), connection status.
- **Tab bar**: Main · Program · Unlock & Flash · Tools · ADB & Fastboot.
- **Page body**: feature cards (rounded, dark, subtle borders).
- **Bottom/side Terminal**: always visible, collapsible, copy/clear/export, filter by level.

### Design tokens
| Token | Value |
|---|---|
| Background | `#0b0f17` |
| Card | `#121826` |
| Border | `#1f2937` |
| Primary (action) | purple `#8b5cf6` |
| Success | green `#22c55e` |
| Danger | red `#ef4444` |
| Info | cyan/blue `#0ea5e9` |
| Warning | orange `#f97316` |
| Font | Inter (UI) + JetBrains Mono (terminal) |

### UX rules
- Destructive buttons (Format Data, Erase, Flashing Unlock) are **red/orange and always confirm**, showing exactly what will happen and the device serial.
- Buttons disable with a spinner while a task runs; a global **Cancel** appears.
- Device mode badge colors: ADB (blue), Fastboot (green), Recovery (yellow), BROM/EDL (purple), Unknown (grey).
- Keyboard shortcuts: `Ctrl+K` command palette, `Ctrl+L` clear terminal, `Ctrl+Enter` run command.
- Multi-language support from day one (i18next) — English + your local language.

---

## 6. Development Phases

> Each phase ends with a **working, demoable build**. Estimates assume one developer, part-time (~15–20 h/week). Halve for full-time.

### Phase 0 — Research & Setup (Week 1)
**Goal:** Everything ready to code.
- [ ] Install Rust, Node 20+, pnpm, Tauri CLI, Android platform-tools
- [ ] Create repo, Tauri + React + TS + Tailwind + shadcn scaffold
- [ ] Set up ESLint, Prettier, Clippy, rustfmt, Husky pre-commit
- [ ] Set up GitHub Actions (build on push)
- [ ] Collect test devices (at least 1 Android phone with unlocked bootloader you can safely experiment on)
- [ ] Download latest official `platform-tools` and place in `src-tauri/binaries/` with target-triple names
- [ ] Write ADR doc: why Tauri, why sidecars first

**Deliverable:** Blank app window launches on Windows with dark theme.

---

### Phase 1 — App Shell, Terminal & Device Detection (Weeks 2–3)
**Goal:** The UI frame and live device awareness.
- [ ] Custom title bar + window controls
- [ ] Tab navigation (all 5 tabs, placeholders OK)
- [ ] Header: live clock/date, device badge
- [ ] **Terminal component**: timestamped lines, level colors, auto-scroll, copy, clear, export `.txt`
- [ ] Rust: sidecar runner utility (spawn, stream stdout/stderr, exit code, duration)
- [ ] Rust: USB hotplug watcher → emits `device-connected/disconnected`
- [ ] Mode detection by running `adb devices` and `fastboot devices` + USB VID/PID
- [ ] Device Zustand store, multi-device selector dropdown
- [ ] Settings page skeleton (theme, language, platform-tools path)
- [ ] Driver helper screen: detect missing drivers on Windows, link to Google USB driver / OEM drivers

**Deliverable:** Plug a phone in → badge shows serial + mode; terminal logs events.

---

### Phase 2 — ADB Module (Weeks 4–5)
**Goal:** Full ADB tab.
- [ ] Reboot menu: system, recovery, bootloader, fastbootd, sideload
- [ ] Device info: model, brand, Android version, build, security patch, battery, storage, IMEI (read-only, where permitted), root status
- [ ] File manager (push/pull, browse `/sdcard`)
- [ ] App manager: list, install APK (multi), uninstall, disable, clear data, extract APK
- [ ] Shell command box with history & autocomplete
- [ ] Logcat viewer with filters (level, tag, search) + save
- [ ] Screenshot & screen record
- [ ] Wireless ADB pairing (QR / IP)
- [ ] Sideload zip with progress

**Deliverable:** Technician can fully inspect and manage a booted phone.

---

### Phase 3 — Fastboot Module (Weeks 6–7)
**Goal:** Reproduce the screenshot's Fastboot panel.
- [ ] Reboot dropdown (Normal, Bootloader, Recovery, Fastbootd) + Execute
- [ ] **Check** button (device present, `fastboot devices`)
- [ ] Getvar buttons: All, Slot, Product, Status (unlocked, secure, battery, etc.) with parsed, formatted results
- [ ] Quick actions: Flashing Unlock, Flashing Lock, Change Slot (A↔B), Format Data (`-w`)
- [ ] Flash panel: partition dropdown (boot, vendor_boot, init_boot, recovery, dtbo, vbmeta, super, system, etc.) + file picker + Flash button
- [ ] Raw `fastboot` command box with validation + history
- [ ] Sparse image handling, `--disable-verity` / `--disable-verification` options
- [ ] Confirmation dialogs with serial + action summary
- [ ] Task progress bar & elapsed timer ("Finished. Total time: 0.005s")

**Deliverable:** Parity with the screenshot's ADB & Fastboot tab.

---

### Phase 4 — Safety, Task Engine & Flash Workflows (Weeks 8–9)
**Goal:** Make flashing professional and hard to mess up.
- [ ] Central **Task Engine**: queue, concurrent per-device, cancel, timeout, retry, resume where possible
- [ ] **Firmware package loader**: select folder / zip → parse (`flash_all.bat/sh`, `images/`, `super` chunks, scatter-like manifests)
- [ ] Flash plan preview: ordered steps, partitions, expected sizes
- [ ] Pre-flight checks: battery level ≥ threshold, slot/bootloader state, image ↔ device codename match (`product` getvar), free disk space
- [ ] File integrity: SHA-256 verification, optional known-hash database
- [ ] Auto-backup prompt before destructive ops (boot, vbmeta, persist-type partitions where readable)
- [ ] Job history in SQLite (who/when/device/steps/result) → exportable PDF/CSV report for customers
- [ ] Error catalog with plain-language explanations + suggested fixes

**Deliverable:** One-click "Flash Firmware Package" with safeguards and a service report.

---

### Phase 5 — Unlock & Flash Tab, Program Tab, Tools Tab (Weeks 10–12)
**Goal:** The remaining tabs become useful.

**Unlock & Flash** (official flows only)
- [ ] Guided bootloader unlock wizard (enable OEM unlocking → fastboot → `flashing unlock` / OEM-specific official method) with warnings about data wipe
- [ ] Brand-specific official-token flows where the vendor provides them (e.g., unlock-code entry)
- [ ] Re-lock wizard
- [ ] Custom recovery / magisk-patched boot flashing helper

**Program tab**
- [ ] Scatter / partition-table viewer and selector
- [ ] Multi-image flashing queue with per-row checkboxes and status
- [ ] Save/load flash profiles (JSON)

**Tools tab**
- [ ] Partition backup & restore (via fastboot/ADB/recovery where supported)
- [ ] Boot image unpack/repack viewer (header info, ramdisk list)
- [ ] Payload.bin extractor (OTA → images)
- [ ] Hash calculator, file inspector
- [ ] Driver installer / USB diagnostics
- [ ] Device profile library (per-model notes, button combos to enter modes)

**Main tab**
- [ ] Dashboard: connected device summary, quick actions, recent jobs, tips

**Deliverable:** All five tabs populated and consistent.

---

### Phase 6 — Chipset / Brand Modules (Weeks 13–16, optional, modular)
**Goal:** Extend beyond ADB/Fastboot. Each module is independent and can ship separately.
- [ ] **Backend trait plug-in system** (load modules by feature flag)
- [ ] **MediaTek**: BROM/preloader detection, scatter-file flashing, readback — evaluate integrating established open-source tooling (e.g., `mtkclient`) via sidecar rather than reimplementing protocols
- [ ] **Qualcomm**: EDL/Sahara/Firehose flashing with user-supplied programmers and rawprogram/patch XMLs
- [ ] **Samsung**: Download-mode flashing (Heimdall-style), reading PIT
- [ ] **Apple (optional)**: restore/DFU via `libimobiledevice` tooling

> Each module: separate Rust crate, own tests with mock transport, own docs. Only support operations with official firmware or user-owned data.

**Deliverable:** At least one non-Android-standard module (suggest MediaTek, since your reference tool is MT-focused) working end-to-end.

---

### Phase 7 — Accounts, Licensing, Updates & Telemetry (Weeks 17–18)
**Goal:** Ready to distribute or sell.
- [ ] Optional login & license system (server: Node/NestJS or Rust Axum + PostgreSQL)
- [ ] Hardware-bound license keys, offline grace period
- [ ] Signed auto-updates with release channels (stable/beta)
- [ ] Opt-in anonymous crash reporting (Sentry) — **no device identifiers without consent**
- [ ] Remote config for device-profile database updates (so new models don't require an app update)
- [ ] In-app changelog and news panel

**Deliverable:** Licensed, auto-updating app.

---

### Phase 8 — QA, Hardening & Release (Weeks 19–20)
- [ ] Test matrix: Windows 10/11 × Intel/AMD/ARM, 5+ phone brands, USB 2/3 ports & hubs
- [ ] Failure injection: unplug mid-flash, cancel, timeout, corrupted image
- [ ] Performance: terminal with 100k lines, startup < 2 s, idle RAM < 150 MB
- [ ] Security review: IPC allowlist, path traversal, command-injection tests, dependency audit (`cargo audit`, `npm audit`)
- [ ] Code-sign installer (EV certificate reduces SmartScreen/AV false positives)
- [ ] Submit installer to major AV vendors for whitelisting
- [ ] Write user manual, video tutorials, FAQ
- [ ] Beta with 10–20 technicians, collect feedback → v1.0

**Deliverable:** **v1.0.0 public release.**

---

## 7. Timeline Summary

| Phase | Focus | Duration | Cumulative |
|---|---|---|---|
| 0 | Setup | 1 wk | 1 |
| 1 | Shell, terminal, detection | 2 wks | 3 |
| 2 | ADB | 2 wks | 5 |
| 3 | Fastboot | 2 wks | 7 |
| 4 | Safety & task engine | 2 wks | 9 |
| 5 | Remaining tabs | 3 wks | 12 |
| 6 | Chipset modules (optional) | 4 wks | 16 |
| 7 | Licensing & updates | 2 wks | 18 |
| 8 | QA & release | 2 wks | 20 |

**MVP (usable daily): end of Phase 3 (~7 weeks).**

---

## 8. Data Models (SQLite)

```sql
devices(id, serial, brand, model, codename, last_seen, notes)
jobs(id, device_id, type, started_at, finished_at, status, summary)
job_steps(id, job_id, order_no, command, status, duration_ms, output)
firmware_packages(id, name, codename, sha256, path, added_at)
profiles(id, name, json, created_at)
settings(key, value)
```

---

## 9. Security & Reliability Checklist

- [ ] Tauri **capabilities/allowlist**: only needed commands and sidecars exposed
- [ ] Never build shell strings; pass **argument arrays** to processes
- [ ] Validate raw commands (block shell metacharacters; restrict to `adb`/`fastboot` subcommands)
- [ ] Canonicalize all file paths; reject unexpected extensions
- [ ] Verify sidecar binary hashes at startup
- [ ] Per-task timeouts and kill-on-cancel
- [ ] Graceful handling of disconnects mid-task with clear recovery tips
- [ ] Logs scrub sensitive data (IMEI, serial optional masking in exports)
- [ ] Signed updates only
- [ ] Reproducible builds & dependency audits in CI

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Windows USB driver problems | High | Driver doctor tool, bundled driver links, clear diagnostics |
| Bricking devices | High | Pre-flight checks, hash verification, backups, confirmations, recovery guides |
| Antivirus false positives | High | Code signing, avoid packers/obfuscation, submit to vendors |
| Brand-specific protocol complexity | Medium | Modular backends; reuse proven open-source tools via sidecars |
| Legal exposure from bypass features | High | Exclude bypass tools; ownership confirmation; clear ToS |
| Scope creep | Medium | Strict phase gates; ship MVP at Phase 3 |
| Firmware/redistribution licensing | Medium | Don't bundle OEM firmware; user supplies files |

---

## 11. Definition of Done (per feature)

1. Works on a real device and the mock backend
2. Has error handling + user-friendly messages
3. Logged in terminal and job history
4. Unit/integration tests passing
5. UI reviewed in dark theme at 100% and 125% scaling
6. Documented in `docs/`

---

## 12. Immediate Next Steps (this week)

1. `pnpm create tauri-app` → choose **React + TypeScript**.
2. Add Tailwind + shadcn/ui; build the dark theme tokens above.
3. Drop `adb.exe`, `fastboot.exe` + DLLs into `src-tauri/binaries/` (named with target triple).
4. Implement a single Rust command `fastboot_getvar` that streams output to a terminal component.
5. Recreate the **Fastboot card + Terminal** from the screenshot as your first vertical slice.

---

## 13. Useful References

- Android platform-tools: <https://developer.android.com/tools/releases/platform-tools>
- Fastboot protocol docs: AOSP `fastboot/README.md`
- Tauri 2 docs (sidecars, updater, capabilities): <https://tauri.app>
- `nusb` crate (pure-Rust USB): <https://crates.io/crates/nusb>
- `adb_client` crate: <https://crates.io/crates/adb_client>
- `mtkclient` (open source MediaTek tooling): <https://github.com/bkerler/mtkclient>
- `libimobiledevice`: <https://libimobiledevice.org>
- `payload-dumper-go` / `payload_dumper` (OTA extraction)
