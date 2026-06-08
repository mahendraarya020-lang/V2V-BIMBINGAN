# Perancangan Sistem Simulasi Platooning Vehicle-to-Vehicle (V2V) Berbasis 5G

Aplikasi Platform Simulasi 2D Interaktif *Client-Server* terintegrasi Emulator Jaringan 5G URLLC dan algoritma kontrol CACC/ACC. Proyek ini dikembangkan sebagai bagian dari Tugas Akhir (TA) untuk menguji kestabilan formasi barisan kendaraan (*vehicular platooning*) di bawah fluktuasi jaringan dinamis secara aman dan terukur.

---

## 📋 Informasi Akademik

* **Penulis**:
  1. Mahendra Aryaputra Fitrianto
  2. Muhammad Abduh
  3. Ahmad Zulfikar
* **Pembimbing**:
  1. Linea Meylani S.T., M.T.
  2. Ir. Uko Kurniawan Usman, M.T.
* **Afiliasi**: S1 Teknik Telekomunikasi, Fakultas Teknik Elektro, Telkom University

---

## 📝 Abstrak

Sistem *vehicular platooning* meningkatkan efisiensi lalu lintas melalui koordinasi otomatis, namun rentan terhadap fluktuasi *latency* dan *packet loss*. Guna menghindari bahaya pengujian fisik, penelitian ini merancang platform simulasi 2D interaktif *Client-Server* terintegrasi emulator 5G URLLC dan logika CACC. Platform ini memvalidasi keamanan formasi di bawah gangguan jaringan dinamis dan menampilkan analisis stabilitas secara *real-time*.

---

## 🔍 Latar Belakang & Masalah

### Latar Belakang
1. Perkembangan kendaraan otonom dan komunikasi *Vehicle-to-Vehicle* (V2V) merupakan fokus utama *Intelligent Transportation System* (ITS) modern.
2. Pengujian komunikasi V2V secara langsung di lapangan memakan biaya besar dan berisiko tinggi terhadap keselamatan fisik.
3. Teknologi 5G URLLC menjanjikan latensi rendah, namun implementasinya di jalan raya rentan terhadap gangguan jaringan yang memicu ketidakstabilan barisan (*string instability*).

### Rumusan Masalah
Bagaimana komunikasi V2V berbasis 5G memengaruhi kestabilan sistem kontrol *platooning*, serta bagaimana fungsi-fungsi di dalamnya dapat diintegrasikan agar tetap sinkron meskipun jaringan mengalami degradasi performa (latensi dan *packet loss*)?

### Tujuan
Mengembangkan platform pengujian (simulasi) yang mampu memvalidasi algoritma *Cooperative Adaptive Cruise Control* (CACC) dan protokol komunikasi V2V secara presisi, aman, dan terukur tanpa adanya risiko kerusakan fisik.

### Solusi yang Ditawarkan
**Platform Simulasi Platooning Interaktif Berbasis Arsitektur Client-Server**. Pendekatan ini memisahkan logika backend dengan visualisasi frontend guna menguji kinerja sistem secara aman dan terpadu.

---

## 🛠️ Arsitektur & Desain Sistem

```text
 ┌──────────────────────────────────────────────────────────────────┐
 │                         CLIENT (FRONTEND)                        │
 │  - Visualisasi 2D: Pergerakan Platoon Real-Time & Skala Akurat   │
 │  - Panel Konfigurasi: Kontrol Skenario, Gangguan 5G, Kecepatan   │
 │  - Telemetry HUD: Monitoring Kecepatan, Jarak, Jaringan & KPI    │
 └────────────────────────────────┬─────────────────────────────────┘
                                  │ (WebSocket - Socket.io)
                                  ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                        5G EMULATOR JARINGAN                      │
 │  - Network Delay (Latency Ms)                                    │
 │  - Packet Loss (PLR %)                                           │
 └────────────────────────────────┬─────────────────────────────────┘
                                  ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                         SERVER (BACKEND)                         │
 │  - Kontrol Platoon: CACC & ACC (PD+Feedforward)                  │
 │  - Model Kendaraan: Model Dinamika Kendaraan & Sensor            │
 │  - API & WebSocket: Komunikasi Real-Time                         │
 └────────────────────────────────┬─────────────────────────────────┘
                                  ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                        DATABASE & LOGGING                        │
 │  - Log Telemetri: Penyimpanan telemetri & performa jaringan      │
 │  - Analisis Stabilitas: Replay Skenario & Evaluasi Formasi       │
 └──────────────────────────────────────────────────────────────────┘
```

