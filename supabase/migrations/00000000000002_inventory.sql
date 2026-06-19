-- Migration: Inventory Phase 3
-- 1. Tambah kolom is_active di products
ALTER TABLE public.products ADD COLUMN is_active boolean DEFAULT true;

-- 2. Tambah kolom notes di stock_movements untuk menyimpan alasan koreksi
ALTER TABLE public.stock_movements ADD COLUMN notes text;

-- 3. RPC: Create Product with Initial Stock (Atomic)
CREATE OR REPLACE FUNCTION public.fn_create_product_with_initial_stock(
  p_branch_id uuid,
  p_category_id uuid,
  p_barcode text,
  p_name text,
  p_description text,
  p_units jsonb, -- array of {name, conversion_to_base, is_base_unit, sell_price, buy_price}
  p_initial_stock integer,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id uuid;
  v_unit jsonb;
BEGIN
  -- Validate barcode if provided
  IF p_barcode IS NOT NULL AND p_barcode != '' THEN
    IF EXISTS (SELECT 1 FROM public.products WHERE barcode = p_barcode) THEN
      RAISE EXCEPTION 'BARCODE_ALREADY_EXISTS';
    END IF;
  ELSE
    p_barcode := NULL;
  END IF;

  -- Insert product
  INSERT INTO public.products (category_id, barcode, name, description, is_active)
  VALUES (p_category_id, p_barcode, p_name, p_description, true)
  RETURNING id INTO v_product_id;

  -- Insert units
  FOR v_unit IN SELECT * FROM jsonb_array_elements(p_units)
  LOOP
    INSERT INTO public.product_units (
      product_id, name, conversion_to_base, is_base_unit, sell_price, buy_price
    ) VALUES (
      v_product_id, v_unit->>'name', (v_unit->>'conversion_to_base')::integer,
      (v_unit->>'is_base_unit')::boolean, (v_unit->>'sell_price')::numeric,
      NULLIF(v_unit->>'buy_price', '')::numeric
    );
  END LOOP;

  -- Insert initial stock if > 0
  INSERT INTO public.product_stock (branch_id, product_id, quantity)
  VALUES (p_branch_id, v_product_id, COALESCE(p_initial_stock, 0));

  IF COALESCE(p_initial_stock, 0) > 0 THEN
    INSERT INTO public.stock_movements (
      branch_id, product_id, type, quantity_change, created_by, notes
    ) VALUES (
      p_branch_id, v_product_id, 'restock', p_initial_stock, p_user_id, 'Initial Stock Setup'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'product_id', v_product_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. RPC: Restock Product (Atomic)
CREATE OR REPLACE FUNCTION public.fn_restock_product(
  p_branch_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_product_unit_id uuid,
  p_quantity integer,
  p_buy_price numeric,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unit public.product_units%ROWTYPE;
  v_stock_record public.product_stock%ROWTYPE;
  v_quantity_base integer;
  v_restock_id uuid;
BEGIN
  -- Get unit conversion
  SELECT * INTO v_unit FROM public.product_units WHERE id = p_product_unit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SATUAN_TIDAK_DITEMUKAN'; END IF;

  v_quantity_base := p_quantity * v_unit.conversion_to_base;

  -- Insert restock
  INSERT INTO public.restocks (
    branch_id, supplier_id, product_id, product_unit_id, quantity, buy_price, date, created_by
  ) VALUES (
    p_branch_id, p_supplier_id, p_product_id, p_product_unit_id, p_quantity, p_buy_price, CURRENT_DATE, p_user_id
  ) RETURNING id INTO v_restock_id;

  -- Update stock
  SELECT * INTO v_stock_record FROM public.product_stock WHERE branch_id = p_branch_id AND product_id = p_product_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.product_stock SET quantity = quantity + v_quantity_base, updated_at = now() WHERE id = v_stock_record.id;
  ELSE
    INSERT INTO public.product_stock (branch_id, product_id, quantity) VALUES (p_branch_id, p_product_id, v_quantity_base);
  END IF;

  -- Log movement
  INSERT INTO public.stock_movements (
    branch_id, product_id, type, quantity_change, reference_id, created_by, notes
  ) VALUES (
    p_branch_id, p_product_id, 'restock', v_quantity_base, v_restock_id, p_user_id, 'Restock from Supplier'
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. RPC: Adjust Stock Manual (Atomic)
CREATE OR REPLACE FUNCTION public.fn_adjust_stock_manual(
  p_branch_id uuid,
  p_product_id uuid,
  p_new_quantity integer,
  p_reason text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_record public.product_stock%ROWTYPE;
  v_diff integer;
BEGIN
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'ALASAN_WAJIB_DIISI';
  END IF;

  SELECT * INTO v_stock_record FROM public.product_stock WHERE branch_id = p_branch_id AND product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.product_stock (branch_id, product_id, quantity) VALUES (p_branch_id, p_product_id, 0);
    v_diff := p_new_quantity;
  ELSE
    v_diff := p_new_quantity - v_stock_record.quantity;
  END IF;

  IF v_diff = 0 THEN
    RETURN jsonb_build_object('success', true, 'message', 'TIDAK_ADA_PERUBAHAN');
  END IF;

  -- Update stock
  UPDATE public.product_stock 
  SET quantity = p_new_quantity, updated_at = now() 
  WHERE branch_id = p_branch_id AND product_id = p_product_id;

  -- Log movement
  INSERT INTO public.stock_movements (
    branch_id, product_id, type, quantity_change, created_by, notes
  ) VALUES (
    p_branch_id, p_product_id, 'manual_correction', v_diff, p_user_id, p_reason
  );

  RETURN jsonb_build_object('success', true, 'diff', v_diff);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
