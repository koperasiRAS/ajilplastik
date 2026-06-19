-- Menghapus semua transaksi di Cabang 1 yang terlanjur terbuat
DELETE FROM public.transactions 
WHERE branch_id IN (
  SELECT id FROM public.branches WHERE name = 'Cabang 1'
);

-- (Opsional) Mereset stok di Cabang 1 jika sempat minus akibat transaksi tes tersebut
UPDATE public.product_stock 
SET quantity = 0
WHERE branch_id IN (
  SELECT id FROM public.branches WHERE name = 'Cabang 1'
);

-- (Opsional) Menghapus riwayat pergerakan stok (stock_movements) di Cabang 1
DELETE FROM public.stock_movements
WHERE branch_id IN (
  SELECT id FROM public.branches WHERE name = 'Cabang 1'
);
