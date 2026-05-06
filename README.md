# V2V 5G Platooning Simulator

Aplikasi simulasi vehicular platooning berbasis React, Socket.IO, dan TypeScript. Frontend menampilkan dashboard, simulasi live, telemetry HUD, dan analysis report. Backend menjalankan emulasi CACC/ACC, gangguan jaringan, session history, dan real-time state streaming.

## Struktur

```text
TA/
  backend/          Express + Socket.IO simulation service
  frontend/         React + Vite client app
  run.bat           Launcher lokal Windows
  package.json      Root scripts untuk build/check/start
```

## Menjalankan Lokal

Install dependency:

```bash
npm run install:all
```

Terminal 1:

```bash
npm run dev:backend
```

Terminal 2:

```bash
npm run dev:frontend
```

Buka `http://localhost:5173`.

## Build Production

```bash
npm run check
```

Output frontend berada di `frontend/dist`, output backend berada di `backend/dist`.

## Deploy Single Service

Backend dapat men-serve hasil build frontend secara langsung.

```bash
npm run build
set NODE_ENV=production
set SERVE_STATIC=true
set FRONTEND_DIST_PATH=../frontend/dist
npm run start
```

Lalu buka `http://localhost:4000`.

## Environment

Frontend:

```text
VITE_BACKEND_URL=http://localhost:4000
```

Jika `VITE_BACKEND_URL` tidak diisi, frontend production otomatis memakai same-origin.

Backend:

```text
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=*
SERVE_STATIC=true
FRONTEND_DIST_PATH=../frontend/dist
SIM_TICK_MS=10
SIM_BROADCAST_MS=50
```

Contoh tersedia di `frontend/.env.example` dan `backend/.env.example`.

## Health Check

```text
GET /health
GET /api/status
```

`/health` dipakai untuk readiness check. `/api/status` memberi snapshot state simulasi aktif.

## Catatan Operasional

- History tersimpan di `backend/data/history.json`.
- Simulasi menyiarkan state sekitar 20 Hz secara default.
- Jika packet loss tinggi, controller otomatis fallback dari CACC ke ACC.
- Untuk deploy multi-service, set `CLIENT_ORIGIN` pada backend dan `VITE_BACKEND_URL` pada frontend sesuai domain masing-masing.
