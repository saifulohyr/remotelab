# 🚀 SIMLab (RemoteLab) — Session Handoff & Progress Report

> **Last Updated**: 2026-10-17 15:45 (WIB / UTC+7)  
> **Purpose**: Complete context snapshot and resume guide for continuing this project in a new chat session or on another device.

---

## 📌 1. Project Overview & Architecture

SIMLab is a centralized remote laboratory management and monitoring system for university/school computer labs (6 labs, 180 PCs total).

```
                      ┌─────────────────────────────────────────┐
                      │            Mosquitto MQTT               │
                      │         (1883 TCP / 8883 TLS)           │
                      └────▲─────────────────▲───────────────▲──┘
                           │                 │               │
            telemetry/status/ack      dispatch cmd      wake command
                           │                 │               │
                 ┌─────────┴────────┐ ┌──────┴─────┐  ┌──────┴───────┐
                 │    Go Agent      │ │ Go Worker  │  │   Go Relay   │
                 │  (per PC client) │ │ (ingestion)│  │ (WoL daemon) │
                 └──────────────────┘ └──────┬─────┘  └──────┬───────┘
                                             │ HTTP notify   │ WoL Magic Packet
                                             ▼               ▼
                                    ┌──────────────────┐  [PC NICs]
                                    │ Laravel 11/13    │
                                    │ Backend REST API │
                                    └────────▲─────────┘
                                             │ REST / Sanctum
                                    ┌────────┴─────────┐
                                    │    Dashboard     │
                                    │ (Vite / Vanilla) │
                                    └──────────────────┘
```

---

## 💻 2. System Environment & Credentials

- **Host Machine**: Ubuntu Linux (noble) x86_64
- **System User**: `sir`
- **Sudo Password**: `sir999`
- **PHP**: PHP 8.3.6 (with `pdo_sqlite`, `sqlite3`, `curl`, `mbstring`, `pdo_mysql`, `openssl`)
- **Go**: `go1.22.2 linux/amd64`
- **Broker**: Mosquitto MQTT & `mosquitto-clients` installed
- **Database**: SQLite (`server/database/database.sqlite`)

### 🔑 Seeded Accounts (Ready to use)
| Role | Email | Password | Access Scope |
|------|-------|----------|--------------|
| **Superadmin** | `admin@simlab.local` | `password` | All 6 Labs, All PCs, All Commands |
| **Operator 1** | `op1@simlab.local` | `password` | Lab Komputer 1, 2, 3 |
| **Operator 2** | `op2@simlab.local` | `password` | Lab Komputer 4, 5, 6 |

### 🔑 Shared Tokens & Environment
- **Laravel `.env` Location**: `/home/sir/remotelab/server/.env`
- **Internal API Token**: Configured in `.env` as `INTERNAL_API_TOKEN=simlab-secret-internal-token-change-in-production`
- **Database Driver**: `DB_CONNECTION=sqlite`

---

## 📊 3. Implementation Status By Component

### ✅ A. Go Agent (`agent/`) — 100% Core Complete
- **Path**: `/home/sir/remotelab/agent`
- **Features**:
  - Telemetry collection: CPU usage, RAM usage, storage/disk, uptime, logged-in user.
  - MQTT Client with TLS support, automatic reconnection, and LWT (`simlab/labs/{lab}/pcs/{pc}/status` -> `offline`).
  - Command execution handler: Anti-replay timestamp check, TTL expiration, command whitelist (`shutdown`, `restart`, `lock`, `logoff`, `cancel_shutdown`, `message`, `exec_script`).
  - Windows API execution (`internal/winapi/windows.go`) with fallback Linux stubs (`internal/winapi/stubs_linux.go`).
  - Windows Service installer / runner support.
  - Precompiled binary ready: `agent/simlab-agent`.

### ✅ B. Go WoL Relay (`relay/`) — 100% Core Complete
- **Path**: `/home/sir/remotelab/relay`
- **Features**:
  - WoL Magic Packet generation and broadcast over UDP port 9.
  - Anti-surge stagger delay (`delay_between_pc_ms: 1500ms`) and retry logic.
  - MQTT subscriber for wake requests (`simlab/labs/{lab}/relay/wake`).
  - Wake acknowledgment reporting back to MQTT broker.
  - Heartbeat status loop (`heartbeat_sec: 30s`).
  - Precompiled binary ready: `relay/simlab-relay`.

### ✅ C. Go MQTT Worker (`worker/`) — 100% Core Complete
- **Path**: `/home/sir/remotelab/worker`
- **Features**:
  - MQTT subscriber subscribing to telemetry (`simlab/labs/+/pcs/+/telemetry`), status, command acknowledgments, and relay events.
  - Batch telemetry buffer and periodic database flush.
  - Background offline detection loop (marks PC offline if no telemetry received within threshold).
  - Laravel HTTP notifier (`POST /api/internal/broadcast`) forwarding critical events.
  - Precompiled binary ready: `worker/simlab-worker`.

