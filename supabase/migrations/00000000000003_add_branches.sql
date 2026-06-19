-- Migration: Tambah Cabang Baru
-- Menambahkan cabang baru untuk keperluan testing multi-cabang

-- Menghapus cabang yang tadi tidak sengaja ditambahkan (jika sudah terlanjur di-run)
DELETE FROM public.branches WHERE name IN ('Cabang Pasar Baru', 'Cabang Timur');

-- Menambahkan hanya 1 cabang baru sesuai request
INSERT INTO public.branches (name, address) 
VALUES ('Cabang 1', 'BBM');
