# TMS Al-Haram — Android APK Build Guide

## Sebelum mulai, siapkan:
- Akun GitHub (gratis) → github.com
- Akun Expo (gratis) → expo.dev

---

## STEP 1 — Daftar & Setup Expo

1. Buka **expo.dev** → Sign Up (gratis)
2. Setelah login, buka: https://expo.dev/settings/access-tokens
3. Klik **"Create Token"** → beri nama "github-actions" → Copy token-nya
4. **Simpan token ini** — akan dipakai di Step 3

---

## STEP 2 — Upload ke GitHub

1. Buka **github.com** → login → klik **"New repository"**
2. Nama repo: `tms-alharam` → klik **"Create repository"**
3. Upload **semua file dari folder ini** ke repo tersebut:
   - Klik **"uploading an existing file"**
   - Drag semua file & folder ke sana
   - Klik **"Commit changes"**

---

## STEP 3 — Set Expo Token di GitHub

1. Di repo GitHub → klik **Settings** (tab atas)
2. Kiri: **Secrets and variables** → **Actions**
3. Klik **"New repository secret"**
4. Name: `EXPO_TOKEN`
5. Value: paste token dari Step 1
6. Klik **"Add secret"**

---

## STEP 4 — Update 2 hal sebelum build

### A. URL Netlify di app/index.tsx
Buka file `app/index.tsx`, cari baris:
```
source={{ uri: "https://YOUR-NETLIFY-URL.netlify.app" }}
```
Ganti dengan URL Netlify TMS kamu yang sebenarnya.

### B. EAS Project ID di app.json
1. Login ke expo.dev → buka project `tms-alharam`
2. Copy Project ID
3. Buka `app.json`, ganti `YOUR_EAS_PROJECT_ID` dengan ID tersebut

---

## STEP 5 — Trigger Build

1. Di GitHub repo → klik tab **"Actions"**
2. Klik **"Build TMS Android APK"**
3. Klik **"Run workflow"** → **"Run workflow"**
4. Tunggu ~15-20 menit

---

## STEP 6 — Download APK

1. Buka **expo.dev** → login → Projects → tms-alharam → Builds
2. Klik build yang selesai
3. Klik **"Download"** → dapat file `.apk`
4. Kirim ke HP driver via WhatsApp/email → Install

---

## Cara install APK di HP driver:

1. Terima file APK via WA
2. Buka file → mungkin muncul warning "Install from unknown sources"
3. Settings → Allow from this source → Install
4. Buka app **TMS Al-Haram**
5. Saat pertama buka → izinkan Location **"Allow all the time"** (WAJIB)

---

## Kenapa APK ini lebih baik dari browser?

| | Browser PWA | APK ini |
|--|--|--|
| GPS saat buka WA | ❌ Mungkin mati | ✅ 100% jalan |
| GPS saat nonton YouTube | ❌ Mungkin mati | ✅ 100% jalan |
| GPS saat layar mati | ⚠️ Tidak stabil | ✅ 100% jalan |
| Notifikasi GPS aktif | ❌ Tidak ada | ✅ Ada di status bar |

APK menggunakan **Android ForegroundService** — GPS dijamin jalan
meski driver buka app apapun atau layar mati.
