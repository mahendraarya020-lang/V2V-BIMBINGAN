# KONSEP VIDEO EXPLAINER (MAKSIMAL 2 MENIT)
**Judul Proyek:** Perancangan Sistem Simulasi Platooning Vehicle-to-Vehicle (V2V) Berbasis 5G  
**Durasi:** 120 Detik (2 Menit)  
**Target Audiens:** Penguji Capstone Design, Akademisi, dan Praktisi Intelligent Transportation System (ITS)

---

## Ringkasan Struktur Video
*   **0:00 - 0:30 (Hook & Latar Belakang):** Masa depan transportasi cerdas dan urgensi efisiensi energi serta keselamatan berkendara menggunakan konsep *vehicular platooning*.
*   **0:30 - 1:00 (Permasalahan):** Kerentanan platooning terhadap gangguan jaringan (*delay* & *packet loss*) yang memicu *string instability*, serta tingginya biaya & risiko pengujian fisik di lapangan.
*   **1:00 - 1:45 (Solusi & Demonstrasi Platform):** Memperkenalkan Web-Based Platooning Simulator dengan arsitektur terdistribusi, emulasi parameter jaringan 5G (URLLC), visualisasi 2D, dan kontrol CACC adaptif dengan fallback mekanis.
*   **1:45 - 2:00 (Outro / Kesimpulan):** Kontribusi ilmiah simulasi ini dalam menghadirkan ekosistem transportasi otonom masa depan yang aman dan teruji.

---

## Naskah Voiceover (VO) & Panduan Visual

### **BAGIAN 1: Hook & Latar Belakang (Detik 0:00 - 0:30)**
*   **Visual:**  
    *   Buka dengan judul dramatis: *"Masa Depan Transportasi Cerdas: V2V Platooning Berbasis 5G"*.
    *   Tampilkan screenshot **`1_login_page.png`** secara perlahan dengan efek *fade-in*, dilanjutkan dengan transisi ke **`2_dashboard_page.png`** untuk menunjukkan antarmuka sistem yang modern dan elegan.
*   **Voiceover (VO):**  
    *"Pernahkah Anda membayangkan konvoi kendaraan otonom bergerak selaras dengan jarak yang sangat rapat di jalan raya secara otomatis? Inilah 'Vehicular Platooning', pilar utama sistem transportasi cerdas masa depan. Dengan teknologi komunikasi Vehicle-to-Vehicle (V2V), konvoi ini mampu mengurangi hambatan udara, menghemat konsumsi bahan bakar, dan meningkatkan kapasitas jalan raya secara drastis."*

---

### **BAGIAN 2: Permasalahan (Detik 0:30 - 1:00)**
*   **Visual:**  
    *   Tampilkan cuplikan ilustrasi *outage* atau tabrakan beruntun (bisa menggunakan animasi 2D atau diagram).
    *   Soroti teks bertuliskan *"String Instability"* dengan warna merah mencolok di atas latar belakang gelap.
*   **Voiceover (VO):**  
    *"Namun, menjaga stabilitas konvoi bukanlah hal mudah. Gangguan sekecil apa pun pada transmisi data—seperti delay jaringan atau hilangnya paket data—dapat memperbesar spacing error secara berantai ke kendaraan belakang. Fenomena berbahaya ini disebut 'string instability' yang dapat memicu tabrakan beruntun yang fatal. Terlebih lagi, menguji performa V2V langsung di lapangan sangatlah mahal dan membahayakan keselamatan fisik."*

---

### **BAGIAN 3: Solusi & Demonstrasi Platform (Detik 1:00 - 1:45)**
*   **Visual:**  
    *   Tampilkan antarmuka simulasi menggunakan **`4_simulation_active.png`** dan **`5_simulation_running.png`**. 
    *   Soroti panel konfigurasi 5G di sebelah kiri (menunjukkan slider *Latency* dan *Packet Loss*).
    *   Zoom-in pada canvas visualisasi 2D di tengah, tunjukkan garis-garis konektivitas V2V (garis hijau/kuning putus-putus antar mobil) dan koneksi sinyal ke Roadside Unit (RSU).
    *   Tampilkan panel Telemetry HUD di sebelah kanan yang merekam secara real-time data kuantitatif seperti *String Stability Index* dan *Spacing Error*.
*   **Voiceover (VO):**  
    *"Untuk menjembatani tantangan tersebut secara aman dan akurat, kami merancang 'Platform Simulasi Platooning Interaktif Berbasis Arsitektur Client-Server'. Di sini, logika kalkulasi fisika di-render terpisah pada backend dengan siklus update super presisi 10 milidetik, sementara frontend menyajikan visualisasi 2D top-down yang interaktif. Dengan 5G Network Emulator terintegrasi, pengguna dapat menginjeksikan latensi dan packet loss secara dinamis guna memvalidasi ketahanan algoritma CACC di bawah standar ketat 5G URLLC secara real-time."*

---

### **BAGIAN 4: Outro & Kesimpulan (Detik 1:45 - 2:00)**
*   **Visual:**  
    *   Tampilkan screenshot **`3_settings_page.png`** yang memperlihatkan menu konfigurasi parameter platooning yang komprehensif.
    *   Tutup dengan logo Universitas Telkom, nama tim pengembang (Mahendra, Abduh, Zulfikar), dan teks penutup: *"Simulasi Aman, Transportasi Masa Depan"*.
*   **Voiceover (VO):**  
    *"Melalui platform simulasi ini, pengujian skenario lalu lintas ekstrem dan validasi keandalan sistem CACC dapat dilakukan secara aman, adaptif, dan murah. Proyek ini memberikan kontribusi ilmiah nyata bagi pengembangan transportasi otonom masa depan yang lebih aman dan terkoordinasi. Kami siap mewujudkan jalan raya yang lebih cerdas!"*

---

## Tips Pengambilan Gambar & Editing Video:
1.  **Gunakan Efek Zoom & Pan:** Jangan biarkan gambar mati. Ketika VO membicarakan tentang *5G Configuration*, lakukan zoom perlahan ke bagian slider input di sebelah kiri screenshot. Saat VO membahas *String Stability Index*, lakukan pan ke panel telemetri kanan.
2.  **Transisi Halus:** Gunakan transisi *slide* atau *smooth cross-dissolve* antar screenshot agar memberikan kesan modern dan premium.
3.  **Musik Latar Belakang (BGM):** Gunakan musik instrumental dengan tema *Corporate Tech*, *Modern Minimalist*, atau *Uplifting Ambient* yang bertempo sedang untuk memberikan kesan profesional dan ilmiah.