### ✅ D. Mosquitto MQTT Broker (`mosquitto/`) — 100% Configured
- **Path**: `/home/sir/remotelab/mosquitto`
- **Configs**:
  - `mosquitto/mosquitto.conf`: TCP listener (1883), TLS listener (8883), authentication & ACL enablement.
  - `mosquitto/acl.conf`: Strict topic isolation for agents (`agent-%u`), relays (`relay-%u`), and full access for worker & server.

### ✅ E. Laravel Backend API (`server/`) — 100% Backend Complete & Tested
- **Path**: `/home/sir/remotelab/server`
- **Database**: Migrated and seeded (`php artisan migrate:fresh --seed` executed cleanly).
  - 1 Superadmin, 2 Operators.
  - 6 Labs (`Lab Komputer 1` to `6`).
  - 180 PCs (`LAB1-PC01` ... `LAB6-PC30`), MAC addresses, IPs, initial status `unknown`.
  - 36 default schedules (Mon–Fri 07:30–17:00, Sat 07:30–12:00).
- **Installed Packages**: `laravel/sanctum` installed and configured.
- **Models Implemented**:
  - `User`, `Lab`, `Pc`, `Metric`, `MetricMinute`, `PowerEvent`, `CommandLog`, `CommandResult`, `Schedule`, `ScheduleException`, `Notification`.
- **Middleware Implemented**:
  - `EnsureRole` (role validation: superadmin, operator).
  - `EnsureLabAccess` (checks operator lab assignment pivot).
- **Services**:
  - `MqttPublisher` (`app/Services/MqttPublisher.php`): Dispatches MQTT commands to agents/relays via `mosquitto_pub`.
- **API Endpoints (29 Routes)**:
  - `POST /api/login` — Sanctum authentication (returns Bearer token).
  - `POST /api/logout` — Revokes current token.
  - `GET /api/me` — Authenticated user info & assigned lab IDs.
  - `GET /api/labs` — Labs listing with live PC status counts (online, offline, busy, error).
  - `GET /api/labs/{id}` — Lab details + all PCs with latest status.
  - `GET /api/labs/{id}/pcs` — PCs in lab.
  - `GET /api/pcs/{id}` — PC detail with latest telemetry metric.
  - `GET /api/pcs/{id}/metrics` — Historical metric timeseries (smart raw vs minute rollup).
  - `GET /api/pcs/{id}/events` — Power events history.
  - `GET /api/commands` — Command logs with filtering.
  - `POST /api/commands` — Issue command to single PC, entire Lab, or All Labs.
  - `GET /api/commands/{id}` — Command status and per-PC results.
  - `GET /api/commands/export` — Export command logs to CSV.
  - `GET /api/labs/{id}/schedules` — Weekly schedules.
  - `POST /api/labs/{id}/schedules` — Save schedules.
  - `GET /api/labs/{id}/schedule-exceptions` — Holiday / special date overrides.
  - `POST /api/labs/{id}/schedule-exceptions` — Add schedule exception.
  - `GET /api/notifications` — Notification list.
  - `POST /api/notifications/read-all` — Mark all read.
  - `POST /api/internal/broadcast` — Internal worker event ingestion endpoint.

### ⏳ F. Dashboard Frontend (`dashboard/`) — Ready to Build
- **Path**: `/home/sir/remotelab/dashboard`
- **Status**: Not started yet. Ready to build with modern, sleek dark-mode UI.

---

## 🏃 4. How to Run & Verify the System

### 1. Start Mosquitto MQTT Broker (if not running as service)
```bash
# Check status:
sudo systemctl status mosquitto
# Or run with project config:
mosquitto -c /home/sir/remotelab/mosquitto/mosquitto.conf -v
```

### 2. Start Laravel API Server
```bash
cd /home/sir/remotelab/server
php artisan serve --host=127.0.0.1 --port=8000
```

### 3. Test API Authentication (via curl)
```bash
# Login as admin:
curl -s -X POST http://127.0.0.1:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@simlab.local","password":"password"}'

# Response contains: {"token":"1|xxx...","user":{"id":1,"name":"Admin SIMLab","role":"superadmin"}}

# Fetch Labs with token:
curl -s -X GET http://127.0.0.1:8000/api/labs \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Accept: application/json"
```

### 4. Run Go Components
```bash
# Worker:
cd /home/sir/remotelab/worker
./simlab-worker -config config.yaml

# Relay:
cd /home/sir/remotelab/relay
./simlab-relay -config config.yaml

# Agent:
cd /home/sir/remotelab/agent
./simlab-agent -config config.yaml
```