### Key Features
* **Real-Time Simulation**: Simulasi pergerakan platoon secara real-time dengan tickrate tinggi (~20 Hz).
* **5G Connectivity**: Simulasi redaman sinyal V2I/RSU dan emulasi *dynamic path loss* 3GPP.
* **Advanced Control**: Penerapan kontrol PD (*Proportional-Derivative*) dengan *feedforward* untuk meminimalkan *spacing error*.
* **Data Analytics**: Dashboard laporan analisis lengkap dengan String Stability Index (SSI), grafik kecepatan, dan data ekspor log simulasi.
* **Scalable System**: Arsitektur handal yang mendukung penambahan jumlah platoon dan kendaraan pengikut secara fleksibel.

---

## 💾 Struktur Folder Proyek

```text
TA/
  backend/          Express + Socket.IO simulation service (CACC/ACC physics engine)
  frontend/         React + Vite client app (Telemetry HUD & Roadway view)
  run.bat           Launcher lokal otomatis untuk OS Windows
  package.json      Root scripts untuk build, linting, dan start-up
```

---

## 🚀 Panduan Instalasi & Menjalankan Lokal

### 1. Prasyarat
Pastikan Anda sudah menginstal **Node.js (v18 ke atas)** di komputer Anda.

### 2. Instalasi Dependency
Instal seluruh package untuk root, frontend, dan backend dalam sekali jalan:
```bash
npm run install:all
```

### 3. Menjalankan Mode Development
Jalankan backend dan frontend secara bersamaan menggunakan terminal/file launcher:

* **Menggunakan Launcher (Windows)**:
  Cukup klik ganda pada file `run.bat` di root direktori.
  
* **Menggunakan Terminal Manual**:
  * Terminal 1 (Backend):
    ```bash
    npm run dev:backend
    ```
  * Terminal 2 (Frontend):
    ```bash
    npm run dev:frontend
    ```

Buka browser dan akses halaman utama di **`http://localhost:5173`**.

### 4. Build Production
Untuk mem-build versi optimal production:
```bash
npm run build
```
Hasil build frontend akan berada di `frontend/dist` dan backend di `backend/dist`.

---

## 📊 Detail Implementasi Teknis & Skenario Kontrol

* **Algoritma Kontrol**: Menggunakan kombinasi kontrol **PD + Feedforward (PD+FF)** pada kendaraan pengikut. Controller ini dirancang untuk mempertahankan jarak aman (*time headway*) dan meminimalkan *spacing error* terhadap kendaraan di depannya.
* **Fallback ACC**: Apabila koneksi mengalami gangguan berat (misal *packet loss* &ge; 15%), sistem CACC secara otomatis akan melakukan *fallback* ke mode ACC (sensor radar lokal) demi menjaga keselamatan konvoi.
* **Dynamic Path Loss (3GPP-inspired)**: 
  * Area Dekat ($d \le 50\text{m}$): *Packet loss* 0% (Near Zone).
  * Area Menengah ($50\text{m} < d < 300\text{m}$): *Packet loss* naik secara eksponensial dari 0% hingga 80%.
  * Area Luar ($d \ge 300\text{m}$): *Packet loss* konstan di 80%.
* **Konfigurasi RSU**: Tiang RSU diletakkan secara berkala setiap **500 meter** dengan jangkauan sinyal maksimal **300 meter**.

---

## 📝 Kesimpulan Hasil Penelitian
1. Platform simulasi 2D *client-server* sukses memvalidasi algoritma kontrol CACC secara aman, presisi, dan terukur.
2. Integrasi emulator 5G berhasil memetakan pengaruh degradasi jaringan (latensi & *packet loss*) terhadap stabilitas barisan (*string stability*).
3. Kontrol PD *feedforward* terbukti efektif meminimalkan *spacing error* platoon di bawah gangguan jaringan nirkabel dinamis.

---

## 📚 Daftar Pustaka
1. Y. Zhang, E. Li, X. Zhang, and Y. Zhao, "A Survey on Vehicular Platooning Communication, Control, and Applications," *IEEE Trans. Intell. Transp. Syst.*, vol. 22, no. 6, pp. 3311-3326, 2021.
2. J. Wang and H. Liang, "Performance Analysis of V2V Communication for Vehicle Platooning Applications," *IEEE Access*, vol. 8, pp. 44872-44884, 2020.
