# Participant handout / Lembar peserta

## English (one page)

**What this is.** A simulator. You describe a crypto trading idea, review the exact rules, and test
them on historical Indodax data. It never places orders, asks for exchange keys, or holds funds.

**Your path**

1. Sign in with the account provided by the facilitator.
2. Open **Strategies → New strategy**.
3. Describe an idea, e.g. “Buy BTC when the 20 EMA crosses above the 50 EMA and sell on the reverse
   cross.” Choose BTC/IDR and 1h, then **Generate rules**.
4. Read the entry, exit, and risk rules in plain language. Change one value if you want.
5. Click **Save version**. A version never changes after it is saved.
6. Choose a date range (UTC), keep the default 20 bps fee and 5 bps slippage, and **Run backtest**.
7. Read: ending equity, net return, max drawdown, win rate, trades, profit factor.
8. Download the CSV or create a read-only share link.
9. Open **Learn** for metric definitions and limitations.

**Try this exercise**

- Start from the **EMA crossover** template.
- Run 2025-01-01 → 2025-07-01 and note net return and max drawdown.
- Save a new version with different EMA periods.
- Compare the two versions. Explain why the result changed.

**Remember**

- A backtest is a simulation, not a prediction.
- Fees, slippage, missing candles, and overfitting can change the conclusion.
- If a result looks too good, test a different range before trusting it.

---

## Bahasa Indonesia (satu halaman)

**Apa ini.** Alat simulasi. Anda menulis ide trading kripto, memeriksa aturan yang dihasilkan, lalu
mengujinya pada data historis Indodax. Alat ini tidak memasang order, tidak meminta API key bursa,
dan tidak menyimpan dana.

**Langkah Anda**

1. Masuk dengan akun dari fasilitator.
2. Buka **Strategies → New strategy**.
3. Tulis ide, misalnya “Beli BTC saat EMA 20 memotong ke atas EMA 50 dan jual saat memotong ke
   bawah.” Pilih BTC/IDR dan 1h, lalu **Generate rules**.
4. Baca aturan entry, exit, dan risiko dalam bahasa sederhana. Ubah satu nilai jika mau.
5. Klik **Save version**. Versi yang sudah disimpan tidak berubah.
6. Pilih rentang tanggal (UTC), biarkan fee 20 bps dan slippage 5 bps, lalu **Run backtest**.
7. Baca: ekuitas akhir, net return, max drawdown, win rate, transaksi, profit factor.
8. Unduh CSV atau buat tautan share hanya-baca.
9. Buka **Learn** untuk definisi metrik dan batasannya.

**Latihan**

- Mulai dari template **EMA crossover**.
- Jalankan 2025-01-01 → 2025-07-01 dan catat net return serta max drawdown.
- Simpan versi baru dengan periode EMA berbeda.
- Bandingkan kedua versi. Jelaskan mengapa hasilnya berubah.

**Ingat**

- Backtest adalah simulasi, bukan ramalan.
- Fee, slippage, candle yang hilang, dan overfitting dapat mengubah kesimpulan.
- Jika hasil terlihat terlalu bagus, uji rentang lain sebelum percaya.

**Glosarium:** EMA/SMA = rata-rata bergerak; RSI = osilator momentum 0–100; Bollinger = pita
volatilitas; drawdown = penurunan dari puncak ekuitas; slippage = selisih harga eksekusi; backtest =
simulasi pada data historis.
