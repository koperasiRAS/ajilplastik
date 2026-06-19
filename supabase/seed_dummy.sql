-- Seed Data untuk Testing POS
-- HANYA JALANKAN INI SEKALI UNTUK TESTING, JANGAN DI PRODUCTION!

DO $$ 
DECLARE 
  v_branch_id uuid;
  v_category_id uuid;
  v_product_id1 uuid;
  v_product_id2 uuid;
BEGIN
  -- Ambil cabang pertama yang ada
  SELECT id INTO v_branch_id FROM public.branches LIMIT 1;
  
  -- Jika belum ada cabang, buat satu
  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches (name, address) VALUES ('Ajil Plastik Pusat', 'Jl. Merdeka No. 1') RETURNING id INTO v_branch_id;
  END IF;

  -- Buat kategori
  INSERT INTO public.product_categories (name) VALUES ('Kantong Kresek') RETURNING id INTO v_category_id;

  -- Buat produk 1 (Kresek Hitam)
  INSERT INTO public.products (category_id, barcode, name, description) 
  VALUES (v_category_id, '11111', 'Kresek Hitam Besar', 'Kresek hitam ukuran 40x50')
  RETURNING id INTO v_product_id1;

  -- Satuan untuk produk 1 (Pcs sebagai base, Pak isi 50)
  INSERT INTO public.product_units (product_id, name, conversion_to_base, is_base_unit, sell_price)
  VALUES (v_product_id1, 'Pcs', 1, true, 500);

  INSERT INTO public.product_units (product_id, name, conversion_to_base, is_base_unit, sell_price)
  VALUES (v_product_id1, 'Pak', 50, false, 20000);

  -- Stok produk 1 (1000 Pcs = 20 Pak)
  INSERT INTO public.product_stock (branch_id, product_id, quantity)
  VALUES (v_branch_id, v_product_id1, 1000);

  -- Buat produk 2 (Gelas Plastik)
  INSERT INTO public.products (category_id, barcode, name, description) 
  VALUES (v_category_id, '22222', 'Gelas Plastik 16oz', 'Gelas plastik bening')
  RETURNING id INTO v_product_id2;

  -- Satuan untuk produk 2 (Dus isi 1000, Slop isi 50, Pcs isi 1)
  INSERT INTO public.product_units (product_id, name, conversion_to_base, is_base_unit, sell_price)
  VALUES (v_product_id2, 'Pcs', 1, true, 200);

  INSERT INTO public.product_units (product_id, name, conversion_to_base, is_base_unit, sell_price)
  VALUES (v_product_id2, 'Slop', 50, false, 9500);

  INSERT INTO public.product_units (product_id, name, conversion_to_base, is_base_unit, sell_price)
  VALUES (v_product_id2, 'Dus', 1000, false, 180000);

  -- Stok produk 2 (5000 Pcs = 5 Dus)
  INSERT INTO public.product_stock (branch_id, product_id, quantity)
  VALUES (v_branch_id, v_product_id2, 5000);

END $$;
