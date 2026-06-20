-- ==============================================================================
-- SCRIPT RESET DATABASE (MENGHAPUS DATA DUMMY / TRANSAKSI)
-- ==============================================================================
-- CARA PENGGUNAAN:
-- 1. Buka Supabase Dashboard > SQL Editor
-- 2. Buat "New Query"
-- 3. Copy-Paste semua kode di file ini ke editor tersebut
-- 4. Klik "Run"
--
-- EFEK DARI SCRIPT INI:
-- - Menghapus SEMUA riwayat Transaksi Penjualan
-- - Menghapus SEMUA riwayat Buka Laci Kasir
-- - Menghapus SEMUA riwayat Pemasukan (Incomes) & Pengeluaran (Expenses)
-- - Menghapus SEMUA riwayat Restok & Pergerakan Stok
-- - Mereset SEMUA Stok Produk kembali menjadi 0
-- 
-- YANG TIDAK DIHAPUS (TETAP AMAN):
-- - Data Produk, Kategori, dan Satuan (Barcode, Harga, dll)
-- - Data Cabang & Profil Pengguna / Karyawan
-- ==============================================================================

BEGIN;

-- 1. Hapus data transaksi (Penjualan)
DELETE FROM public.transaction_items;
DELETE FROM public.transactions;

-- 2. Hapus data pergerakan stok & restok
DELETE FROM public.stock_movements;
DELETE FROM public.restocks;

-- 3. Hapus log laci kasir
DELETE FROM public.cash_drawer_logs;

-- 4. Hapus data keuangan lainnya
-- Disable trigger pembatas waktu 24 jam sementara
ALTER TABLE public.expenses DISABLE TRIGGER trg_expenses_time_limit;
ALTER TABLE public.incomes DISABLE TRIGGER trg_incomes_time_limit;

DELETE FROM public.expenses;
DELETE FROM public.incomes;

-- Enable trigger kembali
ALTER TABLE public.expenses ENABLE TRIGGER trg_expenses_time_limit;
ALTER TABLE public.incomes ENABLE TRIGGER trg_incomes_time_limit;

-- 5. Reset semua kuantitas stok barang menjadi 0
UPDATE public.product_stock SET quantity = 0;

COMMIT;

-- ==============================================================================
-- (OPSIONAL) JIKA INGIN MENGHAPUS SEMUA DATA PRODUK JUGA (BENAR-BENAR KOSONG)
-- Jika ingin menghapus produk, blok kode di bawah ini, lalu jalankan.
-- ==============================================================================
/*
BEGIN;
DELETE FROM public.product_stock;
DELETE FROM public.product_units;
DELETE FROM public.products;
DELETE FROM public.categories;
COMMIT;
*/
