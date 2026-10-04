# Rencana: Login GitHub per user + semua menu berfungsi

## Yang akan dibuat (bahasa sederhana)

**1. Masuk dengan GitHub, satu klik**
- Pengunjung baru melihat halaman sambutan dengan satu tombol: **"Masuk dengan GitHub"**.
- Klik, lalu jendela GitHub terbuka, user menyetujui, dan langsung masuk. Tidak ada email/password yang perlu diisi.
- Aplikasi mengingat user di perangkat itu, jadi kunjungan berikutnya langsung masuk.
- Tiap user hanya melihat dan push ke repo miliknya sendiri. Koneksi ke akun GitHub kamu yang sekarang diputus dari aplikasi.
- Ada tombol **Keluar** dan **Putuskan GitHub** di Pengaturan.

**2. Semua menu berfungsi**
- **Beranda**: ringkasan akun, repo terbaru, commit terbaru, dan tombol Push (seperti sekarang, tapi memakai data user yang masuk).
- **Proyek**: daftar semua repo dengan pencarian, filter publik/privat, buka di GitHub, dan tombol "Push ke repo ini". Ditambah tombol **Buat repo baru** (nama, deskripsi, privat/publik).
- **Riwayat**: semua push yang dilakukan lewat aplikasi (pesan, repo, branch, jumlah file, waktu, dan link ke commit), tersimpan permanen.
- **Pengaturan**: profil GitHub, pilihan branch tujuan default, keluar, dan putuskan GitHub.
- **Kotak pencarian** di atas: mencari repo dan langsung membuka hasilnya.
- **Lonceng notifikasi**: menampilkan push terakhir yang berhasil atau gagal.
- **Wizard push**: bisa memilih branch (bukan hanya branch utama) dan membuat repo baru langsung dari wizard.

## Yang perlu kamu lakukan (satu kali)
Buat **GitHub OAuth App** di https://github.com/settings/developers dengan:
- Authorization callback URL: `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`
- Lalu masukkan Client ID dan Secret ke form yang muncul di chat (saya pandu langkahnya).

## Detail teknis
- Aktifkan Lovable Cloud. Sesi aplikasi dibuat otomatis tanpa terlihat (anonymous sign-in), dipakai sebagai identitas user; koneksi GitHub diikat ke user id itu. Tidak ada login email.
- App User Connector `github` (scope `read:user`, `repo`): popup OAuth, lalu exchange code di server, kunci `lovack_*` disimpan terenkripsi (AES-GCM) di tabel `app_user_connections` (hanya service_role).
- Tabel `push_history` (user_id, repo, branch, message, file_count, commit_url, status, created_at) dengan RLS per user dan GRANT ke authenticated.
- Semua panggilan GitHub lewat server function dengan `requireSupabaseAuth` + `callAsAppUser`; standard connector `github` di-disconnect.
- Route baru: `/projects`, `/history`, `/settings`, `/oauth/github/return`; sidebar memakai `Link` dengan state aktif. Layout bersama dipindah ke `__root`.
- Perbaiki error tipe yang sudah ada di `errorComponent` pada `__root.tsx`.
- Batasan: kalau user ganti perangkat atau menghapus data browser, cukup klik "Masuk dengan GitHub" lagi; riwayat push lama terikat ke sesi sebelumnya.