### 5. Quick One-Line Health Check (Run anytime to verify backend & binaries)
```bash
cd /home/sir/remotelab/server && php -r "require 'vendor/autoload.php'; \$app = require_once 'bootstrap/app.php'; \$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); echo '✅ DB Healthy! Labs: ' . App\Models\Lab::count() . ', PCs: ' . App\Models\Pc::count() . PHP_EOL;" && ls -lh /home/sir/remotelab/{agent,relay,worker}/simlab-*
```

---

## 📋 5. Unsolved Tasks & Detailed Next Plan (What Needs to be Built Next)

Below is the complete, granular task list of what **has not been implemented yet**. When opening a new session, follow this step-by-step roadmap:

---

### ✅ Phase 1: Dashboard Frontend (`dashboard/` directory) [SELESAI]
Direktori dashboard selesai dibangun menggunakan React + Vite + Tailwind CSS + Framer Motion (Style referensi: Dashboard V14 — Modern & Minimal UI oleh @code.xr).

- [x] **1.1 Project Setup & Base Design System**:
  - Vite + React + Tailwind CSS v4 di `dashboard/`.
  - Desain minimal white/off-white, tabular numerals, shadcn/ui style idiom, Framer Motion two-level stagger fade-up dan scroll reveal `whileInView`.
- [x] **1.2 Authentication & State Management**:
  - Login modal/view, token Bearer Sanctum, remember me, user profile context, auto fallback mock demo.
- [x] **1.3 Lab Monitoring Matrix View**:
  - Tab switcher Lab 1–6, grid 30 PC per lab, color badges (online hijau, offline abu-abu, booting kuning, alert merah).
- [x] **1.4 PC Detail & Telemetry Modal**:
  - Drawer modal dengan live gauges (CPU %, RAM %, Disk %), host/IP/MAC info, riwayat event daya.
- [x] **1.5 Remote Command Control Center**:
  - Toolbar aksi cepat & modal kirim pesan, timer safeguard konfirmasi 5 detik untuk aksi massal.
- [x] **1.6 Schedule Management UI**:
  - Editor jadwal mingguan buka/tutup jam lab + exception hari libur/cuti.
- [x] **1.7 Audit Logs & History View**:
  - Tabel riwayat perintah dengan pagination, status badge, modal rincian eksekusi, tombol export CSV.
- [x] **1.8 Notification Center**:
  - Dropdown lonceng notifikasi di Topbar + unread count badge + mark all as read.

---

### ✅ Phase 2: Live Real-Time Data Sync [SELESAI]
- [x] **2.1 Frontend Sync Mechanism**:
  - Smart polling interval di `dashboard/` (4 detik untuk PC aktif, 10 detik notifikasi).
  - Otomatis jeda/pause saat tab browser tidak aktif (`document.hidden`).
  - Indikator pulse realtime di Topbar dengan toggle pause/resume.
  - Fitur live instant search filter tanpa jeda render.

---

### ✅ Phase 3: Automated Scheduler Daemon [SELESAI]
- [x] **3.1 Artisan Schedule Checker Command**:
  - Dibuat `app/Console/Commands/CheckLabSchedules.php` (`php artisan simlab:check-schedules`).
  - Evaluasi tanggal hari ini, cek libur `schedule_exceptions`, eksekusi WoL via Relay dan Shutdown via MQTT.
- [x] **3.2 Cron / Daemon Execution**:
  - Didaftarkan di `routes/console.php` berjalan tiap menit (`Schedule::command('simlab:check-schedules')->everyMinute();`).
  - Siap dijalankan via Linux crontab (`* * * * * cd /path/to/server && php artisan schedule:run >> /dev/null 2>&1`).

---

### ✅ Phase 4: End-to-End System Integration Testing [SELESAI]
- [x] **4.1 Local Simulated Agent Test**:
  - Mosquitto broker aktif di `127.0.0.1:1883`.
  - Worker daemon berjalan (`simlab-worker`).
  - Agent berjalan (`simlab-agent`), publish data CPU, RAM, Disk, Uptime setiap 15 detik.
  - Data telemetry berhasil di-ingest ke tabel `metrics` MySQL dan status `LAB1-PC01` terupdate `online`.
- [x] **4.2 WoL Wake Dispatch Test**:
  - Relay daemon berjalan (`simlab-relay`) subscribe ke `simlab/lab1/relay/wake`.
  - Perintah wake diterima dan diproses oleh daemon relay.

---

## 🎯 6. Quick Prompt to Resume in Next Session

Copy and paste this prompt when starting your new chat session:

```text
Please read the file `SESSION_HANDOFF.md`. 
The database, Laravel API backend, and Go daemons are already 100% complete. 
Please start with "Phase 1: Dashboard Frontend" in `dashboard/` following the tasks outlined in Section 5 of `SESSION_HANDOFF.md`.
```

---
*Generated by Antigravity AI pair programmer on 2026-10-17.*
