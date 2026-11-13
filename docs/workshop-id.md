# Panduan fasilitator workshop (Bahasa Indonesia)

Produk: **Quantify — AI Trading Strategy Lab** (nama sementara).
Peserta: komunitas kripto BlockDev.id, campuran trader dan pemula.
Durasi: 3 jam untuk trader, 4 jam untuk pemula. Tanggal, jumlah peserta, ketersediaan laptop,
kualitas internet, dan akses pasca-acara **masih perlu dikonfirmasi dengan BlockDev.id**.

## Alur inti

Tulis ide → hasilkan aturan terstruktur → tinjau/ubah → validasi → simpan versi tetap → jalankan
backtest deterministik → baca metrik, transaksi, asumsi, dan peringatan → iterasi.

Semua hanya simulasi. Tidak ada API key bursa, order live, kustodi dana, leverage, atau shorting.
Bukan nasihat investasi.

## Persiapan H-1

1. Pastikan domain HTTPS terbuka dan `/api/health` mengembalikan `status: ok`.
2. Cek `/api/ready` dan `/api/health/market-data`: keempat seri harus `workshopRangeCovered: true`.
3. Jalankan `bun run data:verify` dan simpan hasilnya.
4. Jalankan `bun run ai-preflight -- --probe` bila memakai model live; fallback template tetap aktif.
5. Masuk sebagai user demo dan jalankan backtest demo yang sudah terbukti.
6. Buka tautan share di jendela privat; pastikan tidak ada data akun.
7. Simpan salinan snapshot `tests/fixtures/market-data/workshop/` untuk mode offline.
8. Siapkan tangkapan layar hasil demo sebagai fallback terakhir.

Kredensial demo dibuat oleh `scripts/seed.ts`:

```bash
DEMO_EMAIL=demo@quantify.local
DEMO_PASSWORD=workshop-demo-2026   # ganti sebelum acara; jangan commit nilai asli
```

Akun demo diberi label **Demo account** di antarmuka.

## Demo yang sudah terbukti

1. Masuk sebagai user demo.
2. Buka **Strategies → RSI mean reversion**.
3. Buka versi 1, pilih rentang **2025-01-01 → 2025-07-01** (UTC).
4. Modal awal 10.000.000 IDR, fee 20 bps, slippage 5 bps, eksekusi next candle open.
5. Jalankan. Pada snapshot yang di-commit, hasilnya **+2,82%**, **23 transaksi**, **max drawdown 16,65%**, ekuitas akhir
   sekitar 10,28 juta IDR, dengan grafik ekuitas dan drawdown.
6. Tunjukkan asumsi, peringatan, lalu bandingkan dengan template EMA untuk memperlihatkan bahwa
   aturan berbeda menghasilkan hasil berbeda.

Hasil ini hanya berlaku untuk rentang dan snapshot tersebut. Jangan menyebutnya sebagai ekspektasi
keuntungan masa depan.

## Saran alur 3 jam

| Waktu     | Bagian          | Aktivitas                                           |
| --------- | --------------- | --------------------------------------------------- |
| 0:00–0:15 | Kerangka        | Trading sistematis vs diskresioner; batas simulasi  |
| 0:15–0:35 | Tur produk      | Dashboard, template, `/learn`, definisi metrik      |
| 0:35–1:05 | Build terpandu  | Generate EMA crossover, tinjau aturan dan asumsi    |
| 1:05–1:25 | Edit + validasi | Ubah periode, simpan v2, jelaskan versi tetap       |
| 1:25–1:55 | Backtest        | Pilih rentang; baca fee, drawdown, transaksi; CSV   |
| 1:55–2:10 | Istirahat       | —                                                   |
| 2:10–2:40 | Perbandingan    | v1 vs v2; backtest bukan janji                      |
| 2:40–3:00 | Build mandiri   | Peserta membuat satu strategi; fasilitator membantu |

Untuk pemula, tambahkan 45 menit sebelum build terpandu untuk membaca `/learn` dan latihan kertas
tentang entry, exit, dan ukuran posisi.

## Pemecahan masalah

| Gejala                                        | Kemungkinan penyebab            | Tindakan                                         |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| “Range is outside the workshop data snapshot” | Snapshot hilang/kedaluwarsa     | Pakai mode fixture; verifikasi manifest          |
| Backtest tertahan QUEUED                      | Worker mati atau antrean macet  | Cek `/api/health/queue`; restart worker          |
| Backtest FAILED `DATA_QUALITY_GAP`            | Data live punya gap besar       | Pakai rentang snapshot atau rentang lebih pendek |
| Generate memakai asumsi template              | Provider AI mati / tanpa key    | Fallback normal; lanjut dengan template          |
| 429                                           | Batas per pengguna              | Tunggu sesuai pesan; gunakan template            |
| 503 pada `/api/ready`                         | Database/fixture tidak tersedia | Ikuti daftar fallback; gunakan tangkapan layar   |

## Tangga fallback

1. **AI mati** → template otomatis; jangan menunggu.
2. **Indodax mati** → snapshot fixture; jalankan API dengan `MARKET_DATA_MODE=fixture`.
3. **Database/worker mati** → gunakan hasil demo yang sudah dijalankan dan tautan share; beralih ke
   tangkapan layar.
4. **Platform mati total** → presentasi dari tangkapan layar dan latihan kertas.

## Yang perlu dikatakan tentang data dan risiko

- Data: Indodax BTC/IDR dan ETH/IDR, 1h/4h, 2025-01-01 sampai 2026-06-30 UTC.
- Gap tidak pernah diisi; candle volume nol tetap disimpan.
- Fee dan slippage adalah asumsi. Eksekusi nyata bisa lebih buruk.
- Satu backtest in-sample adalah hipotesis, bukan bukti keuntungan masa depan.
- Alat ini tidak bisa memasang order atau menyimpan dana.

## Glosarium singkat

- **EMA / SMA** — rata-rata bergerak eksponensial / sederhana.
- **RSI** — osilator momentum 0–100.
- **Bollinger Bands** — pita volatilitas di sekitar rata-rata.
- **Entry / exit** — aturan beli dan jual.
- **Slippage** — selisih harga eksekusi dari asumsi.
- **Drawdown** — penurunan dari puncak ekuitas.
- **Profit factor** — laba kotor dibagi kerugian kotor absolut.
- **Backtest** — simulasi aturan pada data historis.

## Setelah acara

Pertahankan akses akun sesuai kesepakatan dengan BlockDev.id. Tinjau metrik aktivasi dan retensi.
Arsipkan snapshot dan bukti rilis bersama tag rilis. Lihat `docs/post-workshop.md`.
